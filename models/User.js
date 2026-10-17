const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: String, // absent for Google-only accounts
    name: { type: String, trim: true },
    avatar: String,
    timeZone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      accentColour: String,
      weekStartsOn: { type: Number, enum: [0, 1], default: 1 }, // 0 = Sunday, 1 = Monday
    },
    googleId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
