// 60 sample accounts so the admin user list has more than one page (card "Admin: user list with search").
// Run with `npm run seed:users`. Re-running replaces them; the demo and admin accounts are not touched.
// They have no password, so nobody can log in as them.
const mongoose = require('mongoose');
const User = require('../models/User');

const COUNT = 60;
const DOMAIN = 'example.test'; // reserved for testing, never a real mailbox
const FIRST = ['Minh', 'Lan', 'Bao', 'Thu', 'An', 'Huy', 'Linh', 'Khoa', 'Mai', 'Nam', 'Trang', 'Duc'];
const LAST = ['Tran', 'Pham', 'Le', 'Vo', 'Nguyen', 'Hoang', 'Dang', 'Bui', 'Do', 'Ngo'];

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedUsers() {
  await mongoose.connect(process.env.MONGODB_URI);
  await User.deleteMany({ email: new RegExp(`@${DOMAIN.replace('.', '\\.')}$`) });

  const now = Date.now();
  const users = Array.from({ length: COUNT }, (_, i) => {
    const createdAt = new Date(now - ((i * 37) % 60) * DAY_MS - i * 3_600_000); // spread over the last 60 days
    return {
      email: `sample${String(i + 1).padStart(2, '0')}@${DOMAIN}`,
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      createdAt,
      updatedAt: createdAt,
      onboardedAt: createdAt,
      lastLoginAt: i % 4 === 3 ? undefined : new Date(Math.min(now, createdAt.getTime() + (i % 9) * DAY_MS)),
      lockedUntil: i % 25 === 7 ? new Date(now + 10 * 60 * 1000) : undefined, // a couple are locked out right now
    };
  });
  await User.insertMany(users, { timestamps: false }); // keep the spread-out sign-up dates

  console.log(`Seeded ${COUNT} sample users (sample01…sample${COUNT}@${DOMAIN}) for the admin user list`);
}

seedUsers()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
