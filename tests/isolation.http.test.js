// Data isolation: every id in a URL belongs to the signed-in user. Another account's ids answer 404, exactly like
// ids that don't exist (so a guessed id can't even confirm that something is there), and change nothing.
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const Project = require('../models/Project');
const Event = require('../models/Event');
const Reminder = require('../models/Reminder');
const FocusSession = require('../models/FocusSession');
const { toDateInput } = require('../services/dates');
const { startApp, stopApp, resetData, post, signUp } = require('./helpers/http');

beforeAll(startApp, 120000);
afterAll(stopApp);
beforeEach(resetData);

const SECRET = 'Ana private plan';

// Ana's account with one of everything, and Bao, a second account, signed in on his own browser.
async function twoAccounts() {
  const ana = await signUp('ana@example.com', 'Ana Tran');
  const day = toDateInput(new Date(), ana.user.timeZone);
  await post(ana.agent, '/projects', { name: `${SECRET} project`, colour: '#2f6fde' }, '/projects');
  const project = await Project.findOne({ owner: ana.user._id });
  await post(ana.agent, '/tasks', { title: `${SECRET} task`, project: String(project._id), scheduleDate: day, scheduleStart: '23:00', scheduleEnd: '23:30' });
  const task = await Task.findOne({ owner: ana.user._id });
  await post(ana.agent, '/habits', { name: `${SECRET} habit`, colour: '#2f6fde', frequencyType: 'daily' }, '/habits/new');
  const habit = await Habit.findOne({ owner: ana.user._id });
  await post(ana.agent, '/events', { title: `${SECRET} event`, date: day, start: '08:00', end: '09:00' }, '/events/new');
  const event = await Event.findOne({ owner: ana.user._id });
  const bao = await signUp('bao@example.com', 'Bao Le');
  return { ana, bao, project, task, habit, event, day };
}

test('reading another account’s task, habit, project, event or focus page answers 404', async () => {
  const { bao, project, task, habit, event } = await twoAccounts();
  for (const path of [`/tasks/${task._id}`, `/tasks/${task._id}/reminder`, `/habits/${habit._id}`, `/habits/${habit._id}/edit`, `/projects/${project._id}`, `/events/${event._id}`, `/focus/${task._id}`]) {
    const res = await bao.agent.get(path);
    expect([path, res.status]).toEqual([path, 404]);
  }
});

test('changing another account’s data answers 404 and changes nothing', async () => {
  const { bao, project, task, habit, event, day } = await twoAccounts();
  const attempts = [
    [`/tasks/${task._id}`, { title: 'Hacked', priority: 'low' }],
    [`/tasks/${task._id}/complete`, { done: '1' }],
    [`/tasks/${task._id}/move`, { status: 'done' }],
    [`/tasks/${task._id}/unschedule`, {}],
    [`/tasks/${task._id}/reminder`, { offsetMinutes: '15' }],
    [`/tasks/${task._id}/delete`, {}],
    [`/habits/${habit._id}/check-ins`, { date: day, done: '1' }],
    [`/habits/${habit._id}/delete`, {}],
    [`/projects/${project._id}/rename`, { name: 'Hacked' }],
    [`/projects/${project._id}/delete`, {}],
    [`/events/${event._id}/delete`, {}],
    [`/focus/${task._id}/sessions`, { startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), minutes: '25' }],
  ];
  for (const [path, fields] of attempts) {
    const res = await post(bao.agent, path, fields);
    expect([path, res.status]).toEqual([path, 404]);
  }
  const fresh = await Task.findById(task._id);
  expect(fresh).toMatchObject({ title: `${SECRET} task`, completedAt: null, deletedAt: null });
  expect(fresh.schedule.start).toBeInstanceOf(Date);
  expect(await Habit.exists({ _id: habit._id })).toBeTruthy();
  expect(await HabitCheckIn.countDocuments()).toBe(0);
  expect((await Project.findById(project._id)).name).toBe(`${SECRET} project`);
  expect(await Event.exists({ _id: event._id })).toBeTruthy();
  expect(await Reminder.countDocuments()).toBe(0);
  expect(await FocusSession.countDocuments()).toBe(0);
});

test('ids that are not ids at all also answer 404', async () => {
  const { bao } = await twoAccounts();
  for (const path of ['/tasks/not-an-id', '/habits/123', '/projects/%24where', '/events/x']) {
    expect((await bao.agent.get(path)).status).toBe(404);
  }
});

test('lists, search, the calendar and the CSV export never show another account’s data', async () => {
  const { bao, project, task, habit, event } = await twoAccounts();
  // Ana's names and ids. (Not the search words alone: the search page repeats what was typed.)
  const hers = [`${SECRET} task`, `${SECRET} habit`, `${SECRET} project`, `${SECRET} event`, ...[project, task, habit, event].map((doc) => String(doc._id))];
  for (const path of ['/today', '/upcoming', '/board', '/calendar', '/habits', '/projects', '/inbox', '/focus', '/insights', `/search?q=${encodeURIComponent(SECRET)}`, '/insights/export/tasks.csv', '/insights/export/habit-checkins.csv']) {
    const res = await bao.agent.get(path);
    expect([path, res.status]).toEqual([path, 200]);
    expect([path, hers.filter((text) => res.text.includes(text))]).toEqual([path, []]);
  }
});

test('the owner still sees their own data (the setup above really created it)', async () => {
  const { ana } = await twoAccounts();
  expect((await ana.agent.get('/today')).text).toContain(`${SECRET} task`);
  expect((await ana.agent.get('/insights/export/tasks.csv')).text).toContain(`${SECRET} task`);
});
