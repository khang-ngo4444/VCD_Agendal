// Insights through the real routes: the Semester period, the semester heatmap, Focus time, and a suggestion that
// stays hidden after Dismiss.
const Task = require('../../models/Task');
const FocusSession = require('../../models/FocusSession');
const User = require('../../models/User');
const { startApp, stopApp, resetData, post, signUp } = require('../helpers/http');

beforeAll(startApp, 120000);
afterAll(stopApp);
beforeEach(resetData);

const DAY = 24 * 60 * 60 * 1000;
// A moment `daysAgo` days back at 09:15 in Ho Chi Minh City (UTC+7), the time zone new accounts start with.
const morning = (daysAgo) => { const d = new Date(Date.now() - daysAgo * DAY); d.setUTCHours(2, 15, 0, 0); return d; };

async function finishedTasks(user, count) {
  await Task.insertMany([...Array(count)].map((_, i) => ({ owner: user._id, title: `Done ${i}`, status: 'done', completedAt: morning(i + 1) })));
}

test('the Semester period is offered and selectable', async () => {
  const { agent } = await signUp();
  const res = await agent.get('/insights?period=semester');
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/href="\?period=semester[^"]*"[^>]*aria-current="page"[^>]*>Semester</);
  expect(res.text).toContain('Compared with the 20 weeks before');
});

test('the heatmap counts the tasks finished this semester', async () => {
  const { agent, user } = await signUp();
  await finishedTasks(user, 4);
  const res = await agent.get('/insights');
  expect(res.text).toContain('Semester activity');
  expect(res.text).toContain('4 tasks done since');
  expect(res.text).toMatch(/Busiest day: [^<]+· 1 task</);
});

test('Focus time adds up the finished focus blocks of the period', async () => {
  const { agent, user } = await signUp();
  let res = await agent.get('/insights');
  expect(res.text).toContain('Start a focus block</a> to see it here');
  const [task] = await Task.insertMany([{ owner: user._id, title: 'Read' }]);
  await FocusSession.insertMany([
    { owner: user._id, task: task._id, startedAt: new Date(Date.now() - 60 * 60 * 1000), minutes: 25 },
    { owner: user._id, task: task._id, startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), minutes: 50 },
  ]);
  res = await agent.get('/insights');
  expect(res.text).toMatch(/Focus time<\/p>\s*<p[^>]*>1\.3 <span[^>]*>h<\/span>/);
});

test('a suggestion appears with enough data, and Dismiss hides it on later visits', async () => {
  const { agent, user } = await signUp();
  await finishedTasks(user, 10);
  let res = await agent.get('/insights');
  expect(res.text).toContain('You finish most tasks between 9 and 11 in the morning.');
  await post(agent, '/insights/suggestions/peak-9/dismiss', { returnTo: '/insights' }, '/insights');
  res = await agent.get('/insights');
  expect(res.text).not.toContain('You finish most tasks between 9 and 11');
  expect(res.text).toContain('No suggestion right now');
  const saved = await User.findById(user._id);
  expect(saved.suggestionsDismissed.get('peak-9').getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
});

test('a malformed suggestion key changes nothing', async () => {
  const { agent, user } = await signUp();
  const res = await post(agent, '/insights/suggestions/..%2Fx/dismiss', {}, '/insights');
  expect(res.status).toBe(302);
  expect((await User.findById(user._id)).suggestionsDismissed).toBeUndefined();
});
