// Demo data: one user, 4 projects, 40 tasks across the Daily List, Kanban and Calendar, a few reminders.
// Run with `npm run seed`. Re-running replaces the previous demo data.
const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');

const DEMO_EMAIL = 'demo@agendal.app';
const DEMO_PASSWORD = 'demo1234';

const PROJECTS = [
  ['University', '#3b82f6'],
  ['Work', '#22c55e'],
  ['Personal', '#f59e0b'],
  ['Health', '#ef4444'],
];

// [title, project index (null = Inbox), due in N days (null = no date), scheduled hour (null = unscheduled), extra]
const TASKS = [
  ['Review lecture notes: CSS Grid', 0, 0, 9],
  ['Submit lab report 3', 0, -2, null, { priority: 'high' }],
  ['Prepare slides for group presentation', 0, 1, 14, { priority: 'high' }],
  ['Read chapter 5: Responsive design', 0, -1, null, { done: true }],
  ['Study for Advanced Web Design quiz', 0, 3, 19],
  ['Email lecturer about project topic', 0, -4, null, { done: true }],
  ['Finish Figma wireframes', 0, 2, null],
  ['Group meeting', 0, 0, 15, { repeat: 'weekly' }],
  ['Practice MongoDB queries', 0, null, null, { priority: 'low' }],
  ['Write ERD for final project', 0, -3, null, { done: true }],
  ['Reply to client emails', 1, 0, 8, { repeat: 'daily' }],
  ['Update portfolio website', 1, 5, null],
  ['Fix navigation bug on landing page', 1, -1, null, { priority: 'high' }],
  ['Weekly team sync', 1, 1, 10, { repeat: 'weekly' }],
  ['Write monthly report', 1, 7, null, { repeat: 'monthly' }],
  ['Code review for login feature', 1, 0, 13],
  ['Plan next sprint', 1, 4, 9],
  ['Clean up old branches', 1, null, null, { priority: 'low' }],
  ['Send invoice', 1, -5, null, { done: true }],
  ['Research web push notifications', 1, null, null],
  ['Call parents', 2, 0, 20, { repeat: 'weekly' }],
  ['Pay electricity bill', 2, -1, null, { done: true }],
  ['Buy groceries', 2, 0, null],
  ['Plan weekend trip', 2, 6, null, { priority: 'low' }],
  ['Renew passport', 2, -3, null, { priority: 'high' }],
  ['Clean the room', 2, 2, 10],
  ['Read a novel for 30 minutes', 2, 0, 22, { repeat: 'daily' }],
  ['Buy a birthday gift', 2, 4, null],
  ['Organise photos', 2, null, null, { priority: 'low' }],
  ['Back up laptop', 2, -6, null, { done: true }],
  ['Morning run', 3, 1, 6, { repeat: 'daily' }],
  ['Gym: upper body', 3, 0, 17],
  ['Dentist appointment', 3, 8, 15, { priority: 'high' }],
  ['Meal prep for the week', 3, 3, 16, { repeat: 'weekly' }],
  ['Drink 2 litres of water', 3, 0, null, { repeat: 'daily' }],
  ['Yoga session', 3, -2, 18, { done: true }],
  ['Book health check-up', 3, null, null],
  ['Try the new note-taking app', null, null, null, { priority: 'low' }],
  ['Return library books', null, -1, null],
  ['Look up summer internships', null, 10, null],
];

const day = (offset, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const old = await User.findOne({ email: DEMO_EMAIL });
  if (old) {
    await Promise.all([Reminder, Task, Project].map((M) => M.deleteMany({ owner: old._id })));
    await old.deleteOne();
  }

  const user = new User({ email: DEMO_EMAIL, name: 'Demo User', onboardedAt: new Date() });
  await user.setPassword(DEMO_PASSWORD);
  await user.save();
  const projects = await Project.insertMany(PROJECTS.map(([name, colour]) => ({ owner: user._id, name, colour })));

  const columnSize = {};
  const tasks = await Task.insertMany(
    TASKS.map(([title, project, offset, hour, { done, repeat, priority } = {}]) => {
      const status = done ? 'done' : offset === null ? 'backlog' : offset <= 0 ? 'active' : 'upcoming';
      columnSize[status] = (columnSize[status] ?? 0) + 1;
      return {
        owner: user._id,
        project: project === null ? null : projects[project]._id,
        title,
        priority,
        dueDate: offset === null ? undefined : day(offset, 23, 59),
        schedule: hour === null ? undefined : { start: day(offset, hour), end: day(offset, hour + 1) },
        status,
        order: columnSize[status] - 1,
        completedAt: done ? day(offset, 12) : null,
        repeat: repeat && { frequency: repeat },
      };
    })
  );

  const upcoming = tasks.filter((t) => t.schedule?.start > new Date() && !t.completedAt).slice(0, 4);
  await Reminder.insertMany(
    upcoming.map((t) => ({ task: t._id, owner: user._id, remindAt: new Date(t.schedule.start - 15 * 60 * 1000) }))
  );

  console.log(`Seeded ${DEMO_EMAIL} (password ${DEMO_PASSWORD}): ${projects.length} projects, ${tasks.length} tasks, ${upcoming.length} reminders`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
