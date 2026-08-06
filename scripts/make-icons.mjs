// Renders the Blair Lawn Care mark into the PNG sizes phones ask for.
//
// Run it only when the logo changes:  node scripts/make-icons.mjs
// The PNGs it writes are committed, so nothing here runs during a build.
// (sharp comes in with Next's image optimiser; it isn't a direct dependency.)

import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONE = { r: 0xf6, g: 0xf3, b: 0xea, alpha: 1 };

const svg = await readFile(join(root, "scripts", "logo.svg"));

async function square(size, out) {
  await sharp(svg).resize(size, size).png().toFile(join(root, out));
}

// Android's adaptive icons crop to a shape that can eat the outer 20%, so the
// maskable copy sits the whole mark inside a smaller box on more bone.
async function maskable(size, out) {
  const inner = Math.round(size * 0.78);
  const pad = Math.round((size - inner) / 2);
  const mark = await sharp(svg).resize(inner, inner).png().toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BONE },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toFile(join(root, out));
}

await mkdir(join(root, "public", "icons"), { recursive: true });

await square(180, "src/app/apple-icon.png"); // iOS home screen
await square(192, "public/icons/icon-192.png");
await square(512, "public/icons/icon-512.png");
await maskable(512, "public/icons/icon-maskable-512.png");

// The browser tab favicon keeps its rounded corners — nothing masks it there.
const rounded = svg
  .toString()
  .replace(
    '<rect width="512" height="512" fill="#f6f3ea" />',
    '<rect width="512" height="512" rx="96" ry="96" fill="#f6f3ea" />'
  );
await writeFile(join(root, "src/app/icon.svg"), rounded);

console.log("icons written");
