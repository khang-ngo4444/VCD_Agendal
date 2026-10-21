// Focus mode: how a session of a chosen length is split into focus blocks and breaks (Figma W13e / M47c).
// Shared by the server (services/focus.js) and the plan dialog (public/js/focus.js), so the preview and the timer
// always agree. In the browser it sets window.agendalFocusPlan.
//
// The rhythms follow the usual advice: Pomodoro (Cirillo) is 25 min of focus and a 5-minute break, with a longer
// break after 4 blocks; Deep work uses 50-minute blocks with breaks of about a fifth of the block. Minutes that don't
// fill another block and its break go to the last block, and a session never ends with a break.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.agendalFocusPlan = factory();
})(globalThis, () => {
  const RHYTHMS = {
    pomodoro: { key: 'pomodoro', name: 'Pomodoro', focus: 25, rest: 5, longRest: 15, longEvery: 4 },
    deep: { key: 'deep', name: 'Deep work', focus: 50, rest: 10, longRest: 20, longEvery: 2 },
  };
  const TOTALS = [30, 60, 90, 120, 180]; // the lengths offered as chips; Custom takes any other
  const MIN_TOTAL = 10;
  const MAX_TOTAL = 240;
  const MIN_BLOCK = 10; // never a last block shorter than this: the minutes go to the block before

  // { rhythm, total, steps: [{ kind: 'focus' | 'break', minutes }], blocks, breaks, focusMinutes }, or null when the
  // length is not a whole number of minutes from 10 to 240 or the rhythm is unknown.
  function planSession(totalMinutes, rhythmKey) {
    const rhythm = Object.hasOwn(RHYTHMS, rhythmKey) ? RHYTHMS[rhythmKey] : null;
    const total = Number(totalMinutes);
    if (!rhythm || !Number.isInteger(total) || total < MIN_TOTAL || total > MAX_TOTAL) return null;
    const steps = [];
    let left = total;
    for (let blocks = 1; ; blocks += 1) {
      const rest = blocks % rhythm.longEvery === 0 ? rhythm.longRest : rhythm.rest;
      if (left - rhythm.focus - rest < MIN_BLOCK) {
        steps.push({ kind: 'focus', minutes: left });
        break;
      }
      steps.push({ kind: 'focus', minutes: rhythm.focus }, { kind: 'break', minutes: rest });
      left -= rhythm.focus + rest;
    }
    const focus = steps.filter((step) => step.kind === 'focus');
    return {
      rhythm: rhythm.key,
      total,
      steps,
      blocks: focus.length,
      breaks: steps.length - focus.length,
      focusMinutes: focus.reduce((sum, step) => sum + step.minutes, 0),
    };
  }

  // 45 → "45 min", 60 → "1 h", 105 → "1 h 45"
  function formatMinutes(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const rest = minutes % 60;
    return `${Math.floor(minutes / 60)} h${rest ? ` ${rest}` : ''}`;
  }

  return { RHYTHMS, TOTALS, MIN_TOTAL, MAX_TOTAL, planSession, formatMinutes };
});
