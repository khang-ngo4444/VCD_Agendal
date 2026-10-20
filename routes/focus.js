const { Router } = require('express');
const focus = require('../controllers/focusController');

const router = Router();

router.get('/focus', focus.index);
router.post('/focus/length', focus.setLength);

module.exports = router;
