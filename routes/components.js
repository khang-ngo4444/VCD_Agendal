// Demo of the shared UI partials (Trello: "Reusable UI partials"). Not mounted in production.
const { Router } = require('express');
const { flash } = require('../middleware/flash');

const router = Router();

router.get('/components', (req, res) => res.render('components', { title: 'Components · Agendal' }));

router.post('/components/flash', (req, res) => {
  flash(req, 'success', 'This message came from the server after a redirect.');
  res.redirect('/components');
});

router.post('/components/delete', (req, res) => {
  flash(req, 'success', 'Demo project deleted (nothing was really deleted).');
  res.redirect('/components');
});

module.exports = router;
