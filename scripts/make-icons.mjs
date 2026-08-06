// Cuts the app's icons out of the real logo file, assets/logo.png.
//
// Run it only when the logo changes:  node scripts/make-icons.mjs
// The images it writes are committed, so nothing here runs during a build.
// (sharp comes in with Next's image optimiser; it isn't a direct dependency.)
//
// The logo is one flat PNG with the peaks stacked above the wordmark and a
// lot of empty space around the outside. Rather than hard-code where the
// artwork sits, this measures it: the outer bounds of anything that isn't
// the background colour, and the blank band between the peaks and the type.
// That way a redrawn logo still lands correctly.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "assets", "logo.png");

const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H, channels: C } = info;
const at = (x, y) => {
  const i = (y * W + x) * C;
  return [data[i], data[i + 1], data[i + 2]];
};

// The corner is background by definition. Everything within a small
// tolerance of it counts as background too, which absorbs the soft edges
// left by whatever exported the PNG.
const BG = at(1, 1);
const isBg = (p) => p.every((v, i) => Math.abs(v - BG[i]) < 12);
const BG_CSS = { r: BG[0], g: BG[1], b: BG[2], alpha: 1 };

const inkPerRow = Array.from({ length: H }, (_, y) => {
  let n = 0;
  for (let x = 0; x < W; x++) if (!isBg(at(x, y))) n++;
  return n;
});
const inkPerCol = Array.from({ length: W }, (_, x) => {
  let n = 0;
  for (let y = 0; y < H; y++) if (!isBg(at(x, y))) n++;
  return n;
});

const firstInk = (a) => a.findIndex((n) => n > 0);
const lastInk = (a) => a.length - 1 - [...a].reverse().findIndex((n) => n > 0);

const top = firstInk(inkPerRow);
const bottom = lastInk(inkPerRow);
const left = firstInk(inkPerCol);
const right = lastInk(inkPerCol);

// The one blank band between top and bottom is the gap under the peaks.
let gapStart = -1;
for (let y = top; y <= bottom; y++) {
  if (inkPerRow[y] === 0) {
    gapStart = y;
    break;
  }
}
if (gapStart === -1) throw new Error("Couldn't find the gap under the peaks");

const whole = {
  left,
  top,
  width: right - left + 1,
  height: bottom - top + 1,
};

// The peaks on their own, for places too small to read the wordmark.
const markCols = Array.from({ length: W }, (_, x) => {
  for (let y = top; y < gapStart; y++) if (!isBg(at(x, y))) return 1;
  return 0;
});
const mark = {
  left: firstInk(markCols),
  top,
  width: lastInk(markCols) - firstInk(markCols) + 1,
  height: gapStart - top,
};

console.log("logo artwork", whole, "peaks", mark);

// Lay a crop of the logo onto a square of its own background colour, sized
// so it takes up `fill` of the width. Wide artwork on a square icon can
// only ever be so big — the height follows from the aspect ratio.
async function tile(size, crop, fill, out) {
  const w = Math.round(size * fill);
  const h = Math.round((w * crop.height) / crop.width);
  const art = await sharp(SOURCE)
    .extract(crop)
    .resize(w, h, { fit: "fill" })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG_CSS },
  })
    .composite([
      {
        input: art,
        top: Math.round((size - h) / 2),
        left: Math.round((size - w) / 2),
      },
    ])
    .png()
    .toFile(join(root, out));
}

await mkdir(join(root, "public", "icons"), { recursive: true });

// Home screen and browser: the whole logo, wordmark included.
await tile(180, whole, 0.86, "src/app/apple-icon.png");
await tile(192, whole, 0.86, "public/icons/icon-192.png");
await tile(512, whole, 0.86, "public/icons/icon-512.png");

// Android crops icons to whatever shape the launcher uses, and it can eat
// the outer 20%. A wide logo has to come in further than a square one to
// keep its corners inside the circle that survives.
await tile(512, whole, 0.68, "public/icons/icon-maskable-512.png");

// A browser tab is around 16px across, where the wordmark is a grey smear.
// The peaks alone are still recognisably the logo at that size.
await tile(64, mark, 0.82, "src/app/icon.png");

// The header badge, likewise too small for type.
await tile(96, mark, 0.88, "public/logo-mark.png");

console.log("icons written");
