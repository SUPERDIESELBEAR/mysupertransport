/**
 * Shared client-side navigation diagnostics.
 *
 * Writes a small ring buffer of events to localStorage under `sd-nav-trace`
 * so drivers can copy them via the hidden diagnostics panel when they hit
 * "stuck on Status" style navigation bugs.
 */

const KEY = 'sd-nav-trace';
const MAX_ENTRIES = 60;

export type NavTraceEntry = { ts: number } & Record<string, unknown>;

export function appendNavTrace(entry: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(parsed) ? parsed : [];
    arr.push({ ts: Date.now(), ...entry });
    window.localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_ENTRIES)));
  } catch {
    // Local diagnostics only — never block navigation.
  }
}

export function readNavTrace(): NavTraceEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as NavTraceEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearNavTrace(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Build a stable short selector for an event target — enough to identify
 * "this specific CTA" without leaking PII.
 */
function describeTarget(el: Element | null): string {
  if (!el) return '(none)';
  const chain: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 4) {
    const tag = node.tagName.toLowerCase();
    const cta = node.getAttribute('data-nav-cta');
    if (cta) {
      chain.unshift(`${tag}[data-nav-cta="${cta}"]`);
      break;
    }
    const role = node.getAttribute('role');
    const label = node.getAttribute('aria-label');
    chain.unshift(
      `${tag}${role ? `[role="${role}"]` : ''}${label ? `[aria-label="${label.slice(0, 40)}"]` : ''}`,
    );
    node = node.parentElement;
    depth++;
  }
  return chain.join(' > ');
}

let listenerInstalled = false;

/**
 * Register a single document-level pointer listener that records the tap
 * target and the pathname at pointer-up. Safe to call from a React effect —
 * repeated calls are no-ops.
 */
export function ensurePointerTraceInstalled(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (listenerInstalled) return () => {};
  listenerInstalled = true;
  const handler = (ev: Event) => {
    const target = ev.target instanceof Element ? ev.target : null;
    // Prefer the closest button/link/role="button" — the actual CTA.
    const cta =
      target?.closest('[data-nav-cta], a[href], button, [role="button"]') ?? target;
    appendNavTrace({
      event: 'pointer-tap',
      target: describeTarget(cta),
      path: window.location.pathname,
      search: window.location.search,
      defaultPrevented: (ev as MouseEvent).defaultPrevented,
    });
  };
  document.addEventListener('pointerup', handler, { capture: true, passive: true });
  return () => {
    document.removeEventListener('pointerup', handler, { capture: true } as EventListenerOptions);
    listenerInstalled = false;
  };
}

export function getDiagnosticsHeader(): Record<string, unknown> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  const standalone =
    !!win &&
    (win.matchMedia('(display-mode: standalone)').matches ||
      (nav as unknown as { standalone?: boolean } | undefined)?.standalone === true);
  return {
    build: (globalThis as { __BUILD_VERSION__?: string }).__BUILD_VERSION__ ?? 'dev',
    buildTime: (globalThis as { __BUILD_TIME__?: string }).__BUILD_TIME__ ?? 'dev',
    ua: nav?.userAgent ?? '(no navigator)',
    displayMode: standalone ? 'standalone' : 'browser',
    standalone,
    online: nav?.onLine ?? true,
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : '(no window)',
    dpr: win?.devicePixelRatio ?? 1,
    href: win?.location.href ?? '(no window)',
  };
}

export async function collectServiceWorkerInfo(): Promise<
  { scriptURL: string; scope: string; state: string }[]
> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return [];
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => ({
      scriptURL: r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? '(unknown)',
      scope: r.scope,
      state: r.active?.state ?? r.installing?.state ?? r.waiting?.state ?? 'unknown',
    }));
  } catch {
    return [];
  }
}

export function formatDiagnosticsForCopy(
  header: Record<string, unknown>,
  serviceWorkers: { scriptURL: string; scope: string; state: string }[],
  trace: NavTraceEntry[],
): string {
  const lines: string[] = [];
  lines.push('=== SUPERDRIVE Diagnostics ===');
  for (const [k, v] of Object.entries(header)) {
    lines.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  lines.push('');
  lines.push('--- Service Workers ---');
  if (serviceWorkers.length === 0) {
    lines.push('(none registered)');
  } else {
    for (const sw of serviceWorkers) {
      lines.push(`${sw.state}  ${sw.scriptURL}  scope=${sw.scope}`);
    }
  }
  lines.push('');
  lines.push(`--- Nav Trace (${trace.length} entries) ---`);
  for (const entry of trace) {
    lines.push(JSON.stringify(entry));
  }
  return lines.join('\n');
}

/**
 * Fully reset driver-side client state: unregister service workers, clear
 * sd-* localStorage keys, then hard-navigate to /operator/status.
 */
export async function resetDriverAppState(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.allSettled(names.map((n) => caches.delete(n)));
    }
  } catch {
    // ignore
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sd-')) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
  window.location.replace('/operator/status');
}