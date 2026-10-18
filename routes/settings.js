const { Router } = require('express');
const settings = require('../controllers/settingsController');

const router = Router();

router.get('/settings', settings.index);
router.get('/settings/profile', settings.showProfile);
router.post('/settings/profile', settings.updateProfile);
router.post('/settings/avatar', settings.updateAvatar); // body parsed by avatarUpload in app.js
router.get('/settings/appearance', settings.showAppearance);
router.post('/settings/appearance', settings.updateAppearance);
router.get('/settings/account', settings.showAccount);
router.post('/settings/password', settings.changePassword);
router.get('/settings/account/delete', settings.showDeleteAccount);
router.post('/settings/account/delete', settings.deleteAccount);

module.exports = router;
