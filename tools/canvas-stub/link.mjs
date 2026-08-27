// Point `node_modules/canvas` at the local no-op stub.
//
// The `overrides` / `resolutions` entries in package.json are not always
// honoured by the installer in this sandbox: a plain `bun install` can pull the
// real `canvas@2.11.2` from the registry, whose native binding is not built
// here, and then EVERY jsdom test file fails to collect with
// `Cannot find module '../build/Release/canvas.node'`. This runs on postinstall
// so the suite survives an install.
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
    if (!stat.isSymbolicLink() && fs.existsSync(real)) return; // real build — leave it
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(target), stub), target, 'junction');
}

try {
  if (!fs.existsSync(modules)) process.exit(0);
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
