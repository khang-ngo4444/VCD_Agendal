// Habit maths on local days: "YYYY-MM-DD" strings in the user's time zone, the same strings HabitCheckIn stores.
// Pure functions (tests/habits.test.js pins down every frequency type), plus loadSummaries for the pages.
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const { addDays, weekdayOf, startOfWeek, toDateInput } = require('./dates');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isWeekly = (habit) => habit.frequency.type === 'timesPerWeek';

// "N times per week" habits can be done on any day, so every day counts as due for them.
function isDue(habit, date) {
  const { type, days = [] } = habit.frequency;
  const weekday = weekdayOf(date);
  if (type === 'weekdays') return weekday >= 1 && weekday <= 5;
  if (type === 'days') return days.includes(weekday);
  return true;
}

const weekDays = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
const countInWeek = (done, weekStart) => weekDays(weekStart).filter((date) => done.has(date)).length;

// Every due day (or week, for "N times per week") from `start` to `today`, oldest first, as { count, target }.
// Today is left out until it's checked in, and the current week is marked inProgress until it meets the target,
// so a day or week that isn't over yet never counts as missed.
function periods(habit, done, { start, today, weekStartsOn }) {
  const results = [];
  if (isWeekly(habit)) {
    const thisWeek = startOfWeek(today, weekStartsOn);
    for (let week = startOfWeek(start, weekStartsOn); week <= thisWeek; week = addDays(week, 7)) {
      const target = habit.frequency.timesPerWeek;
      const count = Math.min(countInWeek(done, week), target);
      results.push({ count, target, inProgress: week === thisWeek && count < target });
    }
  } else {
    for (let date = start; date <= today; date = addDays(date, 1)) {
      if (!isDue(habit, date) || (date === today && !done.has(date))) continue;
      results.push({ count: done.has(date) ? 1 : 0, target: 1 });
    }
  }
  return results;
}

// Current and longest streak: due days in a row that were checked in, or for "N times per week" habits,
// weeks in a row that met the target. `done` is a Set of check-in days; `start` is the habit's first day.
function streaks(habit, done, { start, today, weekStartsOn = 1 }) {
  let current = 0;
  let longest = 0;
  for (const { count, target, inProgress } of periods(habit, done, { start, today, weekStartsOn })) {
    if (inProgress) continue;
    current = count === target ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { current, longest, unit: isWeekly(habit) ? 'week' : habit.frequency.type === 'daily' ? 'day' : 'scheduled day' };
}

// Calendar-day streaks include every date, including days outside the habit's schedule.
function dailyStreaks(done, options) {
  return streaks({ frequency: { type: 'daily' } }, done, options);
}

// Checked-in due days ÷ due days from `start` to `today` (weekly habits: check-ins up to the target ÷ targets).
// rate is null when nothing was due yet.
// ponytail: weekly habits count whole weeks, so a window starting mid-week includes that week's earlier days.
function completion(habit, done, { start, today, weekStartsOn = 1 }) {
  let kept = 0;
  let due = 0;
  for (const { count, target, inProgress } of periods(habit, done, { start, today, weekStartsOn })) {
    kept += count;
    due += inProgress ? count : target;
  }
  return { done: kept, due, rate: due ? kept / due : null };
}

// This week's progress for the habits list, e.g. { done: 2, target: 3 }.
function weekProgress(habit, done, { today, weekStartsOn = 1 }) {
  const days = weekDays(startOfWeek(today, weekStartsOn));
  if (isWeekly(habit)) return { done: days.filter((date) => done.has(date)).length, target: habit.frequency.timesPerWeek };
  const dueDays = days.filter((date) => isDue(habit, date));
  return { done: dueDays.filter((date) => done.has(date)).length, target: dueDays.length };
}

function describeFrequency(habit, weekStartsOn = 1) {
  const { type, days = [], timesPerWeek } = habit.frequency;
  if (type === 'weekdays') return 'Weekdays';
  if (type === 'days') {
    const inWeekOrder = [...days].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7));
    return inWeekOrder.map((day) => DAY_NAMES[day]).join(', ');
  }
  if (type === 'timesPerWeek') return { 1: 'Once a week', 2: 'Twice a week' }[timesPerWeek] ?? `${timesPerWeek} times a week`;
  return 'Every day';
}

// Everything the habit lists show for `user` on the local day `date`: one summary per habit, oldest habit first.
// The history starts at the habit's creation day, or at its first check-in if that is earlier (backfilled).
// ponytail: loads every check-in the user has; limit it by date once histories run to years.
async function loadSummaries(user, date, filter = {}) {
  const habits = await Habit.find({ ...filter, owner: user._id }).sort({ createdAt: 1 }).lean();
  const checkIns = await HabitCheckIn.find({ owner: user._id, habit: { $in: habits.map((habit) => habit._id) } }, { habit: 1, date: 1 }).lean();
  const weekStartsOn = user.preferences.weekStartsOn;

  return habits.map((habit) => {
    const done = new Set(checkIns.filter((checkIn) => checkIn.habit.equals(habit._id)).map((checkIn) => checkIn.date));
    const created = toDateInput(habit.createdAt, user.timeZone);
    const first = [...done].sort()[0];
    const start = first && first < created ? first : created;
    return {
      habit,
      done,
      start,
      due: isDue(habit, date),
      doneOnDate: done.has(date),
      streak: streaks(habit, done, { start, today: date, weekStartsOn }),
      dailyStreak: dailyStreaks(done, { start, today: date }),
      week: weekProgress(habit, done, { today: date, weekStartsOn }),
      frequencyLabel: describeFrequency(habit, weekStartsOn),
    };
  });
}

module.exports = { DAY_NAMES, isDue, streaks, dailyStreaks, completion, weekProgress, describeFrequency, loadSummaries };
