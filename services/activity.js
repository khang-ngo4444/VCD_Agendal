// The activity log: recording security events, and the queries behind /admin/activity.
const ActivityLog = require('../models/ActivityLog');
const { dayRange, formatDay } = require('./dates');
const { escapeRegex } = require('./regex');

const PAGE_SIZE = 50;

// Filter chips on the activity page (AD-W04). "Admin lock / unlock" is one chip for two actions.
const FILTERS = [
  { key: 'signup', label: 'Sign-up', actions: ['signup'] },
  { key: 'login', label: 'Login', actions: ['login'] },
  { key: 'login_failed', label: 'Failed login', actions: ['login_failed'] },
  { key: 'lockout', label: 'Lockout', actions: ['lockout'] },
  { key: 'password_reset', label: 'Password reset', actions: ['password_reset'] },
  { key: 'account_deleted', label: 'Account deleted', actions: ['account_deleted'] },
  { key: 'admin', label: 'Admin lock / unlock', actions: ['admin_lock', 'admin_unlock'] },
];

// How each action reads in the table, and the colour of its dot.
const ACTION_LABELS = {
  signup: { label: 'Sign-up', tone: 'bg-success' },
  login: { label: 'Login', tone: 'bg-muted' },
  login_failed: { label: 'Failed login', tone: 'bg-error' },
  lockout: { label: 'Lockout', tone: 'bg-error' },
  password_reset: { label: 'Password reset', tone: 'bg-primary' },
  account_deleted: { label: 'Account deleted', tone: 'bg-error' },
  admin_lock: { label: 'Admin lock', tone: 'bg-warning' },
  admin_unlock: { label: 'Admin unlock', tone: 'bg-warning' },
};

// "Chrome on Windows" from a User-Agent header. Good enough for spotting an odd login; not a full parser.
function describeDevice(userAgent = '') {
  const browser =
    [
      [/Edg\//, 'Edge'],
      [/OPR\/|Opera/, 'Opera'],
      [/Firefox\//, 'Firefox'],
      [/Chrome\/|CriOS\//, 'Chrome'],
      [/Safari\//, 'Safari'],
    ].find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Unknown browser';
  const system =
    [
      [/Windows/, 'Windows'],
      [/iPhone|iPad/, 'iOS'],
      [/Android/, 'Android'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/Linux/, 'Linux'],
    ].find(([pattern]) => pattern.test(userAgent))?.[1];
  return system ? `${browser} on ${system}` : browser;
}

// Saves one event. Never throws: a failed log write must not break the login or sign-up it describes.
async function record(req, { action, user = null, email, actor = null, details }) {
  try {
    await ActivityLog.create({
      action,
      account: user?._id ?? null,
      email: email ?? user?.email,
      actor: actor?._id ?? null,
      details,
      ip: req.ip,
    });
  } catch (err) {
    console.error(`[activity] could not record ${action}:`, err.message);
  }
}

// The MongoDB filter for the page's query string: ?action=<chip key>&q=<email or IP>&before=<ISO date>.
// Unknown chip keys and bad dates are ignored, so a hand-edited URL just shows everything.
function activityFilter({ action, q, before } = {}) {
  const filter = {};
  const chip = FILTERS.find((item) => item.key === action);
  if (chip) filter.action = { $in: chip.actions };

  const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ email: pattern }, { ip: pattern }];
  }

  const cursor = typeof before === 'string' ? new Date(before) : null;
  return { filter, chip: chip?.key ?? '', search, cursor: cursor && !Number.isNaN(cursor.getTime()) ? cursor : null };
}

// One page, newest first. Older pages continue from the last entry's time (`before`).
async function listActivity(query) {
  const { filter, chip, search, cursor } = activityFilter(query);
  const pageFilter = cursor ? { ...filter, createdAt: { $lt: cursor } } : filter;
  const [rows, total] = await Promise.all([
    ActivityLog.find(pageFilter).sort({ createdAt: -1, _id: -1 }).limit(PAGE_SIZE + 1).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  const entries = rows.slice(0, PAGE_SIZE);
  const older = rows.length > PAGE_SIZE ? entries.at(-1).createdAt.toISOString() : null;
  return { entries, total, chip, search, cursor, older };
}

// Splits entries (newest first) into days in the admin's time zone: "Today · Saturday 17 October".
function groupByDay(entries, timeZone, now = new Date()) {
  const groups = [];
  for (const entry of entries) {
    const start = dayRange(entry.createdAt, timeZone).start.getTime();
    if (groups.at(-1)?.start !== start) {
      const relative = formatDay(entry.createdAt, timeZone, now);
      const date = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(entry.createdAt);
      groups.push({ start, label: ['Today', 'Yesterday'].includes(relative) ? `${relative} · ${date}` : date, entries: [] });
    }
    groups.at(-1).entries.push(entry);
  }
  return groups;
}

module.exports = { record, describeDevice, activityFilter, listActivity, groupByDay, FILTERS, ACTION_LABELS, PAGE_SIZE };
