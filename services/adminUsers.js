// The queries behind /admin/users (AD-W02): filter chips, search, pages of 50, task and habit counts.
const User = require('../models/User');
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const { escapeRegex } = require('./regex');

const PAGE_SIZE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Chip key → MongoDB filter. "Locked" means locked out by failed logins until the lock/unlock card adds admin locks.
const STATUS_FILTERS = {
  active: (now) => ({ role: { $ne: 'admin' }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }),
  locked: (now) => ({ lockedUntil: { $gt: now } }),
  admins: () => ({ role: 'admin' }),
  new: (now) => ({ createdAt: { $gte: new Date(now - WEEK_MS) } }),
};

const CHIPS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'locked', label: 'Locked' },
  { key: 'admins', label: 'Administrators' },
  { key: 'new', label: 'Signed up this week' },
];

// The filter for ?status=<chip>&q=<email or name>. Unknown chips and non-string values are ignored.
function userFilter({ status, q } = {}, now = new Date()) {
  const chip = typeof status === 'string' && Object.hasOwn(STATUS_FILTERS, status) ? status : ''; // not "constructor" etc.
  const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  const parts = [];
  if (chip) parts.push(STATUS_FILTERS[chip](now));
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    parts.push({ $or: [{ email: pattern }, { name: pattern }] });
  }
  const filter = parts.length > 1 ? { $and: parts } : (parts[0] ?? {});
  return { filter, chip, search };
}

// Page number from the query string, kept between 1 and the last page.
function pageNumber(value, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.parseInt(value, 10);
  return { page: Number.isInteger(page) ? Math.min(Math.max(page, 1), pages) : 1, pages };
}

// What the Status column shows.
function statusOf(user, now = new Date()) {
  if (user.role === 'admin') return { label: 'Admin', tone: 'bg-primary' };
  if (user.lockedUntil > now) return { label: 'Locked out', tone: 'bg-warning' };
  return { label: 'Active', tone: 'bg-success' };
}

// owner id → count, for the users on one page only.
async function countByOwner(Model, match, ids) {
  const rows = await Model.aggregate([{ $match: { ...match, owner: { $in: ids } } }, { $group: { _id: '$owner', count: { $sum: 1 } } }]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function listUsers(query = {}, now = new Date()) {
  const { filter, chip, search } = userFilter(query, now);

  const [total, ...chipCounts] = await Promise.all([
    User.countDocuments(filter),
    ...CHIPS.map(({ key }) => User.countDocuments(key ? STATUS_FILTERS[key](now) : {})),
  ]);
  const { page, pages } = pageNumber(query.page, total);

  const users = await User.find(filter, 'email name avatar role createdAt lastLoginAt lockedUntil')
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const ids = users.map((user) => user._id);
  const [tasks, habits] = await Promise.all([
    countByOwner(Task, { deletedAt: null }, ids),
    countByOwner(Habit, { archivedAt: null }, ids),
  ]);

  return {
    users: users.map((user) => ({
      ...user,
      tasks: tasks.get(String(user._id)) ?? 0,
      habits: habits.get(String(user._id)) ?? 0,
      status: statusOf(user, now),
    })),
    chips: CHIPS.map((item, i) => ({ ...item, count: chipCounts[i] })),
    chip,
    search,
    total,
    page,
    pages,
    from: total ? (page - 1) * PAGE_SIZE + 1 : 0,
    to: (page - 1) * PAGE_SIZE + users.length,
  };
}

module.exports = { listUsers, userFilter, pageNumber, statusOf, CHIPS, PAGE_SIZE };
