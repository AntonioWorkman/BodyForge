/**
 * Copies CanvasKit's WebAssembly binary into `public/` so the web build can
 * serve it from the site root.
 *
 * Skia is a native module on iOS and Android; only the web target needs this.
 * The binary is copied from node_modules rather than committed, so it always
 * matches the installed version and the repository stays free of build output.
 */
const fs = require('node:fs');
const path = require('node:path');

const source = path.join(
  __dirname,
  '..',
  'node_modules',
  'canvaskit-wasm',
  'bin',
  'full',
  'canvaskit.wasm',
);
const targetDir = path.join(__dirname, '..', 'public');
const target = path.join(targetDir, 'canvaskit.wasm');

if (!fs.existsSync(source)) {
  console.warn('canvaskit-wasm is not installed; skipping web asset copy.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied canvaskit.wasm -> ${path.relative(process.cwd(), target)}`);
