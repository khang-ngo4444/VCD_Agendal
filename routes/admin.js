// The admin console (Figma page 05 · Admin). Mounted at /admin in app.js, after requireLogin.
const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const admin = require('../controllers/adminController');
const User = require('../models/User');

const router = Router();

router.use(requireAdmin); // non-admins leave this router here and get the normal 404
router.use((req, res, next) => {
  res.locals.currentPath = req.baseUrl + (req.path === '/' ? '' : req.path);
  next();
});
// The account count beside "Users" in the sidebar, on every admin page.
router.use(async (req, res, next) => {
  res.locals.userCount = await User.countDocuments();
  next();
});

router.get('/', admin.overview);
router.get('/users', admin.users);
router.get('/activity', admin.activity);

module.exports = router;
