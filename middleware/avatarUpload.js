const multer = require('multer');

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(), // sharp resizes it straight from memory
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (req, file, done) => done(null, AVATAR_TYPES.has(file.mimetype)),
}).single('avatar');

// Parses the multipart avatar form. Mounted before the CSRF check, which needs the parsed `_csrf` field.
// Upload limits become req.uploadError, so the user sees a message instead of a 500.
function avatarUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Choose an image under 2 MB.' : 'Upload one image at a time.';
      return next();
    }
    next(err);
  });
}

module.exports = avatarUpload;
