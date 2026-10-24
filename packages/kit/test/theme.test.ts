// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// The pure half of src/theme.js: the contrast measure, and every shipped
// light and dark pair clearing its floor. `node test/theme.test.js`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAIRS, rgba, over, ratio, type RGBA } from '../src/theme.ts';

const hex = (h: string): RGBA => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [r, g, b, 1];
};
const parse = (v: string | undefined): RGBA => (v?.startsWith('#') ? hex(v) : rgba(v ?? ''));

assert.equal(Math.round(ratio(hex('#ffffff'), hex('#000000'))), 21);
// The documented example: a host's light gold under white ink.
assert.equal(Math.round(ratio(hex('#ffffff'), hex('#ffe066')) * 100) / 100, 1.3);

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
// A token block by its selector, however the stylesheet is formatted: whitespace and quote style aside.
const norm = (sel: string): string => sel.replace(/[\s"']/g, '');
const block = (sel: string): Record<string, string> => {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, s = '']) => norm(s.replace(/\/\*[\s\S]*?\*\//g, '')) === norm(sel),
  );
  const body = rule?.[2] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/--mq-([a-z-]+):\s*([^;]+);/g)].map(([, k = '', v = '']) => [k, v.trim()]),
  );
};
const light = block('.mq, [data-mq-theme="light"]');
for (const [name, t] of [
  ['light', light],
  ['dark', { ...light, ...block('[data-mq-theme="dark"]') }],
] as const) {
  for (const [fg, bg, floor] of PAIRS) {
    const surface = over(parse(t.surface), [255, 255, 255]);
    const back = bg === 'ground' ? over(parse(t.ground), [255, 255, 255]) : over(parse(t[bg]), surface);
    const m = ratio(over(parse(t[fg]), back), back);
    assert.ok(m >= floor, `${name} ${fg} / ${bg} measured ${m.toFixed(2)}, floor ${floor}`);
  }
}
// ── Coverage: every pairing the stylesheets can paint is measured by the gate or excused here.
// A new color in kit.css or theme.css fails this until someone decides which.
{
  const sheets = ['theme.css', 'kit.css']
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const colors = new Set(
    Object.entries(light)
      .filter(([, v]) => /^(#|rgba?\()/.test(v))
      .map(([k]) => k),
  );
  const rules = [...sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel = '', body = '']) => ({
    sel: sel.trim(),
    decl: [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+)/g)],
  }));
  const tok = (v: string): string[] =>
    [...v.matchAll(/var\(--mq-([a-z-]+)\)/g)].map((m) => m[1] ?? '').filter((t) => colors.has(t));
  const of = (r: (typeof rules)[number], re: RegExp): string[] =>
    r.decl.filter(([, p = '']) => re.test(p)).flatMap(([, , v = '']) => tok(v));
  const uses = rules.map((r) => ({
    sel: r.sel,
    fg: of(r, /^color$/),
    bg: of(r, /^background(-color)?$/),
    line: of(r, /^(border|outline)/),
  }));
  const measured = (f: string, b: string): boolean => PAIRS.some(([x, y]) => x === f && y === b);

  // Text a person reads off whatever it sits on, and the labels that only ever sit on their own fill.
  const TEXT = ['text', 'text-muted', 'act-ink', 'attn-ink', 'error-ink'];
  const LABELS: Record<string, string> = {
    'act-on': 'on act',
    'attn-on': 'on attn',
    'error-on': 'on error',
    surface: 'the tooltip, on text',
  };
  // Backgrounds other things sit on, and ones that are only a fill or a mark.
  const AREAS = ['ground', 'surface', 'surface-sunken', 'act-tint', 'attn-tint'];
  const NOT_AREAS: Record<string, string> = {
    'act-hover': 'the action button hovered; its label is act-on, measured as act-on/act-hover',
    'act-ink': 'the arrow drawn in a derivation step, not a surface',
    rule: 'the status strip separator, a hairline',
  };
  // Lines: borders that must stand out (non-text, 3:1), and those that are text tokens or a fill's own edge.
  const LINES = ['rule-strong', 'focus'];
  const EDGES: Record<string, string> = {
    act: 'a filled button or stamp edge',
    'act-hover': 'the hovered action button edge',
    attn: 'a filled stamp or button edge',
    rule: 'hairlines between rows: decorative',
  };
  // Pairings that can't occur, each with why. Measuring them would only reject host themes for nothing.
  const EXCUSED: Record<string, string> = {
    'error-ink/ground': 'errors are drawn in fields and notices, on the surface',
    'error-ink/surface-sunken': 'no error is drawn in a well or an open row',
    'error-ink/act-tint': 'no error is drawn on a hovered or chosen option',
    'error-ink/attn-tint': 'no error is drawn on a highlight',
    'attn-ink/surface-sunken': 'gold text is the brand and gate numbers, on the ground and the surface',
    'attn-ink/act-tint': 'no gold text is drawn on a hovered row or option',
    'text-muted/attn-tint': 'highlights are on body text and readings, never on muted text',
    'rule-strong/act-tint':
      'a hovered option or button has the tint inside its border; the surface outside is the neighbor measured',
    'rule-strong/attn-tint': 'nothing with a strong border sits on a highlight',
  };

  for (const u of uses) {
    for (const f of u.fg)
      assert.ok(TEXT.includes(f) || f in LABELS, `${u.sel}: text color --mq-${f} is new; add it to TEXT or LABELS`);
    // A label is only ever on its own fill, set in the same rule.
    for (const f of u.fg)
      if (f in LABELS)
        assert.ok(u.bg.length, `${u.sel}: --mq-${f} is a label (${LABELS[f]}) with no fill of its own here`);
    for (const b of u.bg)
      if (!u.fg.length)
        assert.ok(
          AREAS.includes(b) || b in NOT_AREAS,
          `${u.sel}: background --mq-${b} is new; add it to AREAS or NOT_AREAS`,
        );
    for (const l of u.line)
      assert.ok(
        LINES.includes(l) || TEXT.includes(l) || l in EDGES,
        `${u.sel}: line --mq-${l} is new; add it to LINES or EDGES`,
      );
    // A rule that sets both: that pair is painted, so it's measured.
    // An excuse says it can't happen; a rule that paints it says otherwise.
    for (const f of u.fg)
      for (const b of u.bg) assert.ok(measured(f, b), `${u.sel}: --mq-${f} on --mq-${b} is painted but not measured`);
  }
  // Anything readable, and any line that must stand out, on anything that is an area.
  for (const b of AREAS) {
    for (const f of TEXT)
      assert.ok(measured(f, b) || EXCUSED[`${f}/${b}`], `--mq-${f} can sit on --mq-${b} but isn't measured or excused`);
    for (const l of LINES)
      assert.ok(measured(l, b) || EXCUSED[`${l}/${b}`], `--mq-${l} can sit on --mq-${b} but isn't measured or excused`);
  }
  // An excuse for a pair the gate does measure is stale.
  for (const k of Object.keys(EXCUSED))
    assert.ok(!measured(...(k.split('/') as [string, string])), `${k} is measured now; drop its excuse`);
}

console.log('theme: ok');
