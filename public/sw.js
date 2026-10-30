// Service worker: shows reminder notifications sent by Web Push (services/webPush.js, services/notifier.js) and opens
// the task when one is clicked. Served from the site root so its scope is the whole app.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Agendal', {
      body: data.body || '',
      tag: data.tag,
      icon: '/images/notification-icon.png',
      badge: '/images/notification-icon.png',
      data: { url: data.url || '/today' },
    })
  );
});

// Focus a tab that already shows the page, else reuse any Agendal tab, else open a new one. Same-site paths only.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/today', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL('/today', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = tabs.find((tab) => tab.url === url);
      if (same) return same.focus();
      if (tabs[0]) return (await tabs[0].navigate(url))?.focus();
      return self.clients.openWindow(url);
    })()
  );
});
