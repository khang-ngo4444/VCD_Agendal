const { Schema, model } = require('mongoose');

const projectSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    colour: { type: String, default: '#64748b', match: /^#[0-9a-f]{6}$/i }, // views put it in style attributes
  },
  { timestamps: true }
);

module.exports = model('Project', projectSchema);
