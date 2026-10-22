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
  ['text', 'surface', 4.5], ['text-muted', 'surface', 4.5], ['surface', 'text', 4.5], // the tooltip turns them round
  ['act-ink', 'surface', 4.5], ['act-on', 'act', 4.5], ['act-on', 'act-hover', 4.5], ['act-ink', 'act-tint', 4.5], ['text', 'act-tint', 4.5], ['text-muted', 'act-tint', 4.5], // options and rows, hovered or chosen
  ['attn-on', 'attn', 4.5], ['attn-ink', 'surface', 4.5], ['attn-ink', 'attn-tint', 4.5], ['text', 'attn-tint', 4.5], // a cited sentence, highlighted
  ['error-ink', 'surface', 4.5], ['focus', 'surface', 3.0], ['focus', 'ground', 3.0],
  ['attn-ink', 'ground', 4.5], // the brand's gold and the Needs-you section mark
  ['text', 'ground', 4.5], ['text-muted', 'ground', 4.5], ['act-ink', 'ground', 4.5], // the pane's headings, footer links and section marks sit on the ground
  ['text', 'surface-sunken', 4.5], ['text-muted', 'surface-sunken', 4.5], ['act-ink', 'surface-sunken', 4.5], // open rows, wells, notices
  ['rule-strong', 'surface', 3.0], // card, option and input borders: a non-text part
];
export const SIZES = [['size-xs', 12], ['size-sm', 13], ['size-md', 13]]; // md carries banner markings
/** The narrowest pane a card fits (docs/THEME.md); under it the kit shows rows only. */
export const FLOOR = 240;

/** Any CSS colour → sRGB [r, g, b, a], by painting it: oklch(), lab() and color() aren't rgb numbers. */
function srgb(css) {
  if (/^rgba?\(/.test(css)) return rgba(css);
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const ctx = c.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) return rgba(css);
  ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
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

// theme.css's token blocks; a host's own `.mq { … }` is not one of them.
const norm = (sel) => sel.replace(/[\s"']/g, '');
const THEMES = new Set(['.mq,[data-mq-theme=light]', '[data-mq-theme=dark]', '[data-mq-theme=auto]'].map(norm));
const applies = (n, sel) => { try { return n.matches(sel); } catch { return false; } }; // ::before and the like
const same = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

/** The --mq-* values theme.css gives `root`, ignoring anything a host set. */
function shipped(root) {
  const blocks = [], first = new Set();
  const walk = (rules, at = '') => {
    for (const r of rules) {
      // A style rule has cssRules too (nesting), so it is matched first.
      if (r.style && r.selectorText) {
        // theme.css declares each block once; the same selector again, later, is a host's override.
        const key = `${at}|${norm(r.selectorText)}`;
        if (THEMES.has(norm(r.selectorText)) && !first.has(key)) { first.add(key); blocks.push(r); }
      } else if (r.cssRules && (!r.media || matchMedia(r.media.mediaText).matches)) walk(r.cssRules, `${at}@${r.media?.mediaText ?? ''}`);
    }
  };
  // Found by the kit's own theme selectors, so a bundled, inlined or renamed theme.css still counts.
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* another origin without CORS: unreadable */ }
  }
  // Tokens inherit, and the nearest declaration wins: each token comes from the nearest element a
  // block styles (its own `.mq` before an ancestor's theme), later blocks over earlier, as the cascade does.
  const out = {};
  for (let n = root; n; n = n.parentElement) {
    const own = Object.fromEntries(blocks.filter((r) => applies(n, r.selectorText))
      .flatMap((r) => [...r.style].filter((p) => p.startsWith('--mq-')).map((p) => [p, r.style.getPropertyValue(p).trim()])));
    for (const [p, v] of Object.entries(own)) if (!(p in out)) out[p] = v;
  }
  return out;
}

/** The room the host gives the pane: root's own width, and no more than its parent's.
 *  `.mq`'s min-width is set aside to measure it; it would only overflow the room. */
function room(root) {
  const [v, pr] = [root.style.getPropertyValue('min-width'), root.style.getPropertyPriority('min-width')];
  root.style.setProperty('min-width', '0px', 'important');
  const w = Math.min(root.clientWidth, (root.parentElement || root).clientWidth);
  if (v) root.style.setProperty('min-width', v, pr); else root.style.removeProperty('min-width');
  return w;
}

/** What `root` paints on: its own background and its ancestors', laid down from the page's white.
 *  shortcut: background images and gradients are not seen; measure them if a host needs it. */
function backdrop(root) {
  const layers = [];
  for (let n = root; n; n = n.parentElement) layers.push(srgb(getComputedStyle(n).backgroundColor));
  return layers.reduceRight((under, c) => over(c, under), [255, 255, 255, 1]);
}

// root → the fallbacks check() set inline, with what the host had there, so a re-check can put it back
const pinned = new WeakMap();

/** Put back what the host had on `root` before check() pinned fallbacks there. */
export function release(root) {
  for (const { t, ship, value, priority } of pinned.get(root) || []) {
    if (!same(root.style.getPropertyValue(t), ship)) continue; // the host has set it again since
    if (value) root.style.setProperty(t, value, priority); else root.style.removeProperty(t);
  }
  pinned.delete(root);
}

/** Measure `root`'s tokens; fall back the host's where a pair fails.
 *  Run again when the theme changes: it lifts its own earlier fallbacks first. */
export function check(root) {
  if (!root?.isConnected) return null;
  release(root);
  pinned.set(root, []);
  const probe = document.createElement('span');
  probe.hidden = true;
  root.append(probe);
  const read = (t) => { probe.style.color = `var(--mq-${t})`; return srgb(getComputedStyle(probe).color); };
  const px = (t) => { probe.style.fontSize = `var(--mq-${t})`; return parseFloat(getComputedStyle(probe).fontSize); };
  const ship = shipped(root), cs = getComputedStyle(root);
  const host = (t) => ship[`--mq-${t}`] && !same(cs.getPropertyValue(`--mq-${t}`), ship[`--mq-${t}`]);
  const rejected = [];
  const fall = (t, measured, floor) => {
    const token = `--mq-${t}`;
    // fallback: false when theme.css couldn't be read (another origin without CORS): reported, not fixed.
    let fallback = host(t);
    if (fallback) {
      pinned.get(root).push({ t: token, ship: ship[token], value: root.style.getPropertyValue(token), priority: root.style.getPropertyPriority(token) });
      // Important, so a host rule marked !important gives way too; checked, not assumed.
      root.style.setProperty(token, ship[token], 'important');
      fallback = !host(t);
    }
    if (!rejected.some((r) => r.token === token)) rejected.push({ token, measured: Math.round(measured * 100) / 100, floor, fallback });
    return fallback;
  };
  // Forced colours: the user's system palette is in force, and it isn't the host's to fail or ours to replace.
  const forced = matchMedia('(forced-colors: active)').matches;
  // A fallback can break a pair that passed before it, so the pairs run again until nothing moves.
  for (let pass = 0, moved = !forced; moved && pass < PAIRS.length; pass++) {
    moved = false;
    for (const [fg, bg, floor] of PAIRS) {
      const page = backdrop(root); // the ground is root's own background
      const surface = over(read('surface'), page);
      const back = bg === 'ground' ? page : bg === 'surface' ? surface : over(read(bg), surface); // each layer composited once
      const m = ratio(over(read(fg), back), back);
      if (m >= floor) continue;
      // The host's token gives way; if both are the host's, both do.
      const own = [fg, bg].filter(host);
      for (const t of own.length ? own : [fg]) if (fall(t, m, floor)) moved = true;
    }
  }
  for (const [t, floor] of SIZES) { const m = px(t); if (m < floor) fall(t, m, floor); }
  // The mark font must be monospace: narrow and wide letters measure the same (1.0).
  probe.className = 'mq-mark';
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    ctx.font = `16px ${getComputedStyle(probe).fontFamily}`;
    const m = ctx.measureText('iiiiii').width / ctx.measureText('MMMMMM').width;
    if (Math.abs(1 - m) > 0.02) fall('font-mark', m, 1);
  }
  probe.remove();
  for (const r of rejected) console.warn(`Marque theme: ${r.token} measured ${r.measured}, floor ${r.floor}; ${r.fallback ? 'shipped value used' : 'no shipped value could be read to fall back to'}`);
  const width = room(root);
  const narrow = width < FLOOR;
  if (narrow) console.warn(`Marque theme: the pane is ${width}px wide, under ${FLOOR}px; cards can't be laid out, so only rows are shown`);
  return { checked: (forced ? 0 : PAIRS.length) + SIZES.length + 2, rejected, width, narrow };
}

/** Re-check whenever the theme can change: data-mq-theme anywhere above, the scheme `auto` follows,
 *  forced colours, or the pane crossing the width floor. */
export function watch(root, onTheme) {
  // A root mounted detached is checked once it's in the document.
  let done = root.isConnected;
  // A host can retheme the root or anything above it: a class, or tokens in a style. The gate's
  // own pins are in the signature it leaves behind, so they don't set it off again.
  const chain = () => { const ns = []; for (let n = root; n; n = n.parentElement) ns.push(n); return ns; };
  const sig = () => chain().map((n) => `${n.className}|${n.style.cssText}`).join('\n');
  let last = sig();
  const run = () => { onTheme(check(root)); last = sig(); };
  // A root moved under another ancestor (removed and put back) may be under another theme.
  let parent = root.parentElement;
  const mo = new MutationObserver((ms) => {
    if (!root.isConnected) return;
    const moved = root.parentElement !== parent || ms.some((m) => [...m.addedNodes].some((n) => n === root || n.contains?.(root)));
    if (moved) { narrow = under(); if (ro) { ro.disconnect(); ro.observe(root); if (root.parentElement) ro.observe(root.parentElement); } }
    parent = root.parentElement;
    const themed = ms.some((m) => m.type === 'attributes' && m.attributeName === 'data-mq-theme');
    if (themed || moved || !done || sig() !== last) { done = true; run(); }
  });
  const mqs = ['(prefers-color-scheme: dark)', '(forced-colors: active)'].map((q) => matchMedia(q));
  // One registration (a second on the same node would replace the first); the signature sorts out
  // which class or style changes are on the root's own line.
  mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-mq-theme', 'class', 'style'], childList: true });
  mqs.forEach((q) => q.addEventListener('change', run));
  // Print has its own black-on-white palette: the screen fallbacks step aside for it, then come back.
  const printing = () => { release(root); last = sig(); };
  addEventListener('beforeprint', printing); addEventListener('afterprint', run);
  // Re-checked when the pane crosses the width floor, not on every resize.
  const under = () => room(root) < FLOOR;
  let narrow = under();
  const ro = typeof ResizeObserver !== 'undefined' && new ResizeObserver(() => {
    if (!root.isConnected || under() === narrow) return;
    narrow = under(); run();
  });
  if (ro) { ro.observe(root); if (root.parentElement) ro.observe(root.parentElement); }
  return () => {
    mo.disconnect(); mqs.forEach((q) => q.removeEventListener('change', run)); if (ro) ro.disconnect();
    removeEventListener('beforeprint', printing); removeEventListener('afterprint', run);
  };
}
