// Background jobs, outside the request cycle. app.js starts them with the server unless JOBS_ENABLED=false.
const cron = require('node-cron');
const { processDueReminders } = require('../services/reminders');

let running = false;

// Every minute. A run that is still going (slow mail server) is not started twice.
async function runReminders() {
  if (running) return;
  running = true;
  try {
    const result = await processDueReminders();
    if (result.due) console.log(`[reminders] due ${result.due} · sent ${result.sent} · closed ${result.closed} · failed ${result.failed}`);
  } catch (err) {
    console.error('[reminders] run failed:', err);
  } finally {
    running = false;
  }
}

function startJobs() {
  return [cron.schedule('* * * * *', runReminders)];
}

module.exports = { startJobs, runReminders };
