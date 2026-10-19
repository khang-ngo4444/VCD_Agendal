// Habit maths on local days: "YYYY-MM-DD" strings in the user's time zone, the same strings HabitCheckIn stores.
// Pure functions, so tests/habits.test.js can pin down every frequency type.
const { addDays, weekdayOf, startOfWeek } = require('./dates');

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
  return { current, longest, unit: isWeekly(habit) ? 'week' : 'day' };
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

module.exports = { DAY_NAMES, isDue, streaks, completion, weekProgress, describeFrequency };
