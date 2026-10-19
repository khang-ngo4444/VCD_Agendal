// Background jobs, outside the request cycle. app.js starts them with the server unless JOBS_ENABLED=false.
const cron = require('node-cron');
const { processDueReminders } = require('../services/reminders');
const { processHabitReminders } = require('../services/habitReminders');

let running = false;

// Every minute: task reminders, then habit reminders. A run that is still going (slow mail server) is not started
// twice. Each part logs its own failure, so one failing never stops the other.
async function runReminders() {
  if (running) return;
  running = true;
  try {
    try {
      const result = await processDueReminders();
      if (result.due) console.log(`[reminders] due ${result.due} · sent ${result.sent} · closed ${result.closed} · failed ${result.failed}`);
    } catch (err) {
      console.error('[reminders] run failed:', err);
    }
    try {
      const habits = await processHabitReminders();
      if (habits.sent || habits.failed) console.log(`[habit reminders] sent ${habits.sent} · failed ${habits.failed}`);
    } catch (err) {
      console.error('[habit reminders] run failed:', err);
    }
  } finally {
    running = false;
  }
}

function startJobs() {
  return [cron.schedule('* * * * *', runReminders)];
}

module.exports = { startJobs, runReminders };
