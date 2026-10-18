// 60 sample accounts so the admin console has something to show: more than one page of users
// (card "Admin: user list with search") and habit check-ins for the overview chart ("Admin: system statistics").
// Run with `npm run seed:users`. Re-running replaces them and their habits; the demo and admin accounts are not touched.
// They have no password, so nobody can log in as them.
const mongoose = require('mongoose');
const User = require('../models/User');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const { toDateInput } = require('../services/dates');

const COUNT = 60;
const DOMAIN = 'example.test'; // reserved for testing, never a real mailbox
const FIRST = ['Minh', 'Lan', 'Bao', 'Thu', 'An', 'Huy', 'Linh', 'Khoa', 'Mai', 'Nam', 'Trang', 'Duc'];
const LAST = ['Tran', 'Pham', 'Le', 'Vo', 'Nguyen', 'Hoang', 'Dang', 'Bui', 'Do', 'Ngo'];
const HABITS = [
  ['Drink water', '#2f6fde'],
  ['Read 20 pages', '#34c759'],
  ['Morning run', '#ff9f0a'],
];
const CHECK_IN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedUsers() {
  await mongoose.connect(process.env.MONGODB_URI);

  const old = await User.find({ email: new RegExp(`@${DOMAIN.replace('.', '\\.')}$`) }, '_id').lean();
  const oldIds = old.map((user) => user._id);
  await Promise.all([HabitCheckIn.deleteMany({ owner: { $in: oldIds } }), Habit.deleteMany({ owner: { $in: oldIds } })]);
  await User.deleteMany({ _id: { $in: oldIds } });

  const now = Date.now();
  const users = Array.from({ length: COUNT }, (_, i) => {
    const createdAt = new Date(now - ((i * 37) % 60) * DAY_MS - i * 3_600_000); // spread over the last 60 days
    const lastLoginAt = i % 4 === 3 ? undefined : new Date(Math.min(now, createdAt.getTime() + (i % 9) * DAY_MS));
    return {
      email: `sample${String(i + 1).padStart(2, '0')}@${DOMAIN}`,
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      createdAt,
      updatedAt: createdAt,
      onboardedAt: createdAt,
      lastLoginAt,
      lastSeenAt: lastLoginAt && new Date(Math.min(now, lastLoginAt.getTime() + (i % 5) * DAY_MS)),
      lockedUntil: i % 25 === 7 ? new Date(now + 10 * 60 * 1000) : undefined, // a couple are locked out right now
    };
  });
  const created = await User.insertMany(users, { timestamps: false }); // keep the spread-out sign-up dates

  // Two out of three users keep 1–3 habits and check in on most days since they signed up.
  const habits = created.flatMap((user, i) =>
    i % 3 === 0 ? [] : HABITS.slice(0, 1 + (i % 3)).map(([name, colour]) => ({ owner: user._id, name, colour }))
  );
  const savedHabits = await Habit.insertMany(habits);
  const signedUp = new Map(created.map((user) => [String(user._id), user.createdAt.getTime()]));
  const checkIns = savedHabits.flatMap((habit, h) =>
    Array.from({ length: CHECK_IN_DAYS }, (_, d) => ({ d, day: new Date(now - d * DAY_MS) }))
      .filter(({ d, day }) => day >= signedUp.get(String(habit.owner)) && (h * 7 + d * 3) % 5 < 3)
      .map(({ day }) => ({ habit: habit._id, owner: habit.owner, date: toDateInput(day, 'Asia/Ho_Chi_Minh') }))
  );
  await HabitCheckIn.insertMany(checkIns);

  console.log(`Seeded ${COUNT} sample users (sample01…sample${COUNT}@${DOMAIN}), ${savedHabits.length} habits, ${checkIns.length} check-ins`);
}

seedUsers()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
