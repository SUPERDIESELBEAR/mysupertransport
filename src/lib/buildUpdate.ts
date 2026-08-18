import { toast } from 'sonner';

const ATTEMPTED_VERSION_KEY = 'superdrive_build_update_attempted';
const APP_SHELL_WORKERS = ['/sw.js', '/service-worker.js'];

function readAttemptedVersion(): string | null {
  try {
    return window.sessionStorage.getItem(ATTEMPTED_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeAttemptedVersion(version: string): void {
  try {
    window.sessionStorage.setItem(ATTEMPTED_VERSION_KEY, version);
  } catch {
    // A refresh still works when session storage is unavailable.
  }
}

function clearAttemptedVersion(): void {
  try {
    window.sessionStorage.removeItem(ATTEMPTED_VERSION_KEY);
  } catch {
    // Nothing to clear when session storage is unavailable.
  }
}

/**
 * Returns true only for a version mismatch the user has not already tried to
 * load. A same-version check clears the guard for the next real deployment.
 */
export function shouldOfferBuildUpdate(localVersion: string, remoteVersion: string): boolean {
  if (!remoteVersion || remoteVersion === localVersion) {
    clearAttemptedVersion();
    return false;
  }

  return readAttemptedVersion() !== remoteVersion;
}

export function isAppShellCacheName(name: string): boolean {
  return (
    name === 'sd-pages'
    || name === 'sd-assets'
    || /^workbox-precache-v\d+-/.test(name)
  );
}

function isAppShellWorker(registration: ServiceWorkerRegistration): boolean {
  const scriptUrl = registration.active?.scriptURL
    ?? registration.waiting?.scriptURL
    ?? registration.installing?.scriptURL
    ?? '';

  return APP_SHELL_WORKERS.some((path) => scriptUrl.endsWith(path));
}

/**
 * Loads a known remote build without clearing auth, local app data, IndexedDB,
 * or offline ELD records. The attempted-version marker prevents a deployment
 * propagation delay from creating an endless refresh prompt.
 */
export async function refreshToBuild(remoteVersion: string): Promise<void> {
  writeAttemptedVersion(remoteVersion);
  toast.dismiss('version-update');

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    if (registrations) {
      await Promise.allSettled(
        registrations.filter(isAppShellWorker).map((registration) => registration.unregister()),
      );
    }
  } catch {
    // Continue to cache cleanup and reload.
  }

  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.allSettled(
        names.filter(isAppShellCacheName).map((name) => caches.delete(name)),
      );
    }
  } catch {
    // A normal reload remains the safest fallback.
  }

  window.location.reload();
}
