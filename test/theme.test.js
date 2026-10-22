// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// The pure half of src/theme.js: the contrast measure, and every shipped
// light and dark pair clearing its floor. `node test/theme.test.js`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAIRS, rgba, over, ratio } from '../src/theme.js';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
const parse = (v) => (v.startsWith('#') ? hex(v) : rgba(v));

assert.equal(Math.round(ratio(hex('#ffffff'), hex('#000000'))), 21);
// The documented example: a host's light gold under white ink.
assert.equal(Math.round(ratio(hex('#ffffff'), hex('#ffe066')) * 100) / 100, 1.3);

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
const block = (sel) => {
  const body = css.slice(css.indexOf(sel)).split('}')[0];
  return Object.fromEntries([...body.matchAll(/--mq-([a-z-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
};
const light = block('.mq, [data-mq-theme="light"] {');
for (const [name, t] of [['light', light], ['dark', { ...light, ...block('[data-mq-theme="dark"] {') }]]) {
  for (const [fg, bg, floor] of PAIRS) {
    const surface = over(parse(t.surface), [255, 255, 255]);
    const back = over(parse(t[bg]), surface);
    const m = ratio(over(parse(t[fg]), back), back);
    assert.ok(m >= floor, `${name} ${fg} / ${bg} measured ${m.toFixed(2)}, floor ${floor}`);
  }
}
console.log('theme: ok');
