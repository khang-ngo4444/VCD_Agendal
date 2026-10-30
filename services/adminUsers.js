// The queries behind /admin/users (AD-W02): filter chips, search, pages of 50, task and habit counts,
// and locking / unlocking accounts (AD-W03).
const { isValidObjectId } = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const { escapeRegex } = require('./regex');
const activity = require('./activity');

const PAGE_SIZE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REASON_LENGTH = 200;

// Chip key → MongoDB filter. "Locked" covers both an admin lock and a failed-login lockout.
const isLocked = (now) => ({ $or: [{ 'adminLock.at': { $exists: true } }, { lockedUntil: { $gt: now } }] });
const STATUS_FILTERS = {
  active: (now) => ({ role: { $ne: 'admin' }, adminLock: null, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }),
  locked: isLocked,
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

// What the Status column shows, and whether the row offers Unlock instead of Lock.
function statusOf(user, now = new Date()) {
  if (user.adminLock?.at) return { label: 'Locked', tone: 'bg-error', locked: true };
  if (user.lockedUntil > now) return { label: 'Locked out', tone: 'bg-warning', locked: true };
  if (user.role === 'admin') return { label: 'Admin', tone: 'bg-primary', locked: false };
  return { label: 'Active', tone: 'bg-success', locked: false };
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

  const users = await User.find(filter, 'email name avatar role createdAt lastLoginAt lockedUntil adminLock')
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

// The optional reason typed in the lock dialog: trimmed, at most 200 characters.
const lockReason = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_REASON_LENGTH) : '');

// Locks an account: it can't log in, and bumping sessionVersion ends its sessions on every device at once.
// Returns { user } or { error: 'self' | 'not_found' | 'already' }. An admin can lock another admin, never themselves.
async function lockUser(req, admin, userId, reason, now = new Date()) {
  if (!isValidObjectId(userId)) return { error: 'not_found' };
  if (String(admin._id) === String(userId)) return { error: 'self' };

  const note = lockReason(reason);
  const user = await User.findOneAndUpdate(
    { _id: userId, 'adminLock.at': { $exists: false } },
    { $set: { adminLock: { at: now, by: admin._id, reason: note || undefined } }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' }
  );
  if (!user) return { error: (await User.exists({ _id: userId })) ? 'already' : 'not_found' };

  await activity.record(req, { action: 'admin_lock', user, actor: admin, details: [`By ${admin.email}`, note].filter(Boolean).join(' · ') });
  return { user };
}

// Unlocks an account: lifts an admin lock and a failed-login lockout alike.
async function unlockUser(req, admin, userId, now = new Date()) {
  if (!isValidObjectId(userId)) return { error: 'not_found' };

  const user = await User.findOneAndUpdate(
    { _id: userId, ...isLocked(now) },
    { $unset: { adminLock: 1 }, $set: { lockedUntil: null, loginFailures: { count: 0, since: null } } },
    { returnDocument: 'after' }
  );
  if (!user) return { error: (await User.exists({ _id: userId })) ? 'already' : 'not_found' };

  await activity.record(req, { action: 'admin_unlock', user, actor: admin, details: `By ${admin.email}` });
  return { user };
}

module.exports = { listUsers, userFilter, pageNumber, statusOf, lockReason, lockUser, unlockUser, CHIPS, PAGE_SIZE, MAX_REASON_LENGTH };
