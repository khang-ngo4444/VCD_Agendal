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

// Without VAPID keys (services/webPush.js) push reminders are only logged.
async function push(user, items, now) {
  for (const item of items) {
    if (!webPush.isConfigured()) {
      console.log(`[push] to ${user.email}: ${item.task.title}`);
      continue;
    }
    await webPush.sendToUser(user._id, buildReminderPush(user, item, now));
  }
}

module.exports = { email, push, buildReminderEmail, buildReminderPush };
