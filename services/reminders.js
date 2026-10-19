// The reminder job: runs every minute (jobs/scheduler.js) and sends every reminder whose time has come.
const defaultStore = require('./reminderStore');
const defaultNotifier = require('./notifier');
const { emailDecision, countEmail, EMAIL_GAP_MS } = require('./emailLimits');
const { emailChannel } = require('./deliveries');

const MAX_ATTEMPTS = 3; // a reminder that fails this many times is given up on (its lastError says why)
const BATCH_SIZE = 500; // per run; anything left over is picked up a minute later
const CHANNEL_FIELDS = { push: 'pushedAt', email: 'emailedAt' };

// A task completed or deleted since the reminder was set needs no reminder.
const isStale = (task) => !task || Boolean(task.deletedAt) || Boolean(task.completedAt);

const groupByOwner = (reminders) => {
  const groups = new Map();
  for (const reminder of reminders) {
    const key = String(reminder.owner);
    groups.set(key, [...(groups.get(key) ?? []), reminder]);
  }
  return groups;
};

// 'send', 'wait' (try again next run), or 'off' / 'limit' (mark done without sending) for each channel.
const decisions = (user, now) => ({
  push: user.notifications?.push === false ? 'off' : 'send',
  email: emailDecision(user, now),
});

async function claimAll(store, items, field, now) {
  const claimed = [];
  for (const item of items) if (!item.reminder[field] && (await store.claim(item.reminder._id, field, now))) claimed.push(item);
  return claimed;
}

// An email that goes out now also carries the user's reminders due in the next 15 minutes:
// they would otherwise need a second email inside the 15-minute gap. Their push still comes on time.
async function upcomingForEmail(store, ownerId, now) {
  const upcoming = await store.findUpcomingForEmail(ownerId, now, new Date(now.getTime() + EMAIL_GAP_MS), MAX_ATTEMPTS);
  if (!upcoming.length) return [];
  const tasks = await store.loadTasks([...new Set(upcoming.map((r) => String(r.task)))]);
  return upcoming.map((reminder) => ({ reminder, task: tasks.get(String(reminder.task)) })).filter((item) => !isStale(item.task));
}

async function processDueReminders({ now = new Date(), store = defaultStore, notifier = defaultNotifier } = {}) {
  const result = { due: 0, sent: 0, closed: 0, failed: 0 };
  const due = await store.findDue(now, MAX_ATTEMPTS, BATCH_SIZE);
  result.due = due.length;
  if (!due.length) return result;

  const tasks = await store.loadTasks([...new Set(due.map((r) => String(r.task)))]);
  const users = await store.loadUsers([...new Set(due.map((r) => String(r.owner)))]);

  for (const [ownerId, reminders] of groupByOwner(due)) {
    const user = users.get(ownerId);
    const live = [];
    for (const reminder of reminders) {
      const task = tasks.get(String(reminder.task));
      if (!user || isStale(task)) {
        await store.close(reminder._id, now, 'Closed without sending: the task was completed or deleted');
        result.closed += 1;
      } else {
        live.push({ reminder, task });
      }
    }
    if (!live.length) continue;

    const decision = decisions(user, now);
    const delivered = []; // for "Last sent" in Settings (services/deliveries.js)
    for (const [channel, field] of Object.entries(CHANNEL_FIELDS)) {
      if (decision[channel] === 'wait') continue; // still pending; the next allowed email picks it up
      let claimed = await claimAll(store, live, field, now);
      if (decision[channel] !== 'send') continue; // claimed without sending: the channel is off or over its limit
      if (channel === 'email') claimed = [...claimed, ...(await claimAll(store, await upcomingForEmail(store, ownerId, now), field, now))];
      if (!claimed.length) continue;

      try {
        const browsers = await notifier[channel](user, claimed, now);
        if (channel === 'email') delivered.push(emailChannel());
        else if (browsers > 0) delivered.push('push');
      } catch (err) {
        for (const item of claimed) {
          await store.release(item.reminder._id, field); // the next run tries this channel again
          await store.recordFailure(item.reminder._id, `${channel}: ${err.message}`);
        }
        result.failed += claimed.length;
        continue;
      }
      if (channel === 'email') await store.recordEmail(user, countEmail(user, now)); // outside the try: a sent email is never re-sent
    }

    if (delivered.length) await store.recordDelivery?.(user._id, { at: now, channels: delivered, what: live[0].task.title });
    result.sent += await store.finish(live.map((item) => item.reminder._id), now);
  }
  return result;
}

module.exports = { processDueReminders, MAX_ATTEMPTS };
