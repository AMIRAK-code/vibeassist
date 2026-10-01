// Builds the landing page's clay sculpture from the design reference.
//
// The reference renders on a lighter, slightly uneven ivory (about #FCF9F3, with a soft
// gradient and a studio glow behind the sculpture) while the site uses --ci-ivory #F5F1E8.
//
// 1. The reference background is estimated as a smooth surface interpolated from the crop's
//    four edges (a Coons patch), and every pixel is tone-mapped against its local background:
//    the background lands on the page colour, shadows darken proportionally and highlights
//    keep their headroom.
// 2. The sculpture and its contact shadow are found as everything that differs noticeably from
//    that background. Gaps inside the silhouette are filled, the shape is grown slightly and
//    blurred, and that soft mask becomes the alpha channel. Everything else, including the
//    glow (lighter than the background), is fully transparent, so the page colour shows through and no rectangle can appear.
//
// Usage (from this folder, with sharp available: npm i --no-save sharp):
//   node build-sculpture.mjs [reference.webp] [output.webp]
import sharp from 'sharp';

const [, , input = 'reference-creative-instrument-clay.webp', output = '../../src/assets/landing/clay-sculpture.webp'] = process.argv;
const PAGE = [0xf5, 0xf1, 0xe8]; // --ci-ivory
const CROP = { left: 612, top: 634, width: 918, height: 380 }; // right of the second headline, below the divider
const EDGE_BLUR = 31; // px window for smoothing the edge colour profiles
const DARKER = 9; // levels below the local background that count as sculpture or shadow
const LIGHTER = 26; // lighter pixels only count when far brighter (keeps the studio glow out)
const DESPECKLE = 2; // px: removes isolated compression noise from the mask
const CLOSE = 8; // px: bridges small gaps in the silhouette before holes are filled
const GROW = 14; // px: keeps the softest shadow edges inside the mask
const SOFTEN = 9; // gaussian sigma (px) for the mask edge
const FEATHER = 40; // px: the crop edges are always fully transparent

const { data, info } = await sharp(input).extract(CROP).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const px = (x, y, c) => data[(y * w + x) * 3 + c];

// Background estimate ------------------------------------------------------------------

// Edge colour profiles: average of the outer 4px, smoothed along the edge
function profile(length, sample) {
  const raw = Array.from({ length }, (_, i) => [0, 1, 2].map((c) => sample(i, c)));
  const half = EDGE_BLUR >> 1;
  return raw.map((_, i) => [0, 1, 2].map((c) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(length - 1, i + half); k++) { sum += raw[k][c]; n++; }
    return sum / n;
  }));
}
const avg = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const top = profile(w, (x, c) => avg([0, 1, 2, 3].map((d) => px(x, d, c))));
const bottom = profile(w, (x, c) => avg([0, 1, 2, 3].map((d) => px(x, h - 1 - d, c))));
const left = profile(h, (y, c) => avg([0, 1, 2, 3].map((d) => px(d, y, c))));
const right = profile(h, (y, c) => avg([0, 1, 2, 3].map((d) => px(w - 1 - d, y, c))));
// Coons patch: blends the four edge profiles into a smooth background surface
function background(x, y, c) {
  const u = x / (w - 1), v = y / (h - 1);
  const corners = (1 - u) * (1 - v) * top[0][c] + u * (1 - v) * top[w - 1][c] + (1 - u) * v * bottom[0][c] + u * v * bottom[w - 1][c];
  return (1 - v) * top[x][c] + v * bottom[x][c] + (1 - u) * left[y][c] + u * right[y][c] - corners;
}

const mapChannel = (value, local, c) =>
  value <= local
    ? (value * PAGE[c]) / local // darker than the background: scale towards black
    : PAGE[c] + ((value - local) * (255 - PAGE[c])) / (255 - local); // lighter: keep highlight headroom

// Object mask ----------------------------------------------------------------------------

// Separable square max filter (dilation); erosion is dilation of the inverse
function dilate(mask, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let on = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !on; k++) on = mask[y * w + k];
    tmp[y * w + x] = on;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let on = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !on; k++) on = tmp[k * w + x];
    out[y * w + x] = on;
  }
  return out;
}
const invert = (mask) => mask.map((v) => 1 - v);
const erode = (mask, r) => invert(dilate(invert(mask), r));

// Fills every background region that can't be reached from the crop border
function fillHoles(mask) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return outside.map((v) => 1 - v);
}

const rgb = Buffer.alloc(w * h * 3);
let mask = new Uint8Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  let darker = 0, lighter = 0;
  for (let c = 0; c < 3; c++) {
    const local = background(x, y, c);
    darker = Math.max(darker, local - data[i * 3 + c]);
    lighter = Math.max(lighter, data[i * 3 + c] - local);
    rgb[i * 3 + c] = Math.round(mapChannel(data[i * 3 + c], local, c));
  }
  mask[i] = darker > DARKER || lighter > LIGHTER ? 1 : 0;
}
mask = dilate(erode(mask, DESPECKLE), DESPECKLE); // opening: drop isolated specks
mask = erode(dilate(mask, CLOSE), CLOSE); // closing: bridge small gaps in the outline
mask = dilate(fillHoles(mask), GROW);

const blurred = await sharp(Buffer.from(mask.map((v) => v * 255)), { raw: { width: w, height: h, channels: 1 } })
  .blur(SOFTEN)
  .extractChannel(0)
  .raw()
  .toBuffer({ resolveWithObject: true });
const soft = blurred.data;
if (blurred.info.channels !== 1) throw new Error(`expected a 1-channel mask, got ${blurred.info.channels}`);

const smooth = (t) => t * t * (3 - 2 * t);
const out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  out[i * 4] = rgb[i * 3];
  out[i * 4 + 1] = rgb[i * 3 + 1];
  out[i * 4 + 2] = rgb[i * 3 + 2];
  const edge = smooth(Math.min(1, Math.min(x, y, w - 1 - x, h - 1 - y) / FEATHER));
  out[i * 4 + 3] = Math.round(soft[i] * edge);
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .webp({ quality: 86, alphaQuality: 90, effort: 6, smartSubsample: true })
  .toFile(output);

const meta = await sharp(output).metadata();
const { statSync } = await import('node:fs');
const covered = mask.reduce((n, v) => n + v, 0) / mask.length;
console.log(`mask covers ${(covered * 100).toFixed(1)}% of the crop`);
console.log(`${output}: ${meta.width}x${meta.height}, ${(statSync(output).size / 1024).toFixed(1)} KB; sits at x ${CROP.left}, y ${CROP.top} in the 1536x1024 reference`);
