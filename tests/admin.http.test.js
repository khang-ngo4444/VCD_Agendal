// Admin-only routes: the console is invisible to normal accounts (404), and admins stay inside it.
const request = require('supertest');
const User = require('../models/User');
const { startApp, stopApp, resetData, post, signUp, logIn, signUpAdmin } = require('./helpers/http');

let app;
beforeAll(async () => (app = await startApp()), 120000);
afterAll(stopApp);
beforeEach(resetData);

const ADMIN_PAGES = ['/admin', '/admin/users', '/admin/activity'];

test('a normal account gets the same 404 as an unknown page, for every admin page', async () => {
  const { agent } = await signUp();
  for (const path of ADMIN_PAGES) {
    const res = await agent.get(path);
    expect([path, res.status]).toEqual([path, 404]);
  }
});

test('visitors who are not logged in are sent to the login page', async () => {
  for (const path of ADMIN_PAGES) {
    const res = await request(app).get(path);
    expect([path, res.headers.location]).toEqual([path, '/login']);
  }
});

test('an admin can open every admin page', async () => {
  const { agent } = await signUpAdmin();
  for (const path of ADMIN_PAGES) {
    const res = await agent.get(path);
    expect([path, res.status]).toEqual([path, 200]);
  }
});

test('an admin who opens an app page is sent to the console', async () => {
  const { agent } = await signUpAdmin();
  for (const path of ['/today', '/board', '/insights']) {
    const res = await agent.get(path);
    expect([path, res.status, res.headers.location]).toEqual([path, 302, '/admin']);
  }
});

test('a normal account cannot lock anyone: 404, and the other account still logs in', async () => {
  const victim = await signUp('bao@example.com', 'Bao Le');
  const { agent } = await signUp('ana@example.com');
  const res = await post(agent, `/admin/users/${victim.user._id}/lock`, { reason: 'test' });
  expect(res.status).toBe(404);
  expect((await User.findById(victim.user._id)).isLockedByAdmin()).toBe(false);
  expect((await logIn('bao@example.com')).res.headers.location).toBe('/today');
});

test('an admin locks an account: it is logged out and cannot log in; unlocking lets it back in', async () => {
  const bao = await signUp('bao@example.com', 'Bao Le');
  const { agent } = await signUpAdmin();
  await post(agent, `/admin/users/${bao.user._id}/lock`, { reason: 'Spam' }, '/admin/users');
  expect((await User.findById(bao.user._id)).isLockedByAdmin()).toBe(true);
  expect((await bao.agent.get('/today')).headers.location).toBe('/login'); // the open session ended
  expect((await logIn('bao@example.com')).res.status).not.toBe(302);
  await post(agent, `/admin/users/${bao.user._id}/unlock`, {}, '/admin/users');
  expect((await logIn('bao@example.com')).res.headers.location).toBe('/today');
});
