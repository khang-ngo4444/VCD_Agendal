const { Schema, model } = require('mongoose');

const reminderSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remindAt: { type: Date, required: true },
    // Minutes before the task's scheduled start (a preset), so the reminder moves when the task is rescheduled.
    // null: a date and time the user picked, which stays put (services/taskReminders.js).
    offsetMinutes: { type: Number, default: null },
    // Kept for existing data only: the user's notification settings decide the channels (services/reminders.js).
    type: { type: String, enum: ['push', 'email'], default: 'push' },
    sent: { type: Boolean, default: false }, // true once every channel is done, skipped, or given up on
    sentAt: Date,
    // Each channel is claimed by setting its date before sending, so two job runs never send the same reminder twice.
    pushedAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 }, // failed sends; the job stops retrying at MAX_ATTEMPTS
    lastError: String, // why the last send failed or why the reminder was closed without sending
  },
  { timestamps: true }
);

reminderSchema.index({ owner: 1, remindAt: 1 });
reminderSchema.index({ sent: 1, remindAt: 1 }); // the reminder job polls unsent, due reminders

module.exports = model('Reminder', reminderSchema);
