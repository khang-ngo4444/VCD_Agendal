const { Router } = require('express');
const settings = require('../controllers/settingsController');

const router = Router();

router.get('/settings', settings.index);
router.get('/settings/profile', settings.showProfile);
router.post('/settings/profile', settings.updateProfile);
router.post('/settings/avatar', settings.updateAvatar); // body parsed by avatarUpload in app.js

module.exports = router;
