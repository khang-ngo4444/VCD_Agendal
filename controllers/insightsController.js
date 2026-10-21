const { loadInsights } = require('../services/insights');
const { tasksCsv, checkInsCsv } = require('../services/csvExport');
const { toDateInput } = require('../services/dates');
const { safeReturnTo } = require('../services/returnTo');
const { dismissUntil } = require('../services/suggestions');

const CHART_TYPES = ['bar', 'line'];

// Insights (Figma W14): /insights?period=week|month|semester&sort=current|longest|rate
exports.show = async (req, res) => {
  const insights = await loadInsights(req.user, {
    period: req.query.period,
    sort: req.query.sort,
    projects: res.locals.sidebarProjects,
  });
  res.render('insights', { title: 'Insights · Agendal', ...insights, chartType: req.user.preferences?.insightsChart ?? 'bar' });
};

// Bars / Lines on the 30-day chart, saved to the account so every device shows the same. public/js/insights.js posts
// it in the background (204); without JavaScript the form submits and the page comes back with the new chart.
exports.setChart = async (req, res) => {
  const chart = req.body?.chart;
  if (CHART_TYPES.includes(chart)) {
    req.user.set('preferences.insightsChart', chart);
    await req.user.save();
  }
  if (req.get('X-Requested-With') === 'fetch') return res.status(204).end();
  res.redirect(safeReturnTo(req.body?.returnTo, '/insights'));
};

function sendCsv(res, name, csv, timeZone) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="agendal-${name}-${toDateInput(new Date(), timeZone)}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}

exports.exportTasks = async (req, res) => sendCsv(res, 'tasks', await tasksCsv(req.user, res.locals.sidebarProjects), req.user.timeZone);
exports.exportCheckIns = async (req, res) => sendCsv(res, 'habit-checkins', await checkInsCsv(req.user), req.user.timeZone);

// "Dismiss" on a suggestion: hidden for 7 days (DISMISS_DAYS) on every device. Expired entries are dropped on the way.
const SUGGESTION_KEY = /^[a-z0-9-]{1,60}$/;
exports.dismissSuggestion = async (req, res) => {
  const { key } = req.params;
  if (SUGGESTION_KEY.test(key)) {
    const now = new Date();
    const kept = [...(req.user.suggestionsDismissed ?? new Map())].filter(([, until]) => until > now);
    req.user.suggestionsDismissed = new Map([...kept, [key, dismissUntil(now)]]);
    await req.user.save();
  }
  res.redirect(safeReturnTo(req.body?.returnTo, '/insights'));
};
