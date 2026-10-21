const { Router } = require('express');
const projects = require('../controllers/projectsController');

const router = Router();

router.get('/projects', projects.index);
router.post('/projects', projects.create);
router.get('/projects/new', projects.newForm);
router.get('/projects/:id/edit', projects.edit);
router.post('/projects/:id', projects.update);
router.post('/projects/:id/move', projects.move);
router.get('/projects/:id', projects.show);
router.post('/projects/:id/rename', projects.rename);
router.post('/projects/:id/colour', projects.setColour);
router.post('/projects/:id/delete', projects.remove);
router.get('/inbox', projects.inbox);

module.exports = router;
