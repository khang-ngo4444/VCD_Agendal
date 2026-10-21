// No database: how a focus session of a chosen length is split into blocks and breaks (public/js/focus-plan.js).
const { planSession, formatMinutes } = require('../../../public/js/focus-plan');

// "25 b5 30": a 25-minute block, a 5-minute break, a 30-minute block
const schedule = (plan) => plan.steps.map((step) => `${step.kind === 'break' ? 'b' : ''}${step.minutes}`).join(' ');

describe('planSession', () => {
  test('Pomodoro: 25-minute blocks with 5-minute breaks, the spare minutes on the last block', () => {
    expect(schedule(planSession(30, 'pomodoro'))).toBe('30');
    expect(schedule(planSession(60, 'pomodoro'))).toBe('25 b5 30');
    expect(planSession(120, 'pomodoro')).toEqual({
      rhythm: 'pomodoro',
      total: 120,
      steps: [
        { kind: 'focus', minutes: 25 },
        { kind: 'break', minutes: 5 },
        { kind: 'focus', minutes: 25 },
        { kind: 'break', minutes: 5 },
        { kind: 'focus', minutes: 25 },
        { kind: 'break', minutes: 5 },
        { kind: 'focus', minutes: 30 },
      ],
      blocks: 4,
      breaks: 3,
      focusMinutes: 105,
    });
  });

  test('Pomodoro: a 15-minute long break after every 4th block', () => {
    expect(schedule(planSession(180, 'pomodoro'))).toBe('25 b5 25 b5 25 b5 25 b15 25 b5 20');
  });

  test('Deep work: 50-minute blocks, 10-minute breaks, a 20-minute break after every 2nd block', () => {
    expect(schedule(planSession(120, 'deep'))).toBe('50 b10 60');
    expect(schedule(planSession(180, 'deep'))).toBe('50 b10 50 b20 50');
    expect(schedule(planSession(240, 'deep'))).toBe('50 b10 50 b20 50 b10 50');
  });

  test('never a last block under 10 minutes, and never a break at the end', () => {
    expect(schedule(planSession(37, 'pomodoro'))).toBe('37');
    expect(schedule(planSession(40, 'pomodoro'))).toBe('25 b5 10');
    expect(schedule(planSession(10, 'deep'))).toBe('10');
    for (let total = 10; total <= 240; total += 1) {
      for (const rhythm of ['pomodoro', 'deep']) {
        const plan = planSession(total, rhythm);
        expect(plan.steps.at(-1).kind).toBe('focus');
        expect(plan.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(total);
        expect(Math.min(...plan.steps.filter((step) => step.kind === 'focus').map((step) => step.minutes))).toBeGreaterThanOrEqual(10);
      }
    }
  });

  test('only whole minutes from 10 to 240, and a known rhythm', () => {
    expect(planSession(9, 'pomodoro')).toBeNull();
    expect(planSession(241, 'pomodoro')).toBeNull();
    expect(planSession(60.5, 'pomodoro')).toBeNull();
    expect(planSession(Number(''), 'pomodoro')).toBeNull();
    expect(planSession(60, 'sprint')).toBeNull();
    expect(planSession(60, 'toString')).toBeNull();
    expect(planSession(60, undefined)).toBeNull();
  });
});

test('formatMinutes', () => {
  expect([45, 60, 90, 105, 180].map(formatMinutes)).toEqual(['45 min', '1 h', '1 h 30', '1 h 45', '3 h']);
});
