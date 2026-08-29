// Vitest globalSetup — runs once, in the main process, BEFORE any worker
// creates a jsdom environment.
//
// This is the load-bearing guarantee for the canvas stub. Relying on the
// package.json `postinstall` hook was not enough: several installers skip
// lifecycle scripts, and each time one did, every test file failed to collect
// at once with `Cannot find module '../build/Release/canvas.node'` — a failure
// that reads as a catastrophic regression rather than a missing native binding.
// Re-linking here removes the dependency on any install-time step, so a fresh
// clone plus `bun install` / `npm install` / no install hook at all still
// collects.
import { linkCanvasStub } from './link.mjs';

export default function setup() {
  linkCanvasStub();
}
