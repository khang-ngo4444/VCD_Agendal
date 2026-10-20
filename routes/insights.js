const { Router } = require('express');
const insights = require('../controllers/insightsController');

const router = Router();

router.get('/insights', insights.show);
router.get('/stats', (req, res) => res.redirect(301, '/insights')); // the name the Trello cards use
router.post('/insights/chart', insights.setChart);

module.exports = router;
