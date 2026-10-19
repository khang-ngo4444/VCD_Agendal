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

const SCOPES = ['this', 'following', 'all'];
const sameTime = (a, b) => a.getTime() === b.getTime();
const withoutException = (event, original) => (event.exceptions ?? []).filter((exception) => !sameTime(exception.original, original));

// Saving a change made to one occurrence of a repeating event (Figma W25), by scope:
//   this       the series keeps going; this occurrence gets an exception with the new time and title
//   following  the series ends just before this occurrence, and a new series starts here with the changes
//   all        the series changes, its times shifted by as much as this occurrence moved
// `event` is a plain object and isn't modified. `changes` come from parseEventForm, timed for this occurrence.
// Returns { series, newSeries }: the series to save, and the series to create for "following" (else null).
// ponytail: an exception keeps only time and title; changing an occurrence's place or notes changes the series.
function applyEdit(event, original, changes, scope) {
  if (scope === 'this') {
    const exception = { original, start: changes.start, end: changes.end, title: changes.title };
    return { series: { ...event, exceptions: [...withoutException(event, original), exception] }, newSeries: null };
  }
  const shift = changes.start - original;
  const length = changes.end - changes.start;
  const unmoved = shift === 0 && length === event.end - event.start; // exceptions only still match if times stay put
  if (scope === 'following' && !sameTime(original, event.start)) {
    const before = { ...event, repeat: { ...event.repeat, until: new Date(original.getTime() - 1) } };
    before.exceptions = withoutException(event, original).filter((exception) => exception.original < original);
    const after = { ...event, ...changes, exceptions: unmoved ? withoutException(event, original).filter((exception) => exception.original > original) : [] };
    delete after._id;
    return { series: before, newSeries: after };
  }
  // "all", and "following" from the very first occurrence, which is the same thing
  const start = new Date(event.start.getTime() + shift);
  return {
    series: { ...event, ...changes, start, end: new Date(start.getTime() + length), exceptions: unmoved ? withoutException(event, original) : [] },
    newSeries: null,
  };
}

// Deleting one occurrence of a repeating event, by scope. Returns the series to save, or null to delete it.
function applyDelete(event, original, scope) {
  if (scope === 'this') return { ...event, exceptions: [...withoutException(event, original), { original, cancelled: true }] };
  if (scope === 'following' && !sameTime(original, event.start)) {
    return {
      ...event,
      repeat: { ...event.repeat, until: new Date(original.getTime() - 1) },
      exceptions: (event.exceptions ?? []).filter((exception) => exception.original < original),
    };
  }
  return null;
}

module.exports = { SCOPES, addInterval, occurrences, applyEdit, applyDelete };
