// Repeating events, stepped on the user's wall clock: a 09:00 lecture stays at 09:00 across a DST change, and a
// monthly event on the 31st falls on the last day of shorter months.
const { zonedParts, zonedTime } = require('./dates');

const MAX_OCCURRENCES = 1000; // ponytail: every expansion walks from the series start; fine for a few years of dailies

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// `date` moved by `count` days, weeks, months or years in `timeZone`, keeping its local time of day.
function addInterval(date, frequency, count, timeZone) {
  const { year, month, day, hour, minute } = zonedParts(date, timeZone);
  if (frequency === 'daily' || frequency === 'weekly') {
    const moved = new Date(Date.UTC(year, month - 1, day + count * (frequency === 'weekly' ? 7 : 1)));
    return zonedTime({ year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate(), hour, minute }, timeZone);
  }
  const months = month - 1 + count * (frequency === 'yearly' ? 12 : 1);
  const newYear = year + Math.floor(months / 12);
  const newMonth = (((months % 12) + 12) % 12) + 1;
  return zonedTime({ year: newYear, month: newMonth, day: Math.min(day, daysInMonth(newYear, newMonth)), hour, minute }, timeZone);
}

// Every occurrence of `event` that overlaps [from, to), with its exceptions applied, as { original, start, end, title }.
// `original` is the start the occurrence has in the series; it is how an exception finds its occurrence. Each one is
// counted from the series start (not from the previous one), so the 31st never drifts to the 28th for good.
// ponytail: an exception moved earlier than its original start is missed when only the moved time is in range.
function occurrences(event, from, to, timeZone) {
  const frequency = event.repeat?.frequency;
  const length = event.end - event.start;
  const list = [];
  for (let k = 0; k < (frequency ? MAX_OCCURRENCES : 1); k += 1) {
    const original = frequency ? addInterval(event.start, frequency, k, timeZone) : event.start;
    if (original >= to || (event.repeat?.until && original > event.repeat.until)) break;
    const change = event.exceptions?.find((exception) => exception.original.getTime() === original.getTime());
    if (change?.cancelled) continue;
    const start = change?.start ?? original;
    const end = change?.end ?? new Date(original.getTime() + length);
    if (start < to && end > from) list.push({ original, start, end, title: change?.title ?? event.title });
  }
  return list;
}

module.exports = { addInterval, occurrences };
