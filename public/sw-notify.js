/* Imported into the generated service worker (vite.config.ts, workbox.importScripts).
   A click on a study reminder opens its page in an open app window, or in a new one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.hash) || '#/';
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => c.url.startsWith(scope));
      if (client) {
        await client.focus();
        client.postMessage({ type: 'open-hash', hash });
      } else {
        await self.clients.openWindow(scope + hash);
      }
    })(),
  );
});
