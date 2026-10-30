// The main task flows through the real routes: add, edit, schedule, complete (and Undo), repeat, delete (and Undo).
const Task = require('../../models/Task');
const { addDays, toDateInput } = require('../../services/dates');
const { startApp, stopApp, resetData, post, signUp } = require('../helpers/http');

beforeAll(startApp, 120000);
afterAll(stopApp);
beforeEach(resetData);

const today = (user) => toDateInput(new Date(), user.timeZone);

// The task detail form with every field, as the page sends it.
const form = (task, fields = {}) => ({
  title: task.title,
  description: '',
  priority: 'medium',
  project: '',
  dueDate: '',
  scheduleDate: '',
  scheduleStart: '',
  scheduleEnd: '',
  repeat: '',
  until: '',
  ...fields,
});

test('quick add: a title is enough; the task lands in the Inbox, in Backlog', async () => {
  const { agent, user } = await signUp();
  const res = await post(agent, '/tasks', { title: '  Read chapter 5  ', returnTo: '/today' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('/today');
  const task = await Task.findOne({ owner: user._id });
  expect(task).toMatchObject({ title: 'Read chapter 5', project: null, status: 'backlog', completedAt: null });
  expect((await agent.get('/today')).text).toContain('Added “Read chapter 5” to the Inbox');
});

test('quick add without a title adds nothing and says why', async () => {
  const { agent } = await signUp();
  await post(agent, '/tasks', { title: '   ', returnTo: '/today' });
  expect(await Task.countDocuments()).toBe(0);
  expect((await agent.get('/today')).text).toContain('Type a title for the task.');
});

test('edit: title, priority, due date and a scheduled time are saved', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Lab report' });
  const task = await Task.findOne({ owner: user._id });
  const day = addDays(today(user), 2);
  const res = await post(agent, `/tasks/${task._id}`, form(task, { title: 'Lab report draft', priority: 'high', dueDate: day, scheduleDate: day, scheduleStart: '09:00', scheduleEnd: '10:30' }), `/tasks/${task._id}`);
  expect(res.status).toBe(302);
  const saved = await Task.findById(task._id);
  expect(saved.title).toBe('Lab report draft');
  expect(saved.priority).toBe('high');
  expect(toDateInput(saved.dueDate, user.timeZone)).toBe(day);
  expect(saved.schedule.end - saved.schedule.start).toBe(90 * 60 * 1000);
});

test('edit with an end time before the start keeps the task as it was and shows the error', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Lab report' });
  const task = await Task.findOne({ owner: user._id });
  const res = await post(agent, `/tasks/${task._id}`, form(task, { scheduleDate: today(user), scheduleStart: '10:00', scheduleEnd: '09:00' }), `/tasks/${task._id}`);
  expect(res.status).toBe(422);
  expect(res.text).toContain('The end time must be after the start time.');
  expect((await Task.findById(task._id)).schedule?.start).toBeUndefined();
});

test('remove schedule keeps the task, without a time', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Gym', scheduleDate: today(user), scheduleStart: '18:00', scheduleEnd: '19:00' });
  const task = await Task.findOne({ owner: user._id });
  expect(task.schedule.start).toBeInstanceOf(Date);
  await post(agent, `/tasks/${task._id}/unschedule`, {}, `/tasks/${task._id}`);
  expect((await Task.findById(task._id)).schedule?.start).toBeUndefined();
});

test('complete moves the task to Done; Undo reopens it', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Email the group' });
  const task = await Task.findOne({ owner: user._id });
  await post(agent, `/tasks/${task._id}/complete`, { done: '1', returnTo: '/today' });
  let saved = await Task.findById(task._id);
  expect(saved.status).toBe('done');
  expect(saved.completedAt).toBeInstanceOf(Date);
  await post(agent, `/tasks/${task._id}/complete`, { done: '0', returnTo: '/today' });
  saved = await Task.findById(task._id);
  expect(saved.status).not.toBe('done');
  expect(saved.completedAt).toBeNull();
});

test('completing a repeating task creates the next one, a day later', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Water the plants' });
  const task = await Task.findOne({ owner: user._id });
  await post(agent, `/tasks/${task._id}`, form(task, { dueDate: today(user), repeat: 'daily' }), `/tasks/${task._id}`);
  await post(agent, `/tasks/${task._id}/complete`, { done: '1', returnTo: '/today' });
  const next = await Task.findOne({ owner: user._id, completedAt: null });
  expect(next.title).toBe('Water the plants');
  expect(toDateInput(next.dueDate, user.timeZone)).toBe(addDays(today(user), 1));
});

test('delete hides the task; Undo brings it back', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Old idea' });
  const task = await Task.findOne({ owner: user._id });
  await post(agent, `/tasks/${task._id}/delete`, {}, `/tasks/${task._id}`);
  expect((await Task.findById(task._id)).deletedAt).toBeInstanceOf(Date);
  expect((await agent.get(`/tasks/${task._id}`)).status).toBe(404);
  await post(agent, `/tasks/${task._id}/restore`);
  expect((await Task.findById(task._id)).deletedAt).toBeNull();
  expect((await agent.get(`/tasks/${task._id}`)).status).toBe(200);
});

test('Board: moving a card to Done completes the task', async () => {
  const { agent, user } = await signUp();
  await post(agent, '/tasks', { title: 'Slides' });
  const task = await Task.findOne({ owner: user._id });
  await post(agent, `/tasks/${task._id}/move`, { status: 'done' }, '/board');
  const saved = await Task.findById(task._id);
  expect(saved.status).toBe('done');
  expect(saved.completedAt).toBeInstanceOf(Date);
});
