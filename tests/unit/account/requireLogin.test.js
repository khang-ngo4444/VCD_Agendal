// requireLogin with User.findById stubbed: a locked account's session is dropped even if its version still matches.
const User = require('../../../models/User');
const { requireLogin } = require('../../../middleware/auth');

function run(user, session = { userId: 'u1', sessionVersion: 2 }) {
  jest.spyOn(User, 'findById').mockResolvedValue(user);
  jest.spyOn(User, 'updateOne').mockResolvedValue({}); // the hourly lastSeenAt write
  session.destroy = jest.fn((done) => done());
  const req = { session };
  const res = { locals: {}, redirect: jest.fn(), set: jest.fn() }; // set: the no-store Cache-Control header
  const next = jest.fn();
  return requireLogin(req, res, next).then(() => ({ req, res, next, session }));
}

const account = (fields) => Object.assign(new User({ email: 'demo@agendal.app', sessionVersion: 2 }), fields);

afterEach(() => jest.restoreAllMocks());

test('a normal account carries on', async () => {
  const { next, req } = await run(account({}));
  expect(next).toHaveBeenCalledWith();
  expect(req.user.email).toBe('demo@agendal.app');
});

test('lastSeenAt is saved at most once an hour', async () => {
  await run(account({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) }));
  expect(User.updateOne).not.toHaveBeenCalled();
  jest.restoreAllMocks();

  await run(account({ lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }));
  expect(User.updateOne).toHaveBeenCalledWith({ _id: expect.anything() }, { $set: { lastSeenAt: expect.any(Date) } });
});

test('an account locked by an admin is logged out', async () => {
  const { next, res, session } = await run(account({ adminLock: { at: new Date() } }));
  expect(next).not.toHaveBeenCalled();
  expect(session.destroy).toHaveBeenCalled();
  expect(res.redirect).toHaveBeenCalledWith('/login');
});
