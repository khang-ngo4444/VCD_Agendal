// Data every page inside the app shell needs.
function loadShell(req, res, next) {
  res.locals.currentPath = req.path;
  next();
}

module.exports = loadShell;
