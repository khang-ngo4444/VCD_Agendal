const { Schema, model } = require('mongoose');

// One focus block that ran to the end (Focus mode, Figma W13). Paused time isn't counted: minutes is the block's length.
const focusSessionSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    startedAt: { type: Date, required: true },
    minutes: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

focusSessionSchema.index({ owner: 1, startedAt: 1 }); // a day's sessions (the Focus page, Insights)

module.exports = model('FocusSession', focusSessionSchema);
