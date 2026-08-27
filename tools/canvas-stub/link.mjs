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
const target = path.join(root, 'node_modules/canvas');

try {
  if (!fs.existsSync(path.join(root, 'node_modules'))) process.exit(0);
  const real = path.join(target, 'build/Release/canvas.node');
  if (fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.existsSync(real)) {
    process.exit(0); // a genuinely working native build — leave it alone
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(path.relative(path.dirname(target), stub), target, 'junction');
} catch (err) {
  console.warn('[canvas-stub] could not link stub:', err.message);
}
