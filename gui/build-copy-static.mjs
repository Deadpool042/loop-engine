// Copies static renderer assets (not compiled by tsc) next to the
// compiled renderer/app.js so relative <link>/<script> paths resolve.
// Run after `tsc -p tsconfig.json` — see package.json "build" script.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = ["renderer/index.html", "renderer/styles.css"];

for (const relPath of files) {
  const src = join(root, relPath);
  const dest = join(root, "dist", relPath);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}
