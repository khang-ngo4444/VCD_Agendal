// The admin console (Figma page 05 · Admin). Mounted at /admin in app.js, after requireLogin.
const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const admin = require('../controllers/adminController');

const router = Router();

router.use(requireAdmin); // non-admins leave this router here and get the normal 404
router.use((req, res, next) => {
  res.locals.currentPath = req.baseUrl + (req.path === '/' ? '' : req.path);
  next();
});

router.get('/', admin.overview);

module.exports = router;
