// Web Push in this browser: registers the service worker (public/sw.js) and keeps the server's copy of this browser's
// subscription up to date. Loaded only when the server has VAPID keys (views/partials/shell-bottom.ejs).
// Pages use window.agendalPush: state(), enable(), disable(). A change fires 'agendal:push' on document.

(() => {
  const script = document.currentScript;
  const vapidKey = script?.dataset.key;
  const supported = Boolean(vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  const SAVED_KEY = 'agendal-push-saved'; // this tab already sent the subscription, so it isn't posted on every page

  const csrfToken = () => document.querySelector('input[name=_csrf]')?.value ?? '';

  // The key the push service needs, from the base64url string the server gives.
  function keyBytes(base64url) {
    const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  }

  async function post(path, fields) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken() },
      body: new URLSearchParams(fields),
    });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res;
  }

  const registration = supported ? navigator.serviceWorker.register('/sw.js') : null;

  async function save(subscription) {
    const { endpoint, keys } = subscription.toJSON();
    await post('/notifications/push/subscribe', { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    try {
      sessionStorage.setItem(SAVED_KEY, endpoint);
    } catch {}
  }

  const changed = () => document.dispatchEvent(new CustomEvent('agendal:push'));

  // 'unsupported', 'blocked' (the user said no), 'off' (not asked yet, or turned off here), or 'on'.
  async function state() {
    if (!supported) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission !== 'granted') return 'off';
    const subscription = await (await registration).pushManager.getSubscription();
    return subscription ? 'on' : 'off';
  }

  // Asks the browser (only from a click: browsers ignore requests that don't come from one), then subscribes.
  async function enable() {
    if (!supported) return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      changed();
      return permission === 'denied' ? 'blocked' : 'off';
    }
    const reg = await registration;
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
    await save(subscription);
    changed();
    return 'on';
  }

  async function disable() {
    if (!supported) return;
    const subscription = await (await registration).pushManager.getSubscription();
    if (subscription) {
      await post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    try {
      sessionStorage.removeItem(SAVED_KEY);
    } catch {}
    changed();
  }

  // Already allowed: make sure the server has this browser's current subscription (it can change, or this browser
  // may have been removed after the push service dropped it). Once per tab session.
  async function resync() {
    if (!supported || Notification.permission !== 'granted') return;
    const subscription = await (await registration).pushManager.getSubscription();
    let saved = null;
    try {
      saved = sessionStorage.getItem(SAVED_KEY);
    } catch {}
    if (subscription && saved !== subscription.endpoint) await save(subscription);
  }

  window.agendalPush = { supported, state, enable, disable, post };
  resync().catch(() => {}); // a failed resync just tries again on the next page

  // Permission dialog (views/notifications/_permission-dialog.ejs, Figma W29).
  const dialog = document.getElementById('push-permission-dialog');
  const LATER_KEY = 'agendal-push-later'; // "Not now": the Daily List doesn't ask again for a while
  const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;

  function openDialog(current) {
    if (!dialog) return;
    dialog.querySelector('[data-push-panel="ask"]').hidden = current === 'blocked';
    dialog.querySelector('[data-push-panel="blocked"]').hidden = current !== 'blocked';
    dialog.showModal();
  }

  dialog?.querySelector('[data-push-allow]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const result = await enable();
      if (result === 'blocked') openDialog('blocked');
      else {
        dialog.close();
        if (result === 'on') window.agendal?.toast('Notifications are on in this browser.');
      }
    } catch {
      dialog.close();
      window.agendal?.toast('Notifications couldn’t be turned on. Try again in a moment.', { type: 'error' });
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  dialog?.querySelector('[data-push-later]').addEventListener('click', () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {}
  });

  // [data-push-status] blocks show the child [data-push-when] that matches this browser, and stay hidden otherwise.
  async function renderStatus() {
    const current = await state();
    document.querySelectorAll('[data-push-status]').forEach((block) => {
      let shown = false;
      block.querySelectorAll('[data-push-when]').forEach((part) => {
        part.hidden = !part.dataset.pushWhen.split(' ').includes(current);
        shown ||= !part.hidden;
      });
      block.hidden = !shown;
    });
    return current;
  }

  document.addEventListener('click', async (event) => {
    const opener = event.target.closest('[data-push-open]');
    if (opener) return openDialog(await state());

    const off = event.target.closest('[data-push-off]');
    if (off) {
      await disable();
      return window.agendal?.toast('Notifications are off in this browser. Your other devices still get them.');
    }

    const test = event.target.closest('[data-push-test]');
    if (test) {
      test.disabled = true;
      try {
        await post('/notifications/push/test', {});
        window.agendal?.toast('Test sent. It should appear in a few seconds.');
      } catch {
        window.agendal?.toast('The test couldn’t be sent. Turn notifications off and on again here.', { type: 'error' });
      } finally {
        test.disabled = false;
      }
    }
  });

  document.addEventListener('agendal:push', renderStatus);
  document.addEventListener('agendal:render', renderStatus); // content swapped in by app.js (data-fetch, live updates)

  // The Daily List asks once (Figma W29 shows it there), unless the user said "Not now" lately or turned the
  // browser channel off in Settings.
  (async () => {
    const current = await renderStatus();
    if (location.pathname !== '/today' || current !== 'off' || script?.dataset.channel === 'off') return;
    let later = 0;
    try {
      later = Number(localStorage.getItem(LATER_KEY)) || 0;
    } catch {}
    if (Date.now() - later > ASK_AGAIN_MS) openDialog(current);
  })();
})();
