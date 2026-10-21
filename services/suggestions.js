// Insights suggestions (Figma W14 "Pattern spotted · Suggestion"): fixed rules over the user's own data, no AI.
// Each rule returns one suggestion or null; pickSuggestion shows the first one the user hasn't dismissed.
// All pure functions (tests/unit/insights/suggestions.test.js).
const { addDays, zonedParts } = require('./dates');
const { isDue } = require('./habits');

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_DAYS = 7;
const PEAK_MIN_TASKS = 10; // fewer finished tasks than this and a "pattern" is just noise
const PEAK_MIN_SHARE = 0.35;
const LATE_HOUR = 21; // a task planned from 21:00 (or before 05:00) counts as late in the evening
const SLIP_MIN_DAYS = 3;
const SLIP_LOOKBACK_DAYS = 14;

const partOfDay = (hour) => (hour < 12 ? 'in the morning' : hour < 17 ? 'in the afternoon' : hour < 21 ? 'in the evening' : 'at night');

// The 2-hour window in which most of the last 30 days' tasks were finished, when it stands out.
function peakWindow({ completedAt, timeZone, today, now }) {
  const recent = completedAt.filter((date) => now - date <= 30 * DAY_MS);
  if (recent.length < PEAK_MIN_TASKS) return null;
  const perHour = Array(24).fill(0);
  for (const date of recent) perHour[zonedParts(date, timeZone).hour] += 1;
  // The busiest pair of hours; on a tie, the pair that starts on a busier hour (all at 9:xx → 9–11, not 8–10).
  let start = 0;
  for (let hour = 1; hour < 23; hour++) {
    const sum = perHour[hour] + perHour[hour + 1];
    const best = perHour[start] + perHour[start + 1];
    if (sum > best || (sum === best && perHour[hour] > perHour[start])) start = hour;
  }
  const inWindow = perHour[start] + perHour[start + 1];
  if (inWindow / recent.length < PEAK_MIN_SHARE) return null;
  return {
    key: `peak-${start}`,
    title: `You finish most tasks between ${start} and ${start + 2} ${partOfDay(start)}.`,
    body: `${inWindow} of the ${recent.length} tasks you finished in the last 30 days were done between ${start}:00 and ${start + 2}:00.`,
    action: { label: `Plan tomorrow ${start}–${start + 2}`, href: `/calendar?view=day&date=${addDays(today, 1)}` },
  };
}

// Overdue tasks that were planned late in the evening: those are the slots that slip.
function lateOverdue({ overdueTasks, timeZone }) {
  const scheduled = overdueTasks.filter((task) => task.schedule?.start);
  const late = scheduled.filter((task) => {
    const hour = zonedParts(task.schedule.start, timeZone).hour;
    return hour >= LATE_HOUR || hour < 5;
  });
  if (late.length < 2 || late.length / scheduled.length < 0.5) return null;
  return {
    key: 'late-overdue',
    title: `${late.length} of your ${scheduled.length} overdue tasks were planned after ${LATE_HOUR}:00.`,
    body: 'Late-evening slots are the ones that slip. Try moving them to earlier in the day.',
    action: { label: 'Open the Calendar', href: '/calendar?view=week' },
  };
}

// A habit with a good past run that has now missed several due days in a row (yesterday and before).
function habitSlipping({ summaries, today }) {
  for (const { habit, done, start, streak, due, doneOnDate } of summaries) {
    if (habit.frequency.type === 'timesPerWeek' || streak.longest < SLIP_MIN_DAYS) continue;
    let missed = 0;
    for (let back = 1; back <= SLIP_LOOKBACK_DAYS; back++) {
      const date = addDays(today, -back);
      if (date < start) break;
      if (!isDue(habit, date)) continue;
      if (done.has(date)) break;
      missed += 1;
    }
    if (missed < SLIP_MIN_DAYS) continue;
    const unit = `${streak.unit}${streak.longest === 1 ? '' : 's'}`;
    const canCheckIn = due && !doneOnDate;
    return {
      key: `habit-${habit._id}`,
      title: `“${habit.name}” has slipped ${missed} times in a row.`,
      body: `Your best run was ${streak.longest} ${unit}. ${canCheckIn ? 'One check-in today starts a new streak.' : 'Pick it up again on its next day.'}`,
      action: canCheckIn
        ? { label: 'Check in today', form: { action: `/habits/${habit._id}/check-ins`, fields: { date: today, done: '1', returnTo: '/insights' } } }
        : { label: 'Open the habit', href: `/habits/${habit._id}` },
    };
  }
  return null;
}

const RULES = [habitSlipping, lateOverdue, peakWindow]; // most actionable first

// dismissed: the account's Map (or plain object) of suggestion key → Date it stays hidden until.
const isDismissed = (dismissed, key, now) => {
  const until = dismissed instanceof Map ? dismissed.get(key) : dismissed?.[key];
  return Boolean(until && new Date(until) > now);
};

function pickSuggestion(data) {
  for (const rule of RULES) {
    const suggestion = rule(data);
    if (suggestion && !isDismissed(data.dismissed, suggestion.key, data.now)) return suggestion;
  }
  return null;
}

const dismissUntil = (now = new Date()) => new Date(now.getTime() + DISMISS_DAYS * DAY_MS);

module.exports = { peakWindow, lateOverdue, habitSlipping, pickSuggestion, dismissUntil, DISMISS_DAYS };
