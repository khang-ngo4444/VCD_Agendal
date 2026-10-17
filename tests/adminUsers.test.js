// No database: these cover the filters, paging and status the /admin/users page is built from.
const { userFilter, pageNumber, statusOf, PAGE_SIZE } = require('../services/adminUsers');

const now = new Date('2026-10-17T08:00:00Z');

describe('userFilter', () => {
  test('no query lists every account', () => {
    expect(userFilter({}, now)).toEqual({ filter: {}, chip: '', search: '' });
  });

  test('"Active" leaves out admins and accounts locked out right now', () => {
    expect(userFilter({ status: 'active' }, now).filter).toEqual({
      role: { $ne: 'admin' },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    });
  });

  test('"Signed up this week" means the last 7 days', () => {
    expect(userFilter({ status: 'new' }, now).filter).toEqual({ createdAt: { $gte: new Date('2026-10-10T08:00:00Z') } });
  });

  test('search matches email or name, literally and ignoring case', () => {
    const { filter, search } = userFilter({ q: '  Demo+1 ' }, now);
    expect(search).toBe('Demo+1');
    const [email, name] = filter.$or.map((clause) => Object.values(clause)[0]);
    expect(email.test('demo+1@agendal.app')).toBe(true);
    expect(email.test('demoo1@agendal.app')).toBe(false);
    expect(name.source).toBe(email.source);
  });

  test('a chip and a search are combined', () => {
    const { filter } = userFilter({ status: 'admins', q: 'support' }, now);
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0]).toEqual({ role: 'admin' });
  });

  test('unknown chips and crafted arrays are ignored', () => {
    expect(userFilter({ status: 'constructor', q: ['a'] }, now)).toEqual({ filter: {}, chip: '', search: '' });
    expect(userFilter({ status: ['admins'] }, now).chip).toBe('');
  });
});

describe('pageNumber', () => {
  test(`pages hold ${PAGE_SIZE} accounts`, () => {
    expect(pageNumber('2', 63)).toEqual({ page: 2, pages: 2 });
    expect(pageNumber(undefined, 63)).toEqual({ page: 1, pages: 2 });
  });

  test('out-of-range and junk values land on a real page', () => {
    expect(pageNumber('99', 63)).toEqual({ page: 2, pages: 2 });
    expect(pageNumber('-3', 63)).toEqual({ page: 1, pages: 2 });
    expect(pageNumber('abc', 63)).toEqual({ page: 1, pages: 2 });
    expect(pageNumber('1', 0)).toEqual({ page: 1, pages: 1 });
  });
});

test('statusOf: admin, locked out, active', () => {
  expect(statusOf({ role: 'admin' }, now).label).toBe('Admin');
  expect(statusOf({ role: 'user', lockedUntil: new Date('2026-10-17T08:10:00Z') }, now).label).toBe('Locked out');
  expect(statusOf({ role: 'user', lockedUntil: new Date('2026-10-17T07:50:00Z') }, now).label).toBe('Active');
  expect(statusOf({}, now).label).toBe('Active');
});
