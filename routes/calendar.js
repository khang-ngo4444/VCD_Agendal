const { Router } = require('express');
const calendar = require('../controllers/calendarController');

const router = Router();

router.get('/calendar', calendar.show);

module.exports = router;
