const { Router } = require('express');
const daily = require('../controllers/dailyController');

const router = Router();

router.get('/today', daily.today);

module.exports = router;
