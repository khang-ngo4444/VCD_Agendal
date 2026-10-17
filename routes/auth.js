const { Router } = require('express');
const auth = require('../controllers/authController');
const { guestOnly } = require('../middleware/auth');

const router = Router();

router.get('/register', guestOnly, auth.showRegister);
router.post('/register', guestOnly, auth.register);

module.exports = router;
