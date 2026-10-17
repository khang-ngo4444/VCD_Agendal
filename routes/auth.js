const { Router } = require('express');
const auth = require('../controllers/authController');
const { guestOnly } = require('../middleware/auth');

const router = Router();

router.get('/register', guestOnly, auth.showRegister);
router.post('/register', guestOnly, auth.register);
router.get('/login', guestOnly, auth.showLogin);
router.post('/login', guestOnly, auth.login);
router.post('/logout', auth.logout);

module.exports = router;
