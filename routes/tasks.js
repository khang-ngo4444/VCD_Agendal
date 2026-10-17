const { Router } = require('express');
const tasks = require('../controllers/tasksController');

const router = Router();

router.get('/tasks/new', tasks.new);
router.post('/tasks', tasks.create);
router.get('/tasks/:id', tasks.show);
router.post('/tasks/:id', tasks.update);
router.post('/tasks/:id/complete', tasks.setComplete);
router.post('/tasks/:id/unschedule', tasks.unschedule);

module.exports = router;
