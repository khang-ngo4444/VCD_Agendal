// Focus mode (views/focus, Figma W13 / M47).
// - The Focus page: the box above "Other open tasks" filters the list as you type, and Start opens the plan dialog.
// - The plan form (dialog or page): previews the session for the picked length and rhythm (public/js/focus-plan.js).
// - The timer page: runs the planned session. Each focus block is followed by its break and the next block, by
//   themselves, until Session complete. Time is counted from the end time, not by ticks, so a background tab or a
//   sleeping laptop still changes on time, and the state is kept in localStorage so a reload carries on. A block
//   that runs to the end is saved (POST /focus/:id/sessions).

(() => {
  const at = (ms) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms); // like services/dates.js formatTime
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  // ---- Focus page: filter "Other open tasks". Set up again whenever the page content is swapped in (app.js). ----
  function setUpFilter() {
    const filter = document.querySelector('[data-focus-filter]');
    if (!filter) return;
    filter.hidden = false;
    const input = filter.querySelector('input');
    const rows = [...document.querySelectorAll('#focus-other-list [data-focus-task]')];
    const none = document.querySelector('[data-focus-no-match]');
    input.addEventListener('input', () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows) {
        row.hidden = !words.every((word) => row.dataset.focusTask.includes(word));
        if (!row.hidden) shown += 1;
      }
      none.hidden = shown > 0;
    });
  }

  // ---- The plan form: the schedule for the picked length and rhythm, with the time it ends ----
  function showPlan(form) {
    const { planSession, formatMinutes } = window.agendalFocusPlan;
    const picked = form.querySelector('[name=minutes]:checked')?.value;
    const minutes = picked === 'custom' ? form.elements.custom.value : picked;
    const plan = planSession(Number(minutes), form.querySelector('[name=rhythm]:checked')?.value);
    const preview = form.querySelector('[data-plan-preview]');
    preview.hidden = false;
    form.querySelector('button[type=submit]').disabled = !plan;
    const bar = form.querySelector('[data-plan-bar]');
    const summary = form.querySelector('[data-plan-summary]');
    if (!plan) {
      bar.replaceChildren();
      form.querySelector('[data-plan-steps]').textContent = '';
      summary.textContent = 'Pick a length from 10 minutes to 4 hours.';
      form.querySelector('[data-plan-ends]').textContent = '';
      return;
    }
    bar.replaceChildren(
      ...plan.steps.map((step) => {
        const part = document.createElement('span');
        part.className = `rounded-full ${step.kind === 'focus' ? 'bg-primary' : 'bg-success'}`;
        part.style.flexGrow = step.minutes;
        return part;
      }),
    );
    form.querySelector('[data-plan-steps]').textContent = plan.steps.map((step) => `${step.kind === 'focus' ? 'Focus' : 'break'} ${step.minutes}`).join(' · ');
    summary.textContent = `${plural(plan.blocks, 'block')} · ${formatMinutes(plan.focusMinutes)} focused · ${plural(plan.breaks, 'break')}`;
    form.querySelector('[data-plan-ends]').textContent = `Starts now · ends at ${at(Date.now() + plan.total * 60 * 1000)}`;
  }
  const setUpPlanForms = () => document.querySelectorAll('[data-plan-form]').forEach(showPlan);

  if (!window.agendalFocus) {
    window.agendalFocus = true;
    setUpFilter();
    setUpPlanForms();
    document.addEventListener('agendal:render', () => {
      setUpFilter();
      setUpPlanForms();
    });
    // Start opens the plan dialog for that task. A new tab or window still gets the plan page.
    document.addEventListener('click', (event) => {
      const start = event.target.closest('[data-focus-plan]');
      const dialog = document.getElementById('focus-plan-dialog');
      if (!start || !dialog || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const form = dialog.querySelector('[data-plan-form]');
      form.action = start.getAttribute('href');
      dialog.querySelector('[data-plan-task]').textContent = start.dataset.focusPlan;
      showPlan(form);
      dialog.showModal();
    });
    document.addEventListener('click', (event) => event.target.closest('[data-plan-cancel]')?.closest('dialog').close());
    for (const type of ['change', 'input']) {
      document.addEventListener(type, (event) => {
        const form = event.target.closest?.('[data-plan-form]');
        if (form) showPlan(form);
      });
    }
  }

  // ---- Timer page ----
  const root = document.querySelector('[data-focus-timer]');
  if (!root) return;

  const KEY = 'agendal.focus';
  const MINUTE = 60 * 1000;
  const RETRY_MS = 30 * 1000;
  const LIVE_MS = 5000; // a change counts as live (chime, toast) when it happened this recently, not when catching up
  const taskId = root.dataset.taskId;
  const planKey = root.dataset.planKey;
  const blockMinutes = Number(root.dataset.blockMinutes);
  const { formatMinutes } = window.agendalFocusPlan;
  const $ = (selector) => root.querySelector(selector);
  const time = $('[data-time]');
  const status = $('[data-status]');
  const ring = $('[data-ring]');
  const bar = $('[data-plan-bar]');
  const announcer = $('[data-announce]');
  const toggleButton = $('[data-toggle]');
  const skipButton = $('[data-skip]');
  const notifyButton = $('[data-notify]');
  const leaveDialog = document.getElementById('focus-leave-dialog');
  const csrfToken = () => document.querySelector('input[name=_csrf]')?.value ?? '';

  // state: steps (the plan: { kind: 'focus' | 'break', minutes }), step (index of the current one; steps.length once
  // the session is complete); endsAt (ms) while running, else remaining (ms); startedAt (ISO) of the current focus
  // block; finishedAt (ms) of the session; pending: finished blocks not saved yet.
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  };
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // private mode: the timer still runs, it just won't survive a reload
    }
  };
  // Ends focus mode for this task. A finished block that is still waiting to be saved goes out first; keepalive lets
  // the request finish while the page navigates away.
  const forget = () => {
    for (const block of state.pending) {
      const body = new URLSearchParams(block);
      fetch(`/focus/${taskId}/sessions`, { method: 'POST', body, keepalive: true, headers: { 'X-CSRF-Token': csrfToken(), 'X-Requested-With': 'fetch' } }).catch(() => {});
    }
    state.pending = [];
    try {
      localStorage.removeItem(KEY);
    } catch {}
  };

  const stepMs = (index) => state.steps[index].minutes * MINUTE;
  const fresh = (now) => {
    const steps = JSON.parse(root.dataset.plan);
    const ms = steps[0].minutes * MINUTE;
    return { taskId, planKey, steps, step: 0, endsAt: now + ms, remaining: ms, startedAt: new Date(now).toISOString(), finishedAt: null, sessions: Number(root.dataset.sessionsToday), pending: [] };
  };
  const stored = read();
  let state = stored?.taskId === taskId && stored.planKey === planKey && Array.isArray(stored.steps) ? stored : fresh(Date.now());
  state.sessions = Math.max(state.sessions, Number(root.dataset.sessionsToday));

  const complete = () => state.step >= state.steps.length;
  const phase = () => (complete() ? 'complete' : state.steps[state.step].kind);
  const running = () => state.endsAt != null;
  const left = (now = Date.now()) => Math.max(0, running() ? state.endsAt - now : state.remaining);
  // Which block or break the step is (1-based), and how many there are
  const countOf = (kind, upTo = state.steps.length - 1) => state.steps.slice(0, upTo + 1).filter((step) => step.kind === kind).length;
  const focusedMinutes = () => state.steps.slice(0, state.step).reduce((sum, step) => sum + (step.kind === 'focus' && !step.skipped ? step.minutes : 0), 0);
  // When the session ends if nothing is paused or skipped
  const sessionEnd = () => state.endsAt + state.steps.slice(state.step + 1).reduce((sum, step) => sum + step.minutes * MINUTE, 0);
  const clock = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const announce = (text) => (announcer.textContent = text);

  // ---- A short chime when a block or a break ends (Web Audio, no file). Browsers only allow sound after a click
  // or key press on the page, so the context is made on the first one. ----
  let audio;
  const unlockAudio = () => {
    audio ??= window.AudioContext ? new AudioContext() : null;
    audio?.resume?.();
  };
  ['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, unlockAudio, { once: true }));
  function chime() {
    if (!audio || audio.state !== 'running') return;
    [0, 0.18].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.55);
    });
  }

  // ---- A system notification when the tab is in the background, once the user has allowed it ----
  const canNotify = 'Notification' in window;
  if (canNotify && Notification.permission === 'default') notifyButton.hidden = false;
  notifyButton.addEventListener('click', async () => {
    await Notification.requestPermission().catch(() => {});
    notifyButton.hidden = true;
  });
  function notify(text) {
    if (!canNotify || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    try {
      new Notification('Agendal focus', { body: text, tag: 'agendal-focus' });
    } catch {
      // some phones only allow notifications from a service worker
    }
  }

  // A change of step the user should hear about: the chime, a toast on the page, a notification when it's hidden
  function tell(text, live) {
    announce(text);
    if (!live) return;
    chime();
    window.agendal?.toast(text);
    notify(text);
  }

  // ---- Keep the screen on while the timer runs (phones), where the browser supports it ----
  let wakeLock = null;
  if ('wakeLock' in navigator) $('[data-wake-note]').hidden = false;
  async function holdScreen() {
    const want = running() && document.visibilityState === 'visible';
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      wakeLock?.addEventListener('release', () => (wakeLock = null));
    } else if (!want && wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  // ---- Saving finished blocks ----
  let saving = false;
  let lastTry = 0;
  async function savePending() {
    if (saving || !state.pending.length || Date.now() - lastTry < RETRY_MS) return;
    saving = true;
    lastTry = Date.now();
    const block = state.pending[0];
    try {
      const response = await fetch(`/focus/${taskId}/sessions`, {
        method: 'POST',
        body: new URLSearchParams(block),
        headers: { 'X-CSRF-Token': csrfToken(), 'X-Requested-With': 'fetch', 'X-Tab-Id': window.agendal?.tabId ?? '' },
      });
      if (response.status === 422) {
        state.pending.shift(); // the server won't take it (e.g. too old): don't keep trying
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      } else {
        const result = await response.json();
        state.pending.shift();
        state.sessions = result.sessionsToday;
      }
      lastTry = 0;
      write();
      render();
    } catch {
      window.agendal?.toast('Couldn’t save this focus block. Trying again shortly.', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  // ---- State changes ----
  // Starts step `index` at `from` (ms), or ends the session when there is none left.
  function begin(index, from) {
    state.step = index;
    if (complete()) {
      Object.assign(state, { endsAt: null, remaining: 0, finishedAt: from });
      return;
    }
    Object.assign(state, { endsAt: from + stepMs(index), remaining: stepMs(index) });
    if (state.steps[index].kind === 'focus') state.startedAt = new Date(from).toISOString();
  }

  // What the user hears when step `index` has just begun
  function changeText() {
    if (complete()) return `Session complete · ${formatMinutes(focusedMinutes())} focused.`;
    const block = countOf('focus', state.step);
    if (phase() === 'break') return `Block ${block} done · ${state.steps[state.step].minutes}-minute break · block ${block + 1} starts by itself at ${at(state.endsAt)}.`;
    return `Break over · block ${block} of ${countOf('focus')} until ${at(state.endsAt)}.`;
  }

  // Moves past every end time that has gone by (several, if the tab slept through them).
  function catchUp(now = Date.now()) {
    let changed = false;
    while (running() && now >= state.endsAt) {
      changed = true;
      const ended = state.endsAt;
      if (phase() === 'focus') {
        state.pending.push({ startedAt: state.startedAt, minutes: state.steps[state.step].minutes });
        state.sessions += 1;
      }
      begin(state.step + 1, ended);
      tell(changeText(), now - ended < LIVE_MS);
    }
    if (changed) {
      lastTry = 0;
      write();
      holdScreen();
    }
  }

  function toggle() {
    if (complete()) return;
    const now = Date.now();
    if (running()) {
      state.remaining = left(now);
      state.endsAt = null;
      announce('Paused.');
    } else {
      state.endsAt = now + state.remaining;
      announce('Resumed.');
    }
    write();
    holdScreen();
    render();
  }

  // Starts the current block or break again from the top
  function restart() {
    const now = Date.now();
    begin(state.step, now);
    announce(phase() === 'break' ? 'Break restarted.' : 'Block restarted.');
    write();
    holdScreen();
    render();
  }

  // Skipping a block moves on without counting it; skipping a break starts the next block now.
  function skip() {
    const now = Date.now();
    const wasFocus = phase() === 'focus';
    if (wasFocus) state.steps[state.step].skipped = true;
    begin(state.step + 1, now);
    announce(`${wasFocus ? 'Block skipped, it isn’t counted. ' : ''}${changeText()}`);
    write();
    holdScreen();
    render();
  }

  // Session complete › One more block: a block of the rhythm's length, starting now
  function moreBlock() {
    state.steps.push({ kind: 'focus', minutes: blockMinutes });
    begin(state.steps.length - 1, Date.now());
    announce(`One more block until ${at(state.endsAt)}.`);
    write();
    holdScreen();
    render();
  }

  function leave() {
    forget();
    location.assign('/focus');
  }

  // Leaving mid-block loses it, so that one case asks first (W13d); a break, a paused timer or the end leaves at once.
  function exit() {
    if (phase() !== 'focus' || !running()) return leave();
    leaveDialog.querySelector('[data-leave-detail]').textContent = `${clock(left())} left. This block won’t be saved; the task stays open.`;
    leaveDialog.returnValue = '';
    leaveDialog.showModal();
  }
  leaveDialog.addEventListener('close', () => leaveDialog.returnValue === 'leave' && leave());

  // ---- Drawing ----
  let barDrawn = '';
  function drawBar() {
    const key = `${state.steps.length}:${state.step}`;
    if (key === barDrawn) return;
    barDrawn = key;
    const colour = (step, index) => {
      if (complete()) return step.kind === 'focus' && !step.skipped ? 'bg-success' : 'bg-base-content/15';
      if (index === state.step) return step.kind === 'focus' ? 'bg-primary' : 'bg-success';
      if (index < state.step) return step.kind === 'focus' && !step.skipped ? 'bg-base-content' : 'bg-base-content/20';
      return step.kind === 'focus' ? 'bg-base-content/15' : 'bg-base-content/8';
    };
    bar.replaceChildren(
      ...state.steps.map((step, index) => {
        const part = document.createElement('span');
        part.className = `rounded-full ${colour(step, index)}`;
        part.style.flexGrow = step.minutes;
        return part;
      }),
    );
  }

  // The ring jumps, not sweeps backwards, when a new block or break begins
  let ringStep = null;
  function resetRing() {
    if (ringStep === state.step) return;
    ringStep = state.step;
    ring.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => ring.style.removeProperty('transition')));
  }

  let wasComplete = false;
  function render() {
    const now = Date.now();
    const current = phase();
    root.dataset.phase = current;
    drawBar();
    const done = complete();
    $('[data-running]').hidden = done;
    $('[data-complete]').hidden = !done;
    const label = $('[data-session-label]');
    if (done) {
      label.textContent = `Done · ${at(state.finishedAt)}`;
      $('[data-complete-summary]').textContent = `${formatMinutes(focusedMinutes())} focused · ${plural(countOf('focus') - state.steps.filter((step) => step.skipped).length, 'block')}`;
      document.title = 'Session complete — Agendal';
      if (!wasComplete) $('[data-complete-heading]').focus({ preventScroll: true });
      wasComplete = true;
      return;
    }
    wasComplete = false;
    const remaining = left(now);
    const isRunning = running();
    const block = countOf('focus', state.step);
    const blocks = countOf('focus');
    const isLast = state.step === state.steps.length - 1;
    time.textContent = clock(remaining);
    resetRing();
    const offset = (100 * remaining) / stepMs(state.step); // the arc shows the time gone by
    ring.style.strokeDashoffset = String(offset);
    ring.style.opacity = offset > 99.5 ? '0' : '1'; // no lone round cap at the top before the first second
    if (current === 'break') {
      label.textContent = `Break ${countOf('break', state.step)} of ${countOf('break')} · block ${block + 1} at ${isRunning ? at(state.endsAt) : '…'}`;
      status.textContent = isRunning ? `Break · block ${block + 1} at ${at(state.endsAt)}` : 'Paused';
    } else {
      label.textContent = `Block ${block} of ${blocks} · ${isRunning ? `ends ${at(sessionEnd())}` : 'paused'}`;
      status.textContent = !isRunning ? 'Paused' : isLast ? `Last block · done at ${at(state.endsAt)}` : `Focusing · break at ${at(state.endsAt)}`;
    }
    toggleButton.setAttribute('aria-label', isRunning ? 'Pause' : 'Resume');
    $('[data-icon-pause]').hidden = !isRunning;
    $('[data-icon-play]').hidden = isRunning;
    skipButton.setAttribute('aria-label', current === 'focus' ? 'Skip this block' : 'Skip break');
    const name = current === 'focus' ? `Block ${block}/${blocks}` : 'Break';
    document.title = `${isRunning ? clock(remaining) : 'Paused'} · ${name} — Agendal`;
  }

  function tick() {
    catchUp();
    render();
    savePending();
  }

  $('[data-controls]').hidden = false;
  toggleButton.addEventListener('click', toggle);
  $('[data-restart]').addEventListener('click', restart);
  skipButton.addEventListener('click', skip);
  $('[data-more]').addEventListener('click', moreBlock);
  for (const link of root.querySelectorAll('[data-focus-exit], [data-focus-back]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      exit();
    });
  }
  // Completing ends focus mode for this task; the server takes the page back to /focus with an Undo toast.
  root.querySelectorAll('[data-focus-complete]').forEach((form) => form.addEventListener('submit', forget));

  document.addEventListener('keydown', (event) => {
    if (leaveDialog.open || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && !event.target.closest('button, a, input, textarea, select')) {
      event.preventDefault();
      toggle();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      exit();
    }
  });
  document.addEventListener('visibilitychange', () => {
    tick();
    holdScreen();
  });
  window.addEventListener('online', () => {
    lastTry = 0;
    savePending();
  });

  write();
  holdScreen();
  tick();
  setInterval(tick, 250);
})();
