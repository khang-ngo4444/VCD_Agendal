const { Router } = require('express');
const focus = require('../controllers/focusController');

const router = Router();

router.get('/focus', focus.index);
router.get('/focus/:id', focus.show);
router.get('/focus/:id/plan', focus.plan);
router.post('/focus/:id/plan', focus.setPlan);
router.post('/focus/:id/sessions', focus.saveSession);

module.exports = router;
