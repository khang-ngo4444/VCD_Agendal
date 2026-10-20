const { LENGTHS, lengthFor, todaysSessions, focusChoices } = require('../services/focus');

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
