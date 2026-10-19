// The Search page's query (Figma W06, filters W21): typed words plus project, priority, status and due filters.
const mongoose = require('mongoose');
const { PRIORITIES } = require('../validators/task');
const { escapeRegex } = require('./regex');
const { addDays, dayRange, parseDateInput, startOfWeek, toDateInput, zonedTime } = require('./dates');

const MAX_QUERY_LENGTH = 200;
const STATUSES = { open: 'Open', overdue: 'Overdue', completed: 'Completed' };
const DUES = { today: 'Today', week: 'This week', none: 'No date', range: 'Pick dates' };

const text = (value) => (typeof value === 'string' ? value : '');
const list = (value) => [value ?? []].flat().filter((item) => typeof item === 'string'); // ?a=1&a=2 arrives as an array
const dateOrEmpty = (value) => (parseDateInput(text(value)) ? value : '');

// The query string as clean values, to re-fill the form and to build the database query. Unknown values are dropped,
// and so is "Pick dates" until a date is picked.
function parseSearch(query = {}) {
  const q = text(query.q).trim().slice(0, MAX_QUERY_LENGTH);
  const from = dateOrEmpty(query.from);
  const to = dateOrEmpty(query.to);
  const due = Object.hasOwn(DUES, query.due) && (query.due !== 'range' || from || to) ? query.due : '';
  return {
    q,
    words: q.split(/\s+/).filter(Boolean),
    projects: list(query.project).filter((id) => id === 'inbox' || mongoose.isValidObjectId(id)),
    priorities: list(query.priority).filter((priority) => PRIORITIES.includes(priority)),
    statuses: list(query.status).filter((status) => Object.hasOwn(STATUSES, status)),
    due,
    from,
    to,
  };
}

const isFiltered = (search) => Boolean(search.projects.length || search.priorities.length || search.statuses.length || search.due);

// The instants a local day ("YYYY-MM-DD") starts and ends at.
const localDay = (date, timeZone) => dayRange(zonedTime({ ...parseDateInput(date), hour: 12 }, timeZone), timeZone);

// A task's date is its scheduled start or its due date, as in the lists ("No date" when it has neither).
const datedBetween = (start, end) => ({ $or: [{ dueDate: { $gte: start, $lt: end } }, { 'schedule.start': { $gte: start, $lt: end } }] });

function dueCondition({ due, from, to }, { timeZone, preferences }, now) {
  const today = toDateInput(now, timeZone);
  if (due === 'today') return datedBetween(localDay(today, timeZone).start, localDay(today, timeZone).end);
  if (due === 'week') {
    const first = startOfWeek(today, preferences.weekStartsOn);
    return datedBetween(localDay(first, timeZone).start, localDay(addDays(first, 6), timeZone).end);
  }
  if (due === 'none') return { dueDate: null, 'schedule.start': null };
  if (due === 'range') {
    return datedBetween(from ? localDay(from, timeZone).start : new Date(0), to ? localDay(to, timeZone).end : new Date(8.64e15));
  }
  return null;
}

const STATUS_CONDITIONS = {
  open: () => ({ completedAt: null }),
  overdue: (now) => ({ completedAt: null, dueDate: { $lt: now } }),
  completed: () => ({ completedAt: { $ne: null } }),
};

// The MongoDB filter for `user`'s tasks that match. Every typed word must appear in the title or description, in any
// case, so "lab draft" finds "Draft the lab report". Within a filter group the values are alternatives (High or
// Medium); the groups combine (High and this week).
// ponytail: a case-insensitive regex over the user's own tasks rather than a text index, which only matches whole
// words and so finds nothing while a word is half typed; add one if a user's task list ever gets big.
function searchFilter(search, user, now = new Date()) {
  const conditions = search.words.map((word) => {
    const pattern = new RegExp(escapeRegex(word), 'i');
    return { $or: [{ title: pattern }, { description: pattern }] };
  });
  if (search.projects.length) conditions.push({ project: { $in: search.projects.map((id) => (id === 'inbox' ? null : id)) } });
  if (search.priorities.length) conditions.push({ priority: { $in: search.priorities } });
  if (search.statuses.length) conditions.push({ $or: search.statuses.map((status) => STATUS_CONDITIONS[status](now)) });
  const due = dueCondition(search, user, now);
  if (due) conditions.push(due);
  return { owner: user._id, deletedAt: null, ...(conditions.length && { $and: conditions }) };
}

module.exports = { STATUSES, DUES, parseSearch, isFiltered, searchFilter };
