const { parseSearch, isFiltered, searchFilter } = require('../../../services/taskSearch');

const user = { _id: 'u1', timeZone: 'Asia/Ho_Chi_Minh', preferences: { weekStartsOn: 1 } }; // UTC+7, weeks start Monday
const now = new Date('2026-10-21T03:00:00Z'); // 10:00 on Wednesday 21 October in UTC+7
const PROJECT = '6ad5e4bb3e41f10094641300';

describe('reading the search page’s query string', () => {
  test('repeated filters arrive as lists, and unknown values are dropped', () => {
    const search = parseSearch({ q: '  lab  report ', project: [PROJECT, 'inbox', 'nope'], priority: 'high', status: ['open', 'lost'], due: 'soon' });
    expect(search).toMatchObject({ q: 'lab  report', words: ['lab', 'report'], projects: [PROJECT, 'inbox'], priorities: ['high'], statuses: ['open'], due: '' });
  });

  test('"Pick dates" only counts as a filter once a date is picked', () => {
    expect(isFiltered(parseSearch({ due: 'range' }))).toBe(false);
    expect(isFiltered(parseSearch({ due: 'range', from: '2026-10-01' }))).toBe(true);
    expect(isFiltered(parseSearch({ q: 'report' }))).toBe(false);
  });
});

describe('the database query', () => {
  const conditions = (query) => searchFilter(parseSearch(query), user, now).$and;

  test('always the user’s own tasks that aren’t deleted; no filters means no extra conditions', () => {
    expect(searchFilter(parseSearch({}), user, now)).toEqual({ owner: 'u1', deletedAt: null });
  });

  test('every word must match the title or description, literally and in any case', () => {
    const [first, second] = conditions({ q: 'a+b Lab' });
    expect(first.$or[0].title.test('xA+By')).toBe(true);
    expect(first.$or[0].title.test('aab')).toBe(false); // "+" is not a regex quantifier here
    expect(second.$or[1].description.test('the lab report')).toBe(true);
  });

  test('values in one group are alternatives, and the groups combine', () => {
    expect(conditions({ project: ['inbox', PROJECT], priority: ['high', 'medium'] })).toEqual([
      { project: { $in: [null, PROJECT] } },
      { priority: { $in: ['high', 'medium'] } },
    ]);
    expect(conditions({ status: ['overdue', 'completed'] })).toEqual([
      { $or: [{ completedAt: null, dueDate: { $lt: now } }, { completedAt: { $ne: null } }] },
    ]);
  });

  test('"This week" is the user’s week, Monday to Sunday in their time zone, on the due or scheduled date', () => {
    const start = new Date('2026-10-18T17:00:00Z'); // Monday 19 October, 00:00 in UTC+7
    const end = new Date('2026-10-25T17:00:00Z'); // the Monday after
    expect(conditions({ due: 'week' })).toEqual([{ $or: [{ dueDate: { $gte: start, $lt: end } }, { 'schedule.start': { $gte: start, $lt: end } }] }]);
  });

  test('"No date" means neither a due date nor a schedule; a picked range includes both end days', () => {
    expect(conditions({ due: 'none' })).toEqual([{ dueDate: null, 'schedule.start': null }]);
    const [range] = conditions({ due: 'range', from: '2026-10-01', to: '2026-10-02' });
    expect(range.$or[0].dueDate).toEqual({ $gte: new Date('2026-09-30T17:00:00Z'), $lt: new Date('2026-10-02T17:00:00Z') });
  });
});
