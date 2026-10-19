const { Schema, model } = require('mongoose');

const taskSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null }, // null = Inbox
    title: { type: String, required: true, trim: true },
    description: String,
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate: Date,
    schedule: { start: Date, end: Date },
    // Kanban column. Every new task starts in Backlog, whichever page created it; the Board lists newest first there.
    status: { type: String, enum: ['backlog', 'upcoming', 'active', 'done'], default: 'backlog' },
    order: { type: Number, default: 0 }, // position within the column
    completedAt: { type: Date, default: null },
    repeat: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] }, // unset = does not repeat
      until: Date,
    },
    // On the occurrence that completing a repeating task created: that task. Reopening it takes this one back.
    previousOccurrence: { type: Schema.Types.ObjectId, ref: 'Task' },
    deletedAt: { type: Date, default: null }, // soft delete
  },
  { timestamps: true }
);

taskSchema.index({ owner: 1, dueDate: 1 });
taskSchema.index({ owner: 1, 'schedule.start': 1 });

module.exports = model('Task', taskSchema);
