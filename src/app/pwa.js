// Service worker registration + painless updates.
// When you push a new version, the new service worker installs in the
// background. We switch to it the next time the app is opened or brought
// back to the front — never in the middle of a lesson.

import { route } from './router.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // Check for updates whenever the app comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    const inLesson = /^\/(lesson|smart-review|free-talk)/.test(route.value);
    if (inLesson) {
      // Wait until he leaves the lesson.
      const stop = route.subscribe((r) => {
        if (!/^\/(lesson|smart-review|free-talk)/.test(r)) { stop(); reloading = true; location.reload(); }
      });
      return;
    }
    reloading = true;
    location.reload();
  });
}
