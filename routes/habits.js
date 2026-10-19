const { Router } = require('express');
const habits = require('../controllers/habitsController');

const router = Router();

router.get('/habits', habits.index);
router.get('/habits/new', habits.new);
router.post('/habits', habits.create);
router.get('/habits/:id/edit', habits.edit);
router.post('/habits/:id', habits.update);
router.post('/habits/:id/archive', habits.setArchived);
router.post('/habits/:id/delete', habits.remove);

module.exports = router;
