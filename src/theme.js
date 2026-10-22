// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * The theme gate (docs/THEME.md, "The gate"; the footer of theme.css): at
 * mount, measure each token pair the kit relies on. A pair under its floor is
 * logged, reported as rejected[{token, measured, floor}], and the host's
 * token falls back to the shipped value for the active theme. The pane
 * renders either way; it never renders unreadable.
 *
 * Shipped values are read from theme.css itself, so no colour lives here.
 */

// [foreground, background, floor]; a tint is laid over the surface first.
export const PAIRS = [
  ['text', 'surface', 4.5], ['text-muted', 'surface', 4.5],
  ['act-ink', 'surface', 4.5], ['act-on', 'act', 4.5], ['act-ink', 'act-tint', 4.5],
  ['attn-on', 'attn', 4.5], ['attn-ink', 'surface', 4.5], ['attn-ink', 'attn-tint', 4.5],
  ['error-ink', 'surface', 4.5], ['focus', 'surface', 3.0],
];
export const SIZES = [['size-xs', 12], ['size-sm', 13]];

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" → [r, g, b, a]. */
export const rgba = (s) => { const [r, g, b, a = 1] = (s.match(/[\d.]+/g) || []).map(Number); return [r, g, b, a]; };
/** `top` laid over an opaque `under`. */
export const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast of two opaque colours. */
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const applies = (root, sel) => { try { return !!root.closest(sel); } catch { return false; } }; // ::before and the like
const same = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

/** The --mq-* values theme.css gives `root`, ignoring anything a host set. */
function shipped(root) {
  const out = {};
  const walk = (rules) => {
    for (const r of rules) {
      // A style rule has cssRules too (nesting), so it is matched first.
      if (r.style && r.selectorText) {
        if (applies(root, r.selectorText)) for (const p of r.style) if (p.startsWith('--mq-')) out[p] = r.style.getPropertyValue(p).trim();
      } else if (r.cssRules && (!r.media || matchMedia(r.media.mediaText).matches)) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    if (!/theme\.css(\?|$)/.test(sheet.href || '')) continue;
    try { walk(sheet.cssRules); } catch { /* a sheet from another origin can't be read; nothing to fall back to */ }
  }
  return out;
}

/** Measure `root`'s tokens; fall back the host's where a pair fails. */
export function check(root) {
  if (!root?.isConnected) return null;
  const probe = document.createElement('span');
  probe.hidden = true;
  root.append(probe);
  const read = (t) => { probe.style.color = `var(--mq-${t})`; return rgba(getComputedStyle(probe).color); };
  const px = (t) => { probe.style.fontSize = `var(--mq-${t})`; return parseFloat(getComputedStyle(probe).fontSize); };
  const ship = shipped(root), cs = getComputedStyle(root);
  const host = (t) => ship[`--mq-${t}`] && !same(cs.getPropertyValue(`--mq-${t}`), ship[`--mq-${t}`]);
  const rejected = [];
  const fall = (t, measured, floor) => {
    rejected.push({ token: `--mq-${t}`, measured: Math.round(measured * 100) / 100, floor });
    if (host(t)) root.style.setProperty(`--mq-${t}`, ship[`--mq-${t}`]);
  };
  for (const [fg, bg, floor] of PAIRS) {
    const surface = over(read('surface'), [255, 255, 255]);
    const back = over(read(bg), surface);
    const m = ratio(over(read(fg), back), back);
    if (m >= floor) continue;
    // The host's token gives way; if both are the host's, both do.
    const own = [fg, bg].filter(host);
    for (const t of own.length ? own : [fg]) fall(t, m, floor);
  }
  for (const [t, floor] of SIZES) { const m = px(t); if (m < floor) fall(t, m, floor); }
  probe.remove();
  for (const r of rejected) console.warn(`Marque theme: ${r.token} measured ${r.measured}, floor ${r.floor}; shipped value used`);
  return { checked: PAIRS.length + SIZES.length, rejected };
}
