// Focus mode through the real routes: Start leads to the plan, the plan is saved and carried to the timer, and the
// timer's finished blocks are saved.
const Task = require('../../models/Task');
const FocusSession = require('../../models/FocusSession');
const User = require('../../models/User');
const { startApp, stopApp, resetData, post, signUp } = require('../helpers/http');

beforeAll(startApp, 120000);
afterAll(stopApp);
beforeEach(resetData);

async function taskFor(user, fields = {}) {
  const [task] = await Task.insertMany([{ owner: user._id, title: 'Revise joins', ...fields }]);
  return task;
}

test('Start leads to the plan, which opens on one hour of Pomodoro', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user);
  let res = await agent.get('/focus');
  expect(res.text).toContain(`href="/focus/${task._id}/plan" data-focus-plan="Revise joins · Inbox"`);
  expect(res.text).toContain('id="focus-plan-dialog"');
  expect(res.text).not.toContain('/focus/length');
  res = await agent.get(`/focus/${task._id}/plan`);
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/value="60" class="peer sr-only" checked/);
  expect(res.text).toMatch(/value="pomodoro" class="peer sr-only" checked/);
});

test('the timer without a plan goes to the plan first', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user);
  for (const query of ['', '?minutes=5&rhythm=pomodoro', '?minutes=60&rhythm=sprint']) {
    const res = await agent.get(`/focus/${task._id}${query}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/focus/${task._id}/plan`);
  }
});

test('a plan is saved to the account and the timer runs it', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user);
  let res = await post(agent, `/focus/${task._id}/plan`, { minutes: '120', rhythm: 'pomodoro' }, '/focus');
  expect(res.headers.location).toBe(`/focus/${task._id}?rhythm=pomodoro&minutes=120`);
  expect((await User.findById(user._id)).preferences.focusPlan.toObject()).toEqual({ rhythm: 'pomodoro', minutes: 120 });
  res = await agent.get(res.headers.location);
  expect(res.status).toBe(200);
  expect(res.text).toContain('data-plan-key="pomodoro-120"');
  expect(res.text).toContain('&#34;minutes&#34;:30'); // the last block takes the spare 5 minutes
  expect(res.text).toContain('Block 1 of 4');
  expect(res.text).toContain('Pomodoro · 2 h');
  expect(res.text).toContain('Session complete');
});

test('a custom length is used, and one out of range is refused', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user);
  let res = await post(agent, `/focus/${task._id}/plan`, { minutes: 'custom', custom: '75', rhythm: 'deep' }, '/focus');
  expect(res.headers.location).toBe(`/focus/${task._id}?rhythm=deep&minutes=75`);
  res = await agent.get(`/focus/${task._id}/plan`);
  expect(res.text).toMatch(/value="custom" class="peer sr-only" checked/);
  expect(res.text).toContain('name="custom" min="10" max="240" step="5" value="75"');

  res = await post(agent, `/focus/${task._id}/plan`, { minutes: 'custom', custom: '500', rhythm: 'deep' }, '/focus');
  expect(res.headers.location).toBe(`/focus/${task._id}/plan`);
  res = await agent.get(res.headers.location);
  expect(res.text).toContain('Pick a length from 10 minutes to 4 hours.');
  expect((await User.findById(user._id)).preferences.focusPlan.minutes).toBe(75);
});

test('a finished task is not planned', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user, { status: 'done', completedAt: new Date() });
  const res = await post(agent, `/focus/${task._id}/plan`, { minutes: '60', rhythm: 'pomodoro' }, '/focus');
  expect(res.headers.location).toBe('/focus');
});

test('finished blocks of any planned length are saved once; impossible ones are refused', async () => {
  const { agent, user } = await signUp();
  const task = await taskFor(user);
  const startedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  let res = await post(agent, `/focus/${task._id}/sessions`, { startedAt, minutes: '30' }, `/focus/${task._id}/plan`);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({ minutes: 30, sessionsToday: 1, minutesToday: 30 });
  res = await post(agent, `/focus/${task._id}/sessions`, { startedAt, minutes: '30' }, `/focus/${task._id}/plan`);
  expect(res.status).toBe(200);
  res = await post(agent, `/focus/${task._id}/sessions`, { startedAt, minutes: '45' }, `/focus/${task._id}/plan`);
  expect(res.status).toBe(422);
  expect(await FocusSession.countDocuments({ task: task._id })).toBe(1);
});
