// Keep the screen on, but only while something is running.
// (iOS suspends a web app's audio as soon as the screen locks.)

let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { /* denied, e.g. low battery mode */ }
}

export function setWakeLock(on) {
  wanted = on;
  if (on) acquire();
  else if (sentinel) { sentinel.release(); sentinel = null; }
}

// The lock is dropped automatically when the page is hidden; take it back.
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
