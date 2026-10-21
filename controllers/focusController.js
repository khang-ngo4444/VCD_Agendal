const FocusSession = require('../models/FocusSession');
const Task = require('../models/Task');
const { flash } = require('../middleware/flash');
const { findOwned } = require('../services/ownership');
const { RHYTHMS, TOTALS, planSession, formatMinutes, savedPlan, checkSession, todaysSessions, focusChoices } = require('../services/focus');

const findOwnedTask = (req) => findOwned(Task, req.params.id, req.user._id, { deletedAt: null });
const projectOf = (res, task) => res.locals.sidebarProjects.find((project) => project.id === (task.project ? String(task.project) : null));
const planUrl = (task) => `/focus/${task._id}/plan`;

// A finished task can't be focused on any more: back to the list with a note.
function refuseDone(req, res, task) {
  flash(req, 'info', `“${task.title}” is already done. Pick another task.`);
  res.redirect('/focus');
}

// Focus (Figma W13a): pick a task. Today's tasks first, the rest below. Start opens the plan dialog (W13e).
exports.index = async (req, res) => {
  const [choices, focused] = await Promise.all([focusChoices(req.user), todaysSessions(req.user)]);
  res.render('focus/index', {
    title: 'Focus · Agendal',
    todayTasks: choices.today,
    otherTasks: choices.other,
    maxOther: choices.maxOther,
    focused,
    rhythms: Object.values(RHYTHMS),
    totals: TOTALS,
    choice: savedPlan(req.user),
    formatMinutes,
  });
};

// The plan form on a page of its own: where Start leads without JavaScript, and where a wrong length comes back to.
exports.plan = async (req, res) => {
  const task = await findOwnedTask(req);
  if (task.completedAt) return refuseDone(req, res, task);
  res.render('focus/plan', {
    title: `Plan · ${task.title} · Agendal`,
    task,
    project: projectOf(res, task),
    rhythms: Object.values(RHYTHMS),
    totals: TOTALS,
    choice: savedPlan(req.user),
    formatMinutes,
  });
};

// How long and which rhythm. Saved to the account so the dialog opens on it next time, on every device; the plan
// itself travels in the timer's address, so a reload carries on with the same session.
exports.setPlan = async (req, res) => {
  const task = await findOwnedTask(req);
  if (task.completedAt) return refuseDone(req, res, task);
  const minutes = req.body?.minutes === 'custom' ? req.body?.custom : req.body?.minutes;
  const plan = planSession(Number(minutes), req.body?.rhythm);
  if (!plan) {
    flash(req, 'error', 'Pick a length from 10 minutes to 4 hours.');
    return res.redirect(planUrl(task));
  }
  req.user.set('preferences.focusPlan', { rhythm: plan.rhythm, minutes: plan.total });
  await req.user.save();
  res.redirect(`/focus/${task._id}?${new URLSearchParams({ rhythm: plan.rhythm, minutes: plan.total })}`);
};

// The timer (Figma W13b–d, W13f), full screen. It runs in the browser (public/js/focus.js); the server only saves
// blocks. Without a plan in the address it goes to the plan form first.
exports.show = async (req, res) => {
  const task = await findOwnedTask(req);
  if (task.completedAt) return refuseDone(req, res, task);
  const plan = planSession(Number(req.query.minutes), req.query.rhythm);
  if (!plan) return res.redirect(planUrl(task));
  const today = await todaysSessions(req.user);
  res.render('focus/timer', {
    title: `Focus · ${task.title} · Agendal`,
    task,
    project: projectOf(res, task),
    plan,
    rhythm: RHYTHMS[plan.rhythm],
    sessionsToday: today.sessions.length,
    formatMinutes,
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
