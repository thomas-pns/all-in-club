/* All-In Club : notifications « c'est ton tour » (ajouté au service worker). */
self.addEventListener('push', (e) => {
  let d = { titre: 'All-In Club', corps: "C'est à toi de jouer !", tag: 'tour' };
  try { d = { ...d, ...e.data.json() }; } catch (_) { /* message vide */ }
  e.waitUntil(self.registration.showNotification(d.titre, {
    body: d.corps, tag: d.tag, renotify: true, icon: '/icone-192.png', badge: '/icone-192.png', vibrate: [80, 40, 80],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) if ('focus' in f) return f.focus();
    return self.clients.openWindow('/');
  })());
});
