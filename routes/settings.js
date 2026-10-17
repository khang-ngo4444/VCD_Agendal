const { Router } = require('express');
const settings = require('../controllers/settingsController');

const router = Router();

router.get('/settings', settings.index);
router.get('/settings/profile', settings.showProfile);
router.post('/settings/profile', settings.updateProfile);

module.exports = router;
