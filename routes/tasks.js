const { Router } = require('express');
const tasks = require('../controllers/tasksController');

const router = Router();

router.get('/search', tasks.search);
router.get('/tasks/new', tasks.new);
router.post('/tasks', tasks.create);
router.get('/tasks/:id', tasks.show);
router.post('/tasks/:id', tasks.update);
router.post('/tasks/:id/complete', tasks.setComplete);
router.post('/tasks/:id/move', tasks.move);
router.post('/tasks/:id/schedule', tasks.reschedule);
router.post('/tasks/:id/unschedule', tasks.unschedule);
router.get('/tasks/:id/reminder', tasks.showReminder);
router.post('/tasks/:id/reminder', tasks.setReminder);
router.post('/tasks/:id/reminder/remove', tasks.removeReminder);
router.post('/tasks/:id/delete', tasks.remove);
router.post('/tasks/:id/restore', tasks.restore);

module.exports = router;
