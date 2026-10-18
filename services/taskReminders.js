// The reminder on a task (W30 · Reminder picker). One reminder still to come per task; the reminder job
// (services/reminders.js) sends it. A preset is stored as minutes before the scheduled start, so it moves with the task.
const Reminder = require('../models/Reminder');
const { formatDay, formatTime, parseDateInput, parseTimeInput, zonedTime, toDateInput, toTimeInput } = require('./dates');

const MINUTE_MS = 60 * 1000;
const PRESETS = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
];
// A reminder set or moved again starts unsent, so the job sends it exactly once.
const UNSENT = { sent: false, sentAt: null, pushedAt: null, emailedAt: null, attempts: 0, lastError: null };

const scope = (task) => ({ task: task._id, owner: task.owner, sent: false });

// The task's reminder that hasn't gone out yet, or null.
const findPending = (task) => Reminder.findOne(scope(task));

// Replaces whatever reminder the task had with a new one.
async function replace(task, remindAt, offsetMinutes) {
  await Reminder.deleteMany(scope(task));
  return Reminder.create({ task: task._id, owner: task.owner, remindAt, offsetMinutes, ...UNSENT });
}

// "15 minutes before": only for scheduled tasks, and only while that moment is still ahead.
// Returns { reminder } or { error: 'unknown_preset' | 'not_scheduled' | 'past' }.
async function setPreset(task, minutes, now = new Date()) {
  // Only a plain value: a crafted array like ['15'] would otherwise pass Number().
  const value = typeof minutes === 'string' || typeof minutes === 'number' ? Number(minutes) : NaN;
  const preset = PRESETS.find((p) => p.minutes === value);
  if (!preset) return { error: 'unknown_preset' };
  const start = task.schedule?.start;
  if (!start) return { error: 'not_scheduled' };
  const remindAt = new Date(start.getTime() - preset.minutes * MINUTE_MS);
  if (remindAt <= now) return { error: 'past' };
  return { reminder: await replace(task, remindAt, preset.minutes) };
}

// A date and time the user picks, in their time zone; works for unscheduled tasks too and never moves with the task.
// Returns { reminder } or { error: 'invalid_time' | 'past' }.
async function setCustom(task, dateInput, timeInput, timeZone, now = new Date()) {
  const day = parseDateInput(typeof dateInput === 'string' ? dateInput : '');
  const time = parseTimeInput(typeof timeInput === 'string' ? timeInput : '');
  if (!day || !time) return { error: 'invalid_time' };
  const remindAt = zonedTime({ ...day, ...time }, timeZone);
  if (remindAt <= now) return { error: 'past' };
  return { reminder: await replace(task, remindAt, null) };
}

// What the custom form starts with: the current reminder, else 15 minutes before the start, else the next full hour.
function customDefaults(task, reminder, timeZone, now = new Date()) {
  const at =
    reminder?.remindAt ??
    (task.schedule?.start > now ? new Date(Math.max(task.schedule.start - 15 * MINUTE_MS, now.getTime())) : null) ??
    new Date(Math.ceil((now.getTime() + MINUTE_MS) / (60 * MINUTE_MS)) * 60 * MINUTE_MS);
  return { date: toDateInput(at, timeZone), time: toTimeInput(at, timeZone) };
}

// After the task's schedule changes: a preset reminder follows the new start time. It is removed when the task has no
// schedule any more ('removed') or when the new reminder time has already passed ('passed'). Chosen-time reminders stay put.
// Returns 'none' | 'kept' | 'moved' | 'removed' | 'passed'.
async function syncWithSchedule(task, now = new Date()) {
  const pending = await findPending(task);
  if (!pending) return 'none';
  if (pending.offsetMinutes == null) return 'kept';
  const start = task.schedule?.start;
  const remindAt = start && new Date(start.getTime() - pending.offsetMinutes * MINUTE_MS);
  if (!remindAt || remindAt <= now) {
    await Reminder.deleteOne({ _id: pending._id });
    return remindAt ? 'passed' : 'removed';
  }
  if (remindAt.getTime() === pending.remindAt.getTime()) return 'kept';
  pending.set({ remindAt, ...UNSENT });
  await pending.save();
  return 'moved';
}

// What the Reminder field shows: "15 minutes before · 13:45" for a preset, "Mon 20 Oct · 09:00" for a chosen time.
function describe(reminder, timeZone, now = new Date()) {
  if (!reminder) return null;
  const time = formatTime(reminder.remindAt, timeZone);
  const preset = PRESETS.find((p) => p.minutes === reminder.offsetMinutes);
  return {
    offsetMinutes: reminder.offsetMinutes,
    label: preset ? `${preset.label} · ${time}` : `${formatDay(reminder.remindAt, timeZone, now)} · ${time}`,
  };
}

module.exports = { PRESETS, findPending, setPreset, setCustom, customDefaults, syncWithSchedule, describe };
