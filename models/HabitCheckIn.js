const { Schema, model } = require('mongoose');

const habitCheckInSchema = new Schema(
  {
    habit: { type: Schema.Types.ObjectId, ref: 'Habit', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // the user's local day, "YYYY-MM-DD"
  },
  { timestamps: true }
);

habitCheckInSchema.index({ habit: 1, date: 1 }, { unique: true }); // one check-in per habit per day
habitCheckInSchema.index({ owner: 1, date: 1 }); // a day's check-ins across habits (Daily List, Calendar)

module.exports = model('HabitCheckIn', habitCheckInSchema);
