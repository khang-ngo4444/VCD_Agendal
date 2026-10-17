const { Router } = require('express');
const tasks = require('../controllers/tasksController');

const router = Router();

router.get('/tasks/new', tasks.new);
router.post('/tasks', tasks.create);
router.post('/tasks/:id/complete', tasks.setComplete);

module.exports = router;
