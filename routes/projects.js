const { Router } = require('express');
const projects = require('../controllers/projectsController');

const router = Router();

router.get('/projects', projects.index);
router.post('/projects', projects.create);
router.get('/projects/:id', projects.show);
router.post('/projects/:id/rename', projects.rename);
router.post('/projects/:id/delete', projects.remove);
router.get('/inbox', projects.inbox);

module.exports = router;
