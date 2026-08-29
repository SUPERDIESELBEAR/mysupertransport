// Point `node_modules/canvas` at the local no-op stub.
//
// The `overrides` / `resolutions` entries in package.json are not always
// honoured by the installer in this sandbox: a plain `bun install` can pull the
// real `canvas@2.11.2` from the registry, whose native binding is not built
// here, and then EVERY jsdom test file fails to collect with
// `Cannot find module '../build/Release/canvas.node'`.
//
// This used to run ONLY as a postinstall hook, and postinstall is skipped by
// some installers — which broke suite collection three separate times. It is
// now ALSO invoked from vitest's globalSetup (tools/canvas-stub/globalSetup.mjs),
// so the stub is guaranteed present at test time no matter which package
// manager installed node_modules, or whether any install hook ran at all.
//
// A vite/vitest `resolve.alias` cannot do this job: jsdom probes for canvas
// with a bare CommonJS `require.resolve("canvas")` inside node_modules, which
// Node resolves directly and vite never sees.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stub = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(stub, '../..');
const modules = path.join(root, 'node_modules');

function link(target) {
  const real = path.join(target, 'build/Release/canvas.node');
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      // Already ours (or at least already a link) — resolve and verify it lands
      // on the stub; re-link if it does not.
      try {
        if (path.resolve(path.dirname(target), fs.readlinkSync(target)) === stub) return;
      } catch { /* fall through and re-link */ }
    } else if (fs.existsSync(real)) {
      return; // a genuinely built native canvas — leave it alone
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(target), stub), target, 'junction');
}

/** Idempotent. Safe to call on every install AND on every test run. */
export function linkCanvasStub() {
  try {
    if (!fs.existsSync(modules)) return;
    link(path.join(modules, 'canvas'));

    // jsdom does not resolve through the root: it requires `canvas` from its own
    // hoisted peer directory, so the root link alone does not save the suite.
    const deno = path.join(modules, '.deno');
    if (fs.existsSync(deno)) {
      for (const entry of fs.readdirSync(deno)) {
        if (!/^canvas@/.test(entry)) continue;
        link(path.join(deno, entry, 'node_modules/canvas'));
      }
    }
  } catch (err) {
    console.warn('[canvas-stub] could not link stub:', err.message);
  }
}

linkCanvasStub();
