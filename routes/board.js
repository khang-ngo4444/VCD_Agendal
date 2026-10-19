const { Router } = require('express');
const board = require('../controllers/boardController');

const router = Router();

router.get('/board', board.show);

module.exports = router;
