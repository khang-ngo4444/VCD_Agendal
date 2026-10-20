const { loadInsights } = require('../services/insights');

// Insights (Figma W14): /insights
exports.show = async (req, res) => {
  const insights = await loadInsights(req.user);
  res.render('insights', { title: 'Insights · Agendal', ...insights });
};
