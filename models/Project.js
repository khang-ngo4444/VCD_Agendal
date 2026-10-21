const { Schema, model } = require('mongoose');

const projectSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    colour: { type: String, default: '#64748b', match: /^#[0-9a-f]{6}$/i }, // views put it in style attributes
    icon: { type: String, default: '', maxlength: 32 },
    order: Number, // legacy items keep creation order until the user reorders them
  },
  { timestamps: true }
);

module.exports = model('Project', projectSchema);
