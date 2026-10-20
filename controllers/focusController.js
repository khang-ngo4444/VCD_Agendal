const FocusSession = require('../models/FocusSession');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { LENGTHS, lengthFor, checkSession, todaysSessions, focusChoices } = require('../services/focus');

const findOwnedTask = (req) => findOwned(Task, req.params.id, req.user._id, { deletedAt: null });

// Focus (Figma W13a): pick a task and the length. Today's tasks first, the rest below.
exports.index = async (req, res) => {
  const [choices, focused] = await Promise.all([focusChoices(req.user), todaysSessions(req.user)]);
  res.render('focus/index', {
    title: 'Focus · Agendal',
    todayTasks: choices.today,
    otherTasks: choices.other,
    maxOther: choices.maxOther,
    focused,
    lengths: LENGTHS,
    length: lengthFor(req.user.preferences?.focusMinutes),
  });
};

// 25 / 5 or 50 / 10, saved to the account so every device starts with the same.
exports.setLength = async (req, res) => {
  const minutes = Number(req.body?.minutes);
  if (LENGTHS.some((length) => length.focus === minutes)) {
    req.user.set('preferences.focusMinutes', minutes);
    await req.user.save();
  }
  res.redirect('/focus');
};

// The timer (Figma W13b–d), full screen. It runs in the browser (public/js/focus.js); the server only saves blocks.
exports.show = async (req, res) => {
  const task = await findOwnedTask(req);
  if (task.completedAt) {
    flash(req, 'info', `“${task.title}” is already done. Pick another task.`);
    return res.redirect('/focus');
  }
  const today = await todaysSessions(req.user);
  res.render('focus/timer', {
    title: `Focus · ${task.title} · Agendal`,
    task,
    project: res.locals.sidebarProjects.find((project) => project.id === (task.project ? String(task.project) : null)),
    length: lengthFor(req.user.preferences?.focusMinutes),
    sessionsToday: today.sessions.length,
  });
};

// A finished focus block, posted by the timer page in the background. Answers JSON: the page stays as it is.
// The page may send the same block twice (a retry, or on leaving), so a block is identified by its start time.
exports.saveSession = async (req, res) => {
  const task = await findOwnedTask(req);
  const { session, error } = checkSession(req.body);
  if (error) return res.status(422).json({ error });
  const block = { owner: req.user._id, task: task._id, startedAt: session.startedAt };
  const created = await FocusSession.updateOne(block, { $setOnInsert: { ...block, minutes: session.minutes } }, { upsert: true });
  const today = await todaysSessions(req.user);
  res.status(created.upsertedCount ? 201 : 200).json({ minutes: session.minutes, sessionsToday: today.sessions.length, minutesToday: today.minutes });
};
