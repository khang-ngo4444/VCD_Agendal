const express = require('express');
const { requireAdmin, keepAdminsInConsole } = require('../middleware/auth');

// The real admin router, with the database-backed page swapped for a stub.
jest.mock('../controllers/adminController', () => ({
  overview: (req, res) => res.send('admin overview'),
  users: (req, res) => res.send('users'),
  lock: (req, res) => res.send('locked'),
  unlock: (req, res) => res.send('unlocked'),
  activity: (req, res) => res.send('activity log'),
}));
jest.mock('../models/User', () => ({ countDocuments: async () => 63 })); // the sidebar's account count
const adminRoutes = require('../routes/admin');

const admin = { role: 'admin' };
const member = { role: 'user' };

describe('admin middleware', () => {
  test('requireAdmin lets an admin through', () => {
    const next = jest.fn();
    requireAdmin({ user: admin }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('requireAdmin sends everyone else out of the admin router', () => {
    for (const user of [member, undefined]) {
      const next = jest.fn();
      requireAdmin({ user }, {}, next);
      expect(next).toHaveBeenCalledWith('router');
    }
  });

  test('admins opening an app page are sent to /admin; users carry on', () => {
    const res = { redirect: jest.fn() };
    const next = jest.fn();
    keepAdminsInConsole({ user: admin }, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/admin');
    expect(next).not.toHaveBeenCalled();

    keepAdminsInConsole({ user: member }, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

// The same wiring as app.js: a logged-in user, the admin router, the app pages, then the 404 page.
async function request(user, path, method = 'GET') {
  const app = express();
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/admin', adminRoutes);
  app.use(keepAdminsInConsole);
  app.get('/today', (req, res) => res.send('today'));
  app.use((req, res) => res.status(404).send('Page not found'));

  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, redirect: 'manual' });
    return { status: response.status, body: await response.text(), location: response.headers.get('location') };
  } finally {
    server.close();
  }
}

describe('the /admin area', () => {
  test('an admin opens /admin', async () => {
    expect(await request(admin, '/admin')).toMatchObject({ status: 200, body: 'admin overview' });
  });

  test('a normal user gets the same 404 as any unknown address', async () => {
    const adminPage = await request(member, '/admin');
    const unknownPage = await request(member, '/no-such-page');
    expect(adminPage).toMatchObject({ status: 404, body: 'Page not found' });
    expect(adminPage).toEqual(unknownPage);
    expect(await request(member, '/admin/users')).toMatchObject({ status: 404 });
    expect(await request(member, '/admin/activity')).toMatchObject({ status: 404 });
    expect(await request(member, '/admin/users/64b000000000000000000002/lock', 'POST')).toMatchObject({ status: 404 });
  });

  test('an admin opens the activity log and the user list', async () => {
    expect(await request(admin, '/admin/activity')).toMatchObject({ status: 200, body: 'activity log' });
    expect(await request(admin, '/admin/users')).toMatchObject({ status: 200, body: 'users' });
  });

  test('an admin opening an app page (e.g. after logging in) lands on /admin', async () => {
    expect(await request(admin, '/today')).toMatchObject({ status: 302, location: '/admin' });
  });

  test('a normal user still uses the app', async () => {
    expect(await request(member, '/today')).toMatchObject({ status: 200, body: 'today' });
  });
});
