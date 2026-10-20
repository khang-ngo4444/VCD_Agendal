const { Router } = require('express');
const focus = require('../controllers/focusController');

const router = Router();

router.get('/focus', focus.index);
router.post('/focus/length', focus.setLength);
router.get('/focus/:id', focus.show);
router.post('/focus/:id/sessions', focus.saveSession);

module.exports = router;
