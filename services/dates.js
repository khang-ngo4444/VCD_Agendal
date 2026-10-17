// Dates in the user's time zone, so "today", "due" and "overdue" follow the user's clock, never the server's.
// Only Intl: no date library.

const pad = (number) => String(number).padStart(2, '0');

// Wall-clock fields of `date` as seen in `timeZone`.
function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const field = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: field('year'), month: field('month'), day: field('day'), hour: field('hour'), minute: field('minute'), second: field('second') };
}

// How far `timeZone` is ahead of UTC at `date`, in ms (UTC+7 gives +25 200 000).
function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant at which the clock in `timeZone` shows this local date and time.
function zonedTime({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = asUtc - offsetMs(new Date(asUtc), timeZone);
  return new Date(asUtc - offsetMs(new Date(firstGuess), timeZone)); // second pass lands on the right side of a DST change
}

// Start (inclusive) and end (exclusive) of the user's local day that contains `date`.
function dayRange(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedTime({ year, month, day }, timeZone),
    end: zonedTime({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }, timeZone),
  };
}

const todayRange = (timeZone, now = new Date()) => dayRange(now, timeZone);

// <input type="date"> and <input type="time"> values: "2026-10-19" and "20:00".
function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}

function parseTimeInput(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

function toDateInput(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function toTimeInput(date, timeZone) {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

// A due date is the last moment of that local day, so a task due on the 19th is overdue from the 20th.
function endOfLocalDay({ year, month, day }, timeZone) {
  return new Date(dayRange(zonedTime({ year, month, day, hour: 12 }, timeZone), timeZone).end.getTime() - 1);
}

const isOverdue = (task, now = new Date()) => Boolean(task.dueDate && !task.completedAt && task.dueDate < now);

// "Today", "Tomorrow", "Yesterday" or "Mon 19 Oct", in the user's time zone.
function formatDay(date, timeZone, now = new Date()) {
  const daysAway = Math.round((dayRange(date, timeZone).start - dayRange(now, timeZone).start) / 86_400_000);
  const relative = { [-1]: 'Yesterday', 0: 'Today', 1: 'Tomorrow' }[daysAway];
  return relative ?? new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

const formatTime = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);

module.exports = {
  zonedTime,
  dayRange,
  todayRange,
  parseDateInput,
  parseTimeInput,
  toDateInput,
  toTimeInput,
  endOfLocalDay,
  isOverdue,
  formatDay,
  formatTime,
};
