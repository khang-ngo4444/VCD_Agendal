const mongoose = require('mongoose');

// Loads a document by ID only if `ownerId` owns it. Another user's document gets the same 404
// as a missing one, so changing an ID in the URL can't even confirm that it exists.
// Pass `filter` for extra conditions, e.g. { deletedAt: null } for tasks.
async function findOwned(Model, id, ownerId, filter = {}) {
  const doc = mongoose.isValidObjectId(id) && (await Model.findOne({ ...filter, _id: id, owner: ownerId }));
  if (!doc) throw Object.assign(new Error(`${Model.modelName} not found`), { status: 404 });
  return doc;
}

module.exports = { findOwned };
