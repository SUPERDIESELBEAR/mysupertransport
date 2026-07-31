/**
 * A one-function registry that lets the store ask for a drain without knowing
 * the runner exists.
 *
 * `store.ts` must never import the runner: the runner imports the Supabase
 * client, and pulling that into the store would drag the network into
 * /roadside's import graph. So the runner registers a callback here at start
 * and the store calls it. No imports beyond types, deliberately.
 *
 * A request made before the runner registers is buffered rather than dropped.
 * `startSyncRunner` does force a pass on mount, so this is belt-and-braces —
 * but it stops correct behaviour from depending on module ordering.
 */

/**
 * Drafts are durable in Dexie the instant they are typed, and the certify
 * chain depends_on them, so a slow draft drain risks nothing. The chain is
 * where the driver is watching a spinner. Two windows, not one.
 */
export type DrainScope = 'draft' | 'chain';

type Kick = (scope: DrainScope) => void;

let kick: Kick | null = null;
let buffered: DrainScope | null = null;

/** 'chain' wins: the tighter window covers the looser one. */
function merge(a: DrainScope | null, b: DrainScope): DrainScope {
  return a === 'chain' || b === 'chain' ? 'chain' : 'draft';
}

export function setDrainKick(fn: Kick): void {
  kick = fn;
  if (buffered) {
    const scope = buffered;
    buffered = null;
    fn(scope);
  }
}

export function requestDrain(scope: DrainScope): void {
  if (kick) {
    kick(scope);
    return;
  }
  buffered = merge(buffered, scope);
}

/** Tests only. */
export function __resetDrainKick(): void {
  kick = null;
  buffered = null;
}