// How a due reminder reaches the user. Each channel gets the user and the reminders due for them in this run.
const { sendMail } = require('./mailer');
const { formatDay, formatTime } = require('./dates');
const { unsubscribeToken } = require('./unsubscribe');
const { EMAIL_GAP_MS, EMAILS_PER_DAY } = require('./emailLimits');
const webPush = require('./webPush');

const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// "09:00", "Tomorrow 09:00", or "due Today" for a task with only a due date.
function whenText(task, reminder, timeZone, now) {
  const at = task.schedule?.start ?? null;
  if (at) {
    const day = formatDay(at, timeZone, now);
    return day === 'Today' ? formatTime(at, timeZone) : `${day} ${formatTime(at, timeZone)}`;
  }
  if (task.dueDate) return `due ${formatDay(task.dueDate, timeZone, now)}`;
  return formatTime(reminder.remindAt, timeZone);
}

function buildReminderEmail(user, items, now = new Date()) {
  const timeZone = user.timeZone || 'UTC';
  const lines = items.map(({ task, reminder }) => {
    const project = task.project?.name ? ` · ${task.project.name}` : '';
    return { when: whenText(task, reminder, timeZone, now), text: `${task.title}${project}` };
  });
  const single = items.length === 1;
  const unsubscribeUrl = `${appUrl()}/notifications/unsubscribe/${unsubscribeToken(user._id)}`;

  return {
    to: user.email,
    subject: single ? `Reminder: ${items[0].task.title} · ${lines[0].when}` : `Reminder: ${items.length} things coming up`,
    heading: single ? `${items[0].task.title}` : `${items.length} things are coming up`,
    paragraphs: lines.map((line) => `${line.when} · ${line.text}`),
    action: single
      ? { label: 'Open task', url: `${appUrl()}/tasks/${items[0].task._id}` }
      : { label: 'Open Agendal', url: `${appUrl()}/today` },
    footnote: `You get this because email reminders are on. Reminders due together come in one email, at most 1 every ${EMAIL_GAP_MS / 60_000} minutes and ${EMAILS_PER_DAY} a day.`,
    footerLinks: [
      { label: 'Turn off email reminders', url: unsubscribeUrl },
      { label: 'Notification settings', url: `${appUrl()}/settings/notifications` },
    ],
    // RFC 8058 one-click unsubscribe: Gmail and others show their own "Unsubscribe" button.
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

async function email(user, items, now) {
  await sendMail(buildReminderEmail(user, items, now));
}

// One notification per task, to every browser the user turned notifications on in (public/sw.js shows it, and a
// click opens the task). The tag means a second reminder for the same task replaces the first instead of stacking.
function buildReminderPush(user, { task, reminder }, now = new Date()) {
  const project = task.project?.name ? ` · ${task.project.name}` : '';
  return {
    title: task.title,
    body: `${whenText(task, reminder, user.timeZone || 'UTC', now)}${project}`,
    url: `/tasks/${task._id}`,
    tag: `task-${task._id}`,
  };
}

// Without VAPID keys (services/webPush.js) push reminders are only logged. Returns how many browsers got them.
async function push(user, items, now) {
  let browsers = 0;
  for (const item of items) {
    if (!webPush.isConfigured()) console.log(`[push] to ${user.email}: ${item.task.title}`);
    else browsers = Math.max(browsers, await webPush.sendToUser(user._id, buildReminderPush(user, item, now)));
  }
  return browsers;
}

// Habit reminders (services/habitReminders.js): the habits whose reminder time has come and that aren't done today.
function buildHabitEmail(user, habits) {
  const single = habits.length === 1;
  const unsubscribeUrl = `${appUrl()}/notifications/unsubscribe/${unsubscribeToken(user._id)}`;
  return {
    to: user.email,
    subject: single ? `Habit: ${habits[0].name}` : `Habits: ${habits.length} still to do today`,
    heading: single ? habits[0].name : `${habits.length} habits still to do today`,
    paragraphs: single ? ['Your reminder for today. Check in when it’s done.'] : habits.map((habit) => habit.name),
    action: single ? { label: 'Open habit', url: `${appUrl()}/habits/${habits[0]._id}` } : { label: 'Open habits', url: `${appUrl()}/habits` },
    footnote: 'You get this because the habit has a reminder time. Change or remove it on the habit’s Edit page.',
    footerLinks: [
      { label: 'Turn off email reminders', url: unsubscribeUrl },
      { label: 'Notification settings', url: `${appUrl()}/settings/notifications` },
    ],
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

const buildHabitPush = (habit) => ({
  title: habit.name,
  body: 'Habit reminder · not checked in today yet',
  url: `/habits/${habit._id}`,
  tag: `habit-${habit._id}`,
});

async function habitEmail(user, habits) {
  await sendMail(buildHabitEmail(user, habits));
}

async function habitPush(user, habits) {
  let browsers = 0;
  for (const habit of habits) {
    if (!webPush.isConfigured()) console.log(`[push] to ${user.email}: habit ${habit.name}`);
    else browsers = Math.max(browsers, await webPush.sendToUser(user._id, buildHabitPush(habit)));
  }
  return browsers;
}

// Daily summary (services/dailySummary.js). One line per item, the same words the Daily List uses.
const SUMMARY_MAX_LINES = 12;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function summaryCounts({ tasks, overdue, habits, events }) {
  const parts = [plural(tasks.length, 'task')];
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (habits.length) parts.push(plural(habits.length, 'habit'));
  if (events.length) parts.push(plural(events.length, 'event'));
  return parts.join(' · ');
}

// The day's timeline like the Daily List: all-day events, then events and scheduled tasks by start time, then tasks
// due today, overdue tasks and habits.
function summaryLines({ tasks, overdue, habits, events }, timeZone, now) {
  const timed = [
    ...events.map((event) => ({ allDay: event.allDay, start: event.start, line: `${event.time} · ${event.event.title}` })),
    ...tasks.filter((task) => task.schedule?.start).map((task) => ({ start: task.schedule.start, line: `${formatTime(task.schedule.start, timeZone)} · ${task.title}` })),
  ].sort((a, b) => Boolean(b.allDay) - Boolean(a.allDay) || a.start - b.start);
  const lines = [
    ...timed.map((item) => item.line),
    ...tasks.filter((task) => !task.schedule?.start).map((task) => `Due today · ${task.title}`),
    ...overdue.map((task) => `Overdue (${formatDay(task.dueDate, timeZone, now)}) · ${task.title}`),
    ...habits.map((habit) => `Habit · ${habit.name}`),
  ];
  if (lines.length <= SUMMARY_MAX_LINES) return lines;
  return [...lines.slice(0, SUMMARY_MAX_LINES - 1), `…and ${lines.length - SUMMARY_MAX_LINES + 1} more on your Daily List`];
}

function buildSummaryEmail(user, summary, now = new Date()) {
  const timeZone = user.timeZone || 'UTC';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const lines = summaryLines(summary, timeZone, now);
  const unsubscribeUrl = `${appUrl()}/notifications/unsubscribe/${unsubscribeToken(user._id)}`;
  return {
    to: user.email,
    subject: `Your day: ${summaryCounts(summary)}`,
    heading: `Your plan for ${day}`,
    paragraphs: lines.length ? lines : ['Nothing planned for today. Enjoy it, or add something on your Daily List.'],
    action: { label: 'Open your Daily List', url: `${appUrl()}/today` },
    footnote: `You get this every day at ${user.notifications.dailySummary.time} because the daily summary is on.`,
    footerLinks: [
      { label: 'Change or turn off the daily summary', url: `${appUrl()}/settings/notifications` },
      { label: 'Turn off all email', url: unsubscribeUrl },
    ],
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

function buildSummaryPush(user, summary, now = new Date()) {
  const lines = summaryLines(summary, user.timeZone || 'UTC', now);
  return {
    title: `Your day: ${summaryCounts(summary)}`,
    body: lines.length ? lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '') : 'Nothing planned for today.',
    url: '/today',
    tag: 'daily-summary',
  };
}

async function summaryEmail(user, summary, now) {
  await sendMail(buildSummaryEmail(user, summary, now));
}

async function summaryPush(user, summary, now) {
  return webPush.sendToUser(user._id, buildSummaryPush(user, summary, now));
}

module.exports = {
  email,
  push,
  buildReminderEmail,
  buildReminderPush,
  habitEmail,
  habitPush,
  buildHabitEmail,
  buildHabitPush,
  summaryEmail,
  summaryPush,
  buildSummaryEmail,
  buildSummaryPush,
};
