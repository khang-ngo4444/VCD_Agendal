// Focus mode (views/focus, Figma W13 / M47).
// - The Focus page: the box above "Other open tasks" filters the list as you type.
// - The timer page: a focus block, then a break, then it waits for the next block. Time is counted from the end
//   time, not by ticks, so a background tab or a sleeping laptop still ends on time, and the state is kept in
//   localStorage so a reload carries on. A block that runs to the end is saved (POST /focus/:id/sessions).

(() => {
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
  if (!window.agendalFocus) {
    window.agendalFocus = true;
    setUpFilter();
    document.addEventListener('agendal:render', setUpFilter);
  }

  // ---- Timer page ----
  const root = document.querySelector('[data-focus-timer]');
  if (!root) return;

  const KEY = 'agendal.focus';
  const MINUTE = 60 * 1000;
  const RETRY_MS = 30 * 1000;
  const taskId = root.dataset.taskId;
  const focusMs = Number(root.dataset.focusMinutes) * MINUTE;
  const restMs = Number(root.dataset.restMinutes) * MINUTE;
  const $ = (selector) => root.querySelector(selector);
  const time = $('[data-time]');
  const status = $('[data-status]');
  const ring = $('[data-ring]');
  const announcer = $('[data-announce]');
  const toggleButton = $('[data-toggle]');
  const skipButton = $('[data-skip]');
  const leaveDialog = document.getElementById('focus-leave-dialog');
  const csrfToken = () => document.querySelector('input[name=_csrf]')?.value ?? '';

  // state: phase 'focus' | 'break' | 'ready'; endsAt (ms) while running, else remaining (ms); startedAt (ISO) of the
  // current focus block; pending: finished blocks not saved yet.
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

  const fresh = (now) => ({ taskId, focusMs, phase: 'focus', endsAt: now + focusMs, remaining: focusMs, startedAt: new Date(now).toISOString(), sessions: Number(root.dataset.sessionsToday), pending: [] });
  const stored = read();
  let state = stored?.taskId === taskId && stored.focusMs === focusMs ? stored : fresh(Date.now());
  state.sessions = Math.max(state.sessions, Number(root.dataset.sessionsToday));

  const running = () => state.endsAt != null;
  const left = (now = Date.now()) => Math.max(0, running() ? state.endsAt - now : state.remaining);
  const total = () => (state.phase === 'break' ? restMs : focusMs);
  const clock = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const at = (ms) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms); // like services/dates.js formatTime
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
        window.agendal?.toast(`${result.minutes} min saved on this task. Take a break.`);
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
  function startFocus(now = Date.now()) {
    Object.assign(state, { phase: 'focus', endsAt: now + focusMs, remaining: focusMs, startedAt: new Date(now).toISOString() });
    announce(`Focus started. Break at ${at(state.endsAt)}.`);
  }

  // Moves past every end time that has gone by (several, if the tab slept through them).
  function catchUp(now = Date.now()) {
    let changed = false;
    while (running() && now >= state.endsAt) {
      changed = true;
      const ended = state.endsAt;
      if (state.phase === 'focus') {
        state.pending.push({ startedAt: state.startedAt, minutes: focusMs / MINUTE });
        state.sessions += 1;
        Object.assign(state, { phase: 'break', endsAt: ended + restMs, remaining: restMs });
        announce(`Focus block done. Break until ${at(state.endsAt)}.`);
      } else {
        Object.assign(state, { phase: 'ready', endsAt: null, remaining: focusMs });
        announce('Break is over. Start the next block when you’re ready.');
      }
      if (now - ended < 5000) chime(); // only when it just happened, not when catching up later
    }
    if (changed) {
      lastTry = 0;
      write();
      holdScreen();
    }
  }

  function toggle() {
    const now = Date.now();
    if (state.phase === 'ready') startFocus(now);
    else if (running()) {
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

  function restart() {
    const now = Date.now();
    if (state.phase === 'break') Object.assign(state, { endsAt: now + restMs, remaining: restMs });
    else startFocus(now);
    write();
    holdScreen();
    render();
  }

  function skip() {
    const now = Date.now();
    if (state.phase === 'focus') {
      Object.assign(state, { phase: 'break', endsAt: now + restMs, remaining: restMs });
      announce('Skipped to the break. That block isn’t counted.');
    } else startFocus(now);
    write();
    holdScreen();
    render();
  }

  function leave() {
    forget();
    location.assign('/focus');
  }

  // Leaving mid-block loses it, so that one case asks first (W13d); a break or a paused timer leaves at once.
  function exit() {
    if (state.phase !== 'focus' || !running()) return leave();
    leaveDialog.querySelector('[data-leave-detail]').textContent = `${clock(left())} left. This block won’t be saved; the task stays open.`;
    leaveDialog.returnValue = '';
    leaveDialog.showModal();
  }
  leaveDialog.addEventListener('close', () => leaveDialog.returnValue === 'leave' && leave());

  // ---- Drawing ----
  function render() {
    const now = Date.now();
    const remaining = left(now);
    const isRunning = running();
    root.dataset.phase = state.phase;
    time.textContent = clock(remaining);
    const offset = (100 * remaining) / total(); // the arc shows the time gone by
    ring.style.strokeDashoffset = String(offset);
    ring.style.opacity = offset > 99.5 ? '0' : '1'; // no lone round cap at the top before the first second
    status.textContent =
      state.phase === 'ready'
        ? 'Break’s over. Ready for the next block'
        : !isRunning
          ? 'Paused'
          : state.phase === 'focus'
            ? `Focusing · break at ${at(state.endsAt)}`
            : `Break · next focus at ${at(state.endsAt)}`;
    $('[data-session-label]').textContent =
      state.phase === 'break' ? `Break after session ${state.sessions}` : `Session ${state.sessions + 1} today`;
    toggleButton.setAttribute('aria-label', isRunning ? 'Pause' : state.phase === 'ready' ? 'Start the next block' : 'Resume');
    $('[data-icon-pause]').hidden = !isRunning;
    $('[data-icon-play]').hidden = isRunning;
    skipButton.setAttribute('aria-label', state.phase === 'focus' ? 'Skip to the break' : state.phase === 'break' ? 'Skip break' : 'Start the next block');
    skipButton.hidden = state.phase === 'ready';
    const label = { focus: 'Focus', break: 'Break', ready: 'Ready' }[state.phase];
    document.title = `${isRunning ? clock(remaining) : state.phase === 'ready' ? 'Ready' : 'Paused'} · ${label} — Agendal`;
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
  $('[data-focus-exit]').addEventListener('click', (event) => {
    event.preventDefault();
    exit();
  });
  // Completing ends focus mode for this task; the server takes the page back to /focus with an Undo toast.
  $('[data-focus-complete]').addEventListener('submit', forget);

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
