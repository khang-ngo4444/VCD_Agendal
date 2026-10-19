const { Router } = require('express');
const events = require('../controllers/eventsController');

const router = Router();

router.get('/events/new', events.new);
router.post('/events', events.create);
router.get('/events/:id', events.edit);
router.post('/events/:id', events.update);
router.post('/events/:id/delete', events.remove);

module.exports = router;
