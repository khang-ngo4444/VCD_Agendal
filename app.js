const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => res.render('home', { title: 'Agendal' }));

module.exports = app;

// Exported without listen() so tests can mount the app; `npm run dev` starts the server.
if (require.main === module) {
  const port = process.env.PORT || 3000;
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('MongoDB connected');
      app.listen(port, () => console.log(`Agendal running at http://localhost:${port}`));
    })
    .catch((err) => {
      console.error('MongoDB connection failed:', err.message);
      process.exitCode = 1;
    });
}
