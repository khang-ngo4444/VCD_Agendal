const { Schema, model } = require('mongoose');

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

// One occurrence of a repeating event that was changed or cancelled, found by the start it would have had.
const exceptionSchema = new Schema(
  {
    original: { type: Date, required: true },
    cancelled: { type: Boolean, default: false },
    start: Date,
    end: Date,
    title: String,
  },
  { _id: false }
);

// Fixed appointments (lectures, meetings), separate from tasks: they have a time but nothing to tick off.
const eventSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null }, // gives the event its colour
    title: { type: String, required: true, trim: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true }, // all-day events end at midnight after their last day
    allDay: { type: Boolean, default: false },
    location: { type: String, trim: true },
    notes: String,
    repeat: {
      frequency: { type: String, enum: FREQUENCIES }, // unset = happens once
      until: Date, // no repetition starts after this
    },
    exceptions: { type: [exceptionSchema], default: undefined }, // see services/recurrence.js
  },
  { timestamps: true }
);

eventSchema.index({ owner: 1, start: 1 });

module.exports = model('Event', eventSchema);
module.exports.FREQUENCIES = FREQUENCIES;
