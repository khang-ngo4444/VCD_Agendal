// One-time messages that survive a redirect: flash(req, 'success', 'Project deleted.') then res.redirect(...).
// footer.ejs shows them as a toast on the next page. Pass { undoUrl } to give the toast an Undo button that posts there.
function flash(req, type, message, { undoUrl } = {}) {
  req.session.flash = { type, message, undoUrl };
}

function showFlash(req, res, next) {
  if (req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  next();
}

module.exports = { flash, showFlash };
