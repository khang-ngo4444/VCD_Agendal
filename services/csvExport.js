// "Export" on Insights: the signed-in user's tasks and habit check-ins as CSV files that open cleanly in Excel and
// Google Sheets. Dates are in the user's time zone.
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const { toDateInput, toTimeInput } = require('./dates');

const BOM = '﻿'; // Excel reads the file as UTF-8 only with it (accents, emoji)

// One CSV field. Text a spreadsheet would run as a formula (= + - @, tab, carriage return) is prefixed with ', so a
// task titled "=HYPERLINK(…)" stays text. Fields with a comma, quote or line break are quoted, quotes doubled.
function field(value) {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (header, rows) => BOM + [header, ...rows].map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';

const local = (date, timeZone) => (date ? `${toDateInput(date, timeZone)} ${toTimeInput(date, timeZone)}` : '');
const localDay = (date, timeZone) => (date ? toDateInput(date, timeZone) : '');

async function tasksCsv(user, projects) {
  const timeZone = user.timeZone || 'UTC';
  const names = new Map(projects.filter((project) => project.id).map((project) => [project.id, project.name]));
  const tasks = await Task.find({ owner: user._id, deletedAt: null }).sort({ createdAt: 1 }).lean();
  return toCsv(
    ['Title', 'Project', 'Priority', 'Column', 'Due date', 'Scheduled start', 'Scheduled end', 'Repeats', 'Completed at', 'Created at', 'Description'],
    tasks.map((task) => [
      task.title,
      task.project ? (names.get(String(task.project)) ?? '') : 'Inbox',
      task.priority,
      task.status,
      localDay(task.dueDate, timeZone),
      local(task.schedule?.start, timeZone),
      local(task.schedule?.end, timeZone),
      task.repeat?.frequency ?? '',
      local(task.completedAt, timeZone),
      local(task.createdAt, timeZone),
      task.description ?? '',
    ])
  );
}

async function checkInsCsv(user) {
  const timeZone = user.timeZone || 'UTC';
  const habits = await Habit.find({ owner: user._id }, { name: 1, archivedAt: 1 }).lean();
  const names = new Map(habits.map((habit) => [String(habit._id), habit]));
  const checkIns = await HabitCheckIn.find({ owner: user._id }).sort({ date: 1 }).lean();
  return toCsv(
    ['Habit', 'Date', 'Checked in at', 'Habit archived'],
    checkIns.map((checkIn) => {
      const habit = names.get(String(checkIn.habit));
      return [habit?.name ?? '(deleted habit)', checkIn.date, local(checkIn.createdAt, timeZone), habit?.archivedAt ? 'yes' : 'no'];
    })
  );
}

module.exports = { field, toCsv, tasksCsv, checkInsCsv };
