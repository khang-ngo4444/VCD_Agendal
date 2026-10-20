// No database: the models' delete calls are stubbed, so these cover what gets checked, deleted and logged, and in what order.
jest.mock('node:fs/promises', () => ({ rm: jest.fn().mockResolvedValue() }));
const fs = require('node:fs/promises');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { checkConfirmation, deleteAccount, OWNED } = require('../services/accountDeletion');

const withPassword = { email: 'demo@agendal.app', passwordHash: 'x', checkPassword: async (password) => password === 'right-password' };
const googleOnly = { email: 'demo@agendal.app', passwordHash: undefined };

describe('checkConfirmation', () => {
  test('the right password and the ticked box let it go ahead', async () => {
    expect(await checkConfirmation(withPassword, { deletePassword: 'right-password', understand: 'on' })).toEqual({});
  });

  test('a wrong password or an unticked box stop it', async () => {
    expect(await checkConfirmation(withPassword, { deletePassword: 'wrong', understand: 'on' })).toHaveProperty('deletePassword');
    expect(await checkConfirmation(withPassword, { deletePassword: 'right-password' })).toHaveProperty('understand');
  });

  test('a Google-only account confirms by typing its email, in any case', async () => {
    expect(await checkConfirmation(googleOnly, { deleteEmail: ' Demo@Agendal.app ', understand: 'on' })).toEqual({});
    expect(await checkConfirmation(googleOnly, { deleteEmail: 'someone@else.com', understand: 'on' })).toHaveProperty('deleteEmail');
  });

  test('crafted values (arrays, nothing at all) are refused', async () => {
    const errors = await checkConfirmation(withPassword, { deletePassword: ['right-password'], understand: ['on'] });
    expect(Object.keys(errors).sort()).toEqual(['deletePassword', 'understand']);
    expect(Object.keys(await checkConfirmation(googleOnly, undefined)).sort()).toEqual(['deleteEmail', 'understand']);
  });
});

describe('deleteAccount', () => {
  const user = { _id: '64b000000000000000000002', id: '64b000000000000000000002', email: 'demo@agendal.app', avatar: '/uploads/avatars/x.webp' };
  const req = { ip: '116.98.4.12' };
  let order;

  beforeEach(() => {
    order = [];
    jest.spyOn(ActivityLog, 'create').mockImplementation(async () => order.push('log'));
    for (const Model of OWNED) {
      jest.spyOn(Model, 'deleteMany').mockImplementation(async () => (order.push(Model.modelName), { deletedCount: 2 }));
    }
    jest.spyOn(User, 'deleteOne').mockImplementation(async () => order.push('User'));
    fs.rm.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  test('removes everything the account owns, then the account, and logs it first', async () => {
    const counts = await deleteAccount(req, user);
    expect(order[0]).toBe('log');
    expect(order.at(-1)).toBe('User');
    expect(order.slice(1, -1).sort()).toEqual(['Event', 'FocusSession', 'Habit', 'HabitCheckIn', 'Project', 'Reminder', 'Task']);
    for (const Model of OWNED) expect(Model.deleteMany).toHaveBeenCalledWith({ owner: user._id });
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: user._id });
    expect(counts).toEqual({ Reminder: 2, HabitCheckIn: 2, Habit: 2, Event: 2, FocusSession: 2, Task: 2, Project: 2 });
  });

  test('the log entry keeps the email, since the account itself is gone', async () => {
    await deleteAccount(req, user);
    expect(ActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account_deleted', email: 'demo@agendal.app', account: user._id, ip: req.ip })
    );
  });

  test('the uploaded photo is removed too', async () => {
    await deleteAccount(req, user);
    expect(fs.rm).toHaveBeenCalledWith(expect.stringMatching(/avatars[\\/]64b000000000000000000002\.webp$/), { force: true });
    fs.rm.mockClear();
    await deleteAccount(req, { ...user, avatar: undefined });
    expect(fs.rm).not.toHaveBeenCalled();
  });
});
