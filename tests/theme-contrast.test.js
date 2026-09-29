import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const token = (name) =>
  css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
const rgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
function luminance(color) {
  const channels = color.map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test("shared text, chart, button and focus colors meet their contrast targets", () => {
  for (const foreground of [
    "text-primary",
    "text-secondary",
    "accent-1",
    "accent-2",
  ]) {
    for (const background of ["bg-color", "surface"])
      assert.ok(
        contrast(rgb(token(foreground)), rgb(token(background))) >= 4.5,
        `${foreground} on ${background}`,
      );
  }
  assert.ok(contrast(rgb(token("accent-1")), rgb("#ffffff")) >= 4.5);
  assert.ok(contrast(rgb(token("focus")), rgb(token("surface"))) >= 3);
});
test("the decorative text gradient remains readable through its sRGB interpolation", () => {
  const colors = css
    .match(/--accent-gradient:\s*linear-gradient\([^;]+/)[0]
    .match(/#[0-9a-f]{6}/gi)
    .map(rgb);
  for (let step = 0; step <= 100; step++) {
    const mixed = colors[0].map(
      (value, i) => value + ((colors[1][i] - value) * step) / 100,
    );
    assert.ok(
      contrast(mixed, rgb(token("bg-color"))) >= 4.5,
      `Gradient at ${step}%`,
    );
  }
});
