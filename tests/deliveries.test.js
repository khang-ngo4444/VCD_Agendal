// "Last sent" in Settings → Notifications.
const { describe: describeDelivery, emailChannel } = require('../services/deliveries');

const now = new Date('2026-10-19T16:00:00Z'); // 23:00 in Ho Chi Minh City
const TZ = 'Asia/Ho_Chi_Minh';

test('says when, what and by which channels', () => {
  const last = { at: new Date('2026-10-19T15:59:00Z'), channels: ['push', 'email'], what: 'Hello world' };
  expect(describeDelivery(last, TZ, now)).toBe('Today 22:59 · “Hello world” · by browser notification and email');
});

test('says plainly when email only went to the server console', () => {
  const last = { at: new Date('2026-10-18T15:59:00Z'), channels: ['console'], what: 'Daily summary' };
  expect(describeDelivery(last, TZ, now)).toBe('Yesterday 22:59 · “Daily summary” · by email printed to the server console (MAIL_HOST isn’t set)');
});

test('nothing sent yet', () => {
  expect(describeDelivery(undefined, TZ, now)).toBeNull();
});

test('email counts as email only when a mail server is set', () => {
  const host = process.env.MAIL_HOST;
  process.env.MAIL_HOST = '';
  expect(emailChannel()).toBe('console');
  process.env.MAIL_HOST = '127.0.0.1';
  expect(emailChannel()).toBe('email');
  process.env.MAIL_HOST = host ?? '';
});
