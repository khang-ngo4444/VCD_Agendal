// Habits through the real routes: create, check in (today and the days before), the allowed window, and streaks.
const Habit = require('../../models/Habit');
const HabitCheckIn = require('../../models/HabitCheckIn');
const { addDays, toDateInput } = require('../../services/dates');
const { startApp, stopApp, resetData, post, signUp } = require('../helpers/http');

beforeAll(startApp, 120000);
afterAll(stopApp);
beforeEach(resetData);

const today = (user) => toDateInput(new Date(), user.timeZone);

async function newHabit(agent, user, fields = {}) {
  await post(agent, '/habits', { name: 'Read 20 pages', colour: '#2f6fde', frequencyType: 'daily', ...fields }, '/habits/new');
  return Habit.findOne({ owner: user._id });
}
const checkIn = (agent, habit, date, done = '1') => post(agent, `/habits/${habit._id}/check-ins`, { date, done, returnTo: `/habits/${habit._id}` }, `/habits/${habit._id}`);
const tile = (html, label) => Number(html.match(new RegExp(`${label}</dt>\\s*<dd[^>]*>(\\d+)`))?.[1]);

test('a daily habit is created and listed', async () => {
  const { agent, user } = await signUp();
  const habit = await newHabit(agent, user);
  expect(habit).toMatchObject({ name: 'Read 20 pages', frequency: { type: 'daily' } });
  expect((await agent.get('/habits')).text).toContain('Read 20 pages');
});

test('a habit without a name or with an unknown colour is not saved', async () => {
  const { agent } = await signUp();
  const res = await post(agent, '/habits', { name: '', colour: 'red', frequencyType: 'daily' }, '/habits/new');
  expect(res.status).toBe(422);
  expect(res.text).toContain('Give the habit a name.');
  expect(await Habit.countDocuments()).toBe(0);
});

test('check in today, then undo', async () => {
  const { agent, user } = await signUp();
  const habit = await newHabit(agent, user);
  await checkIn(agent, habit, today(user));
  expect(await HabitCheckIn.countDocuments({ habit: habit._id, date: today(user) })).toBe(1);
  await checkIn(agent, habit, today(user), '0');
  expect(await HabitCheckIn.countDocuments({ habit: habit._id })).toBe(0);
});

test('checking in twice for the same day keeps one check-in', async () => {
  const { agent, user } = await signUp();
  const habit = await newHabit(agent, user);
  await checkIn(agent, habit, today(user));
  await checkIn(agent, habit, today(user));
  expect(await HabitCheckIn.countDocuments({ habit: habit._id })).toBe(1);
});

test('the 6 days before today can be filled in; a week ago and tomorrow cannot', async () => {
  const { agent, user } = await signUp();
  const habit = await newHabit(agent, user);
  await checkIn(agent, habit, addDays(today(user), -6));
  await checkIn(agent, habit, addDays(today(user), -7));
  await checkIn(agent, habit, addDays(today(user), 1));
  const dates = (await HabitCheckIn.find({ habit: habit._id })).map((c) => c.date);
  expect(dates).toEqual([addDays(today(user), -6)]);
  expect((await agent.get(`/habits/${habit._id}`)).text).toContain('You can check in for today and the 6 days before');
});

test('streaks: 3 days in a row, a gap, then today', async () => {
  const { agent, user } = await signUp();
  const habit = await newHabit(agent, user);
  for (const back of [-5, -4, -3]) await checkIn(agent, habit, addDays(today(user), back));
  let page = (await agent.get(`/habits/${habit._id}`)).text;
  expect(tile(page, 'Longest streak')).toBe(3);
  expect(tile(page, 'Current streak')).toBe(0);
  await checkIn(agent, habit, addDays(today(user), -1));
  await checkIn(agent, habit, today(user));
  page = (await agent.get(`/habits/${habit._id}`)).text;
  expect(tile(page, 'Current streak')).toBe(2);
  expect(tile(page, 'Longest streak')).toBe(3);
});
