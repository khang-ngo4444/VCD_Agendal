const { Schema, model } = require('mongoose');

const reminderSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remindAt: { type: Date, required: true },
    type: { type: String, enum: ['push', 'email'], default: 'push' },
    sent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reminderSchema.index({ owner: 1, remindAt: 1 });
reminderSchema.index({ sent: 1, remindAt: 1 }); // the reminder job polls unsent, due reminders

module.exports = model('Reminder', reminderSchema);
