// Sign up, log in, the lockout after 10 failed logins, log out, and the pages that need (or refuse) a session.
const request = require('supertest');
const User = require('../models/User');
const { PASSWORD, startApp, stopApp, resetData, csrf, signUp, logIn } = require('./helpers/http');

let app;
beforeAll(async () => (app = await startApp()), 120000);
afterAll(stopApp);
beforeEach(resetData);

async function register(fields) {
  const agent = request.agent(app);
  const token = await csrf(agent, '/register');
  const res = await agent.post('/register').type('form').send({ _csrf: token, ...fields });
  return { agent, res };
}

describe('sign up', () => {
  test('a new account is created, signed in and sent to the Welcome screen', async () => {
    const { agent, res } = await register({ name: 'Ana Tran', email: 'Ana@Example.com ', password: PASSWORD });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/welcome');
    const user = await User.findOne({ email: 'ana@example.com' });
    expect(user).not.toBeNull();
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect((await agent.get('/welcome')).status).toBe(200);
  });

  test('an email that already has an account is refused, and no second account is made', async () => {
    await signUp('ana@example.com');
    const { res } = await register({ name: 'Someone', email: 'ana@example.com', password: PASSWORD });
    expect(res.status).toBe(422);
    expect(res.text).toContain('This email already has an account.');
    expect(await User.countDocuments({ email: 'ana@example.com' })).toBe(1);
  });

  test('a short or common password is refused with a message that says how to fix it', async () => {
    const short = await register({ name: 'Ana', email: 'ana@example.com', password: 'abc' });
    expect(short.res.status).toBe(422);
    expect(short.res.text).toContain('Use at least 8 characters.');
    const common = await register({ name: 'Ana', email: 'ana@example.com', password: 'password123' });
    expect(common.res.status).toBe(422);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('log in', () => {
  test('the right password opens the Daily List', async () => {
    await signUp('ana@example.com');
    const { agent, res } = await logIn('ana@example.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/today');
    expect((await agent.get('/today')).status).toBe(200);
  });

  test('a wrong password or an unknown email gets the same message', async () => {
    await signUp('ana@example.com');
    const wrong = await logIn('ana@example.com', 'not the password');
    const unknown = await logIn('nobody@example.com', 'not the password');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.text).toContain('That email and password don');
    expect(unknown.res.text).toContain('That email and password don');
  });

  test('10 failed logins lock the account; then even the right password is refused', async () => {
    await signUp('ana@example.com');
    for (let i = 0; i < User.MAX_FAILED_LOGINS; i++) await logIn('ana@example.com', 'not the password');
    const user = await User.findOne({ email: 'ana@example.com' });
    expect(user.lockMinutesLeft()).toBeGreaterThan(0);
    const { res } = await logIn('ana@example.com');
    expect(res.status).not.toBe(302);
    expect(res.text).toMatch(/locked|minutes/i);
  });
});

describe('sessions', () => {
  test('app pages send visitors without a session to the login page', async () => {
    for (const path of ['/today', '/board', '/calendar', '/habits', '/insights', '/focus', '/settings']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    }
  });

  test('a signed-in user who opens the login page goes to the Daily List', async () => {
    const { agent } = await signUp();
    const res = await agent.get('/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/today');
  });

  test('log out ends the session', async () => {
    const { agent } = await signUp();
    const token = await csrf(agent, '/today');
    await agent.post('/logout').type('form').send({ _csrf: token });
    const res = await agent.get('/today');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('a form posted without the CSRF token is refused', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/tasks').type('form').send({ title: 'No token' });
    expect(res.status).toBe(403);
  });
});
