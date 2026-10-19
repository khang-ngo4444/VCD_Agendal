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
})();
