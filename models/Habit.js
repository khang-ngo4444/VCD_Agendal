const { Schema, model } = require('mongoose');

const FREQUENCY_TYPES = ['daily', 'weekdays', 'days', 'timesPerWeek'];

const habitSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    colour: { type: String, default: '#2f6fde', match: /^#[0-9a-f]{6}$/i }, // views put it in style attributes
    frequency: {
      type: { type: String, enum: FREQUENCY_TYPES, default: 'daily' },
      days: { type: [{ type: Number, min: 0, max: 6 }], default: undefined }, // 'days': 0 = Sunday … 6 = Saturday
      timesPerWeek: { type: Number, min: 1, max: 7 }, // 'timesPerWeek' only
    },
    reminderTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, // "HH:mm" in the user's time zone
    archivedAt: { type: Date, default: null }, // archived habits keep their check-ins
  },
  { timestamps: true }
);

module.exports = model('Habit', habitSchema);
module.exports.FREQUENCY_TYPES = FREQUENCY_TYPES;
