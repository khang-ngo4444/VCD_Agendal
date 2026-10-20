const { loadInsights } = require('../services/insights');

// Insights (Figma W14): /insights?period=week|month
exports.show = async (req, res) => {
  const insights = await loadInsights(req.user, {
    period: req.query.period,
    projects: res.locals.sidebarProjects,
  });
  res.render('insights', { title: 'Insights · Agendal', ...insights });
};
