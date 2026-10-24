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

// [foreground, background, floor]; a tint is laid over the surface first. test/theme.test.js
// checks this against what kit.css and theme.css paint: a pairing is measured here or excused there.
import type { Rejected, ThemeReport } from '@marque/kit-core/types';

/** An sRGB colour with alpha: [r, g, b, a], channels 0–255, alpha 0–1. */
export type RGBA = [number, number, number, number];

export const PAIRS: readonly (readonly [fg: string, bg: string, floor: number])[] = [
  ['text', 'surface', 4.5],
  ['text-muted', 'surface', 4.5],
  ['surface', 'text', 4.5], // the tooltip turns them round
  ['act-ink', 'surface', 4.5],
  ['act-on', 'act', 4.5],
  ['act-on', 'act-hover', 4.5],
  ['act-ink', 'act-tint', 4.5],
  ['text', 'act-tint', 4.5],
  ['text-muted', 'act-tint', 4.5], // options and rows, hovered or chosen
  ['attn-on', 'attn', 4.5],
  ['attn-ink', 'surface', 4.5],
  ['attn-ink', 'attn-tint', 4.5],
  ['text', 'attn-tint', 4.5], // a cited sentence, highlighted
  ['error-ink', 'surface', 4.5],
  ['focus', 'surface', 3.0],
  ['focus', 'ground', 3.0],
  ['attn-ink', 'ground', 4.5], // the brand's gold and the Needs-you section mark
  ['text', 'ground', 4.5],
  ['text-muted', 'ground', 4.5],
  ['act-ink', 'ground', 4.5], // the pane's headings, footer links and section marks sit on the ground
  ['text', 'surface-sunken', 4.5],
  ['text-muted', 'surface-sunken', 4.5],
  ['act-ink', 'surface-sunken', 4.5], // open rows, wells, notices
  ['rule-strong', 'surface', 3.0],
  ['rule-strong', 'ground', 3.0], // borders on cards and on the pane itself: non-text parts
  ['rule-strong', 'surface-sunken', 3.0], // buttons in a well
  ['focus', 'surface-sunken', 3.0],
  ['focus', 'act-tint', 3.0],
  ['focus', 'attn-tint', 3.0], // a focus ring wherever a control can be
  ['act-ink', 'attn-tint', 4.5], // a link-coloured marking with a highlighted layer
];
export const SIZES: readonly (readonly [token: string, floor: number])[] = [
  ['size-xs', 12],
  ['size-sm', 13],
  ['size-md', 13],
]; // md carries banner markings
const TOKENS = [...new Set([...PAIRS.flatMap(([f, b]) => [f, b]), ...SIZES.map(([t]) => t), 'font-mark'])];
/** The narrowest pane a card fits (docs/THEME.md); under it the kit shows rows only. */
export const FLOOR = 240;

/** Any CSS colour → sRGB [r, g, b, a], by painting it: oklch(), lab() and color() aren't rgb numbers. */
function srgb(css: string): RGBA {
  if (/^rgba?\(/.test(css)) return rgba(css);
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) return rgba(css);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
/** "rgb(r, g, b)" / "rgba(r, g, b, a)" → [r, g, b, a]. */
export const rgba = (s: string): RGBA => {
  const [r = NaN, g = NaN, b = NaN, a = 1] = (s.match(/[\d.]+/g) || []).map(Number);
  return [r, g, b, a];
};
/** `top` laid over an opaque `under`. */
export const over = ([r, g, b, a]: RGBA, [R, G, B]: Readonly<RGBA> | readonly [number, number, number]): RGBA => [
  r * a + R * (1 - a),
  g * a + G * (1 - a),
  b * a + B * (1 - a),
  1,
];
const lum = (c: RGBA): number => {
  const [r = 0, g = 0, b = 0] = c.slice(0, 3).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast of two opaque colours. */
export const ratio = (a: RGBA, b: RGBA): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// theme.css's token blocks; a host's own `.mq { … }` is not one of them.
const norm = (sel: string): string => sel.replace(/[\s"']/g, '');
const THEMES = new Set(['.mq,[data-mq-theme=light]', '[data-mq-theme=dark]', '[data-mq-theme=auto]'].map(norm));
const applies = (n: Element, sel: string): boolean => {
  try {
    return n.matches(sel);
  } catch {
    return false;
  }
}; // ::before and the like
const same = (a: string, b: string): boolean => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

/** The --mq-* values theme.css gives `root`, ignoring anything a host set. */
function shipped(root: Element): Record<string, string> {
  const blocks: CSSStyleRule[] = [],
    first = new Set<string>();
  const walk = (rules: CSSRuleList, at = ''): void => {
    for (const r of rules) {
      // A style rule has cssRules too (nesting), so it is matched first.
      if (r instanceof CSSStyleRule) {
        // theme.css declares each block once; the same selector again, later, is a host's override.
        const key = `${at}|${norm(r.selectorText)}`;
        if (THEMES.has(norm(r.selectorText)) && !first.has(key)) {
          first.add(key);
          blocks.push(r);
        }
      } else if (
        r instanceof CSSGroupingRule &&
        (!(r instanceof CSSMediaRule) || matchMedia(r.media.mediaText).matches)
      )
        walk(r.cssRules, `${at}@${r instanceof CSSMediaRule ? r.media.mediaText : ''}`);
    }
  };
  // Found by the kit's own theme selectors, so a bundled, inlined or renamed theme.css still counts.
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* another origin without CORS: unreadable */
    }
  }
  // Tokens inherit, and the nearest declaration wins: each token comes from the nearest element a
  // block styles (its own `.mq` before an ancestor's theme), later blocks over earlier, as the cascade does.
  const out: Record<string, string> = {};
  for (let n: Element | null = root; n; n = n.parentElement) {
    const own = Object.fromEntries(
      blocks
        .filter((r) => applies(n, r.selectorText))
        .flatMap((r) =>
          [...r.style].filter((p) => p.startsWith('--mq-')).map((p) => [p, r.style.getPropertyValue(p).trim()]),
        ),
    );
    for (const [p, v] of Object.entries(own)) if (!(p in out)) out[p] = v;
  }
  return out;
}

/** The room the host gives the pane: root's own width, and no more than its parent's.
 *  `.mq`'s min-width is set aside to measure it; it would only overflow the room. */
function room(root: HTMLElement): number {
  const [v, pr] = [root.style.getPropertyValue('min-width'), root.style.getPropertyPriority('min-width')];
  root.style.setProperty('min-width', '0px', 'important');
  const w = Math.min(root.clientWidth, (root.parentElement || root).clientWidth);
  if (v) root.style.setProperty('min-width', v, pr);
  else root.style.removeProperty('min-width');
  return w;
}

/** What `root` sits on: its ancestors' backgrounds, laid down from the page's white. The pane paints
 *  its own ground over that. shortcut: background images and gradients are not seen; measure them if a host needs it. */
function backdrop(root: Element): RGBA {
  const layers: RGBA[] = [];
  for (let n = root.parentElement; n; n = n.parentElement) layers.push(srgb(getComputedStyle(n).backgroundColor));
  return layers.reduceRight<RGBA>((under, c) => over(c, under), [255, 255, 255, 1]);
}

/** The print palette theme.css sets (its @media print token block), by token. Only that block, the
 *  first under its selector: a host's print rule is the host's, not a fallback. */
const PRINT = norm('.mq, [data-mq-theme]');
function printPalette(): Record<string, string> {
  let block: CSSStyleRule | null = null;
  const walk = (rules: CSSRuleList, inPrint: boolean): void => {
    for (const r of rules) {
      if (block) return;
      if (r instanceof CSSStyleRule) {
        if (inPrint && norm(r.selectorText) === PRINT) block = r;
      } else if (r instanceof CSSGroupingRule)
        walk(r.cssRules, inPrint || /\bprint\b/.test(r instanceof CSSMediaRule ? r.media.mediaText : ''));
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      /* unreadable */
    }
  }
  const b = block as CSSStyleRule | null; // set inside walk(), which flow analysis can't see
  return Object.fromEntries(
    b ? [...b.style].filter((p) => p.startsWith('--mq-')).map((p) => [p, b.style.getPropertyValue(p).trim()]) : [],
  );
}

// root → the fallbacks check() set inline, with what the host had there, so a re-check can put it back
/** A fallback check() pinned: the token, the shipped value, what it last put there, and what the host had. */
interface Pin {
  t: string;
  ship: string;
  put?: string;
  value: string;
  priority: string;
}
const pinned = new WeakMap<HTMLElement, Pin[]>();

/** Put back what the host had on `root` before check() pinned fallbacks there. */
export function release(root: HTMLElement): void {
  for (const { t, ship, put = ship, value, priority } of pinned.get(root) || []) {
    const now = root.style.getPropertyValue(t);
    // What the kit last put there, the print palette's value mid-print included, is still the kit's to take back.
    if (!same(now, put)) continue; // the host has set it again, or taken it away, since
    if (value) root.style.setProperty(t, value, priority);
    else root.style.removeProperty(t);
  }
  pinned.delete(root);
}

/** Measure `root`'s tokens; fall back the host's where a pair fails.
 *  Run again when the theme changes: it lifts its own earlier fallbacks first. */
export function check(root: HTMLElement | null | undefined): ThemeReport | null {
  if (!root?.isConnected) return null;
  release(root);
  pinned.set(root, []);
  const probe = document.createElement('span');
  probe.hidden = true;
  root.append(probe);
  const read = (t: string): RGBA => {
    probe.style.color = `var(--mq-${t})`;
    return srgb(getComputedStyle(probe).color);
  };
  const px = (t: string): number => {
    probe.style.fontSize = `var(--mq-${t})`;
    return parseFloat(getComputedStyle(probe).fontSize);
  };
  const ship = shipped(root),
    cs = getComputedStyle(root);
  const host = (t: string): boolean => {
    const v = ship[`--mq-${t}`];
    return !!v && !same(cs.getPropertyValue(`--mq-${t}`), v);
  };
  const rejected: Rejected[] = [];
  const fall = (t: string, measured: number, floor: number): boolean => {
    const token = `--mq-${t}`;
    // fallback: false when theme.css couldn't be read (another origin without CORS): reported, not fixed.
    let fallback = host(t);
    if (fallback) {
      pinned.get(root)?.push({
        t: token,
        ship: ship[token] ?? '',
        value: root.style.getPropertyValue(token),
        priority: root.style.getPropertyPriority(token),
      });
      // Important, so a host rule marked !important gives way too; checked, not assumed.
      root.style.setProperty(token, ship[token] ?? '', 'important');
      fallback = !host(t);
    }
    if (!rejected.some((r) => r.token === token))
      rejected.push({ token, measured: Math.round(measured * 100) / 100, floor, fallback });
    return fallback;
  };
  // Forced colours: the user's system palette is in force, and it isn't the host's to fail or ours to replace.
  const forced = matchMedia('(forced-colors: active)').matches;
  // A fallback can break a pair that passed before it, so the pairs run again until nothing moves.
  // The pane paints the ground from root's own tokens, over whatever is above it: measured once,
  // and again only after a fallback, which may have moved the ground or the surface.
  const base = (under: RGBA = backdrop(root)) => {
    const page = over(read('ground'), under);
    return { under, page, surface: over(read('surface'), page) };
  };
  let lay = base();
  for (let pass = 0, moved = !forced; moved && pass < PAIRS.length; pass++) {
    moved = false;
    for (const [fg, bg, floor] of PAIRS) {
      const { page, surface } = lay;
      const back = bg === 'ground' ? page : bg === 'surface' ? surface : over(read(bg), surface); // each layer composited once
      const m = ratio(over(read(fg), back), back);
      if (m >= floor) continue;
      // The host's token gives way; if both are the host's, both do.
      const own = [fg, bg].filter(host);
      let fell = false;
      for (const t of own.length ? own : [fg]) if (fall(t, m, floor)) fell = true;
      if (!fell) continue;
      moved = true;
      lay = base(lay.under); // the backdrop is above the root: a pin on the root can't move it
    }
  }
  for (const [t, floor] of SIZES) {
    const m = px(t);
    if (m < floor) fall(t, m, floor);
  }
  // The mark font must be monospace: narrow and wide letters measure the same (1.0).
  probe.className = 'mq-mark';
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    ctx.font = `16px ${getComputedStyle(probe).fontFamily}`;
    const m = ctx.measureText('iiiiii').width / ctx.measureText('MMMMMM').width;
    if (Math.abs(1 - m) > 0.02) fall('font-mark', m, 1);
  }
  probe.remove();
  for (const r of rejected)
    console.warn(
      `Marque theme: ${r.token} measured ${r.measured}, floor ${r.floor}; ${r.fallback ? 'shipped value used' : 'no shipped value could be read to fall back to'}`,
    );
  const width = room(root);
  const narrow = width < FLOOR;
  if (narrow)
    console.warn(
      `Marque theme: the pane is ${width}px wide, under ${FLOOR}px; cards can't be laid out, so only rows are shown`,
    );
  return { checked: (forced ? 0 : PAIRS.length) + SIZES.length + 2, rejected, width, narrow };
}

/** Re-check whenever the theme can change: data-mq-theme anywhere above, the scheme `auto` follows,
 *  forced colours, or the pane crossing the width floor. */
export function watch(root: HTMLElement, onTheme: (report: ThemeReport | null) => void): () => void {
  // A root mounted detached is checked once it's in the document.
  let done = root.isConnected;
  // A host can retheme the root or anything above it: a class, or tokens in a style. The gate's
  // own pins are in the signature it leaves behind, so they don't set it off again.
  const chain = (): HTMLElement[] => {
    const ns: HTMLElement[] = [];
    for (let n: HTMLElement | null = root; n; n = n.parentElement) ns.push(n);
    return ns;
  };
  const sig = () =>
    chain()
      .map((n) => `${n.className}|${n.style.cssText}`)
      .join('\n');
  let last = sig();
  // The tokens as computed now, the gate's pins included: what a media query can move without the DOM changing.
  const values = () => {
    const cs = getComputedStyle(root);
    return TOKENS.map((t) => cs.getPropertyValue(`--mq-${t}`).trim()).join('|');
  };
  let seen = root.isConnected ? values() : '';
  const run = () => {
    onTheme(check(root));
    last = sig();
    seen = values();
  };
  // A root moved under another ancestor (removed and put back) may be under another theme.
  let parent = root.parentElement;
  // shortcut: rules changed through the CSSOM (insertRule, adoptedStyleSheets) aren't seen; a host that does so re-mounts.
  const LINKED = ['href', 'media', 'rel', 'disabled'];
  const links = new Set<Node>(); // linked sheets still loading, so unwatch can let them go
  const sheet = (n: Node): boolean =>
    n.nodeName === 'STYLE' || (n instanceof HTMLLinkElement && /\bstylesheet\b/i.test(n.rel));
  const mo = new MutationObserver((ms) => {
    if (!root.isConnected) return;
    const moved =
      root.parentElement !== parent || ms.some((m) => [...m.addedNodes].some((n) => n === root || n.contains(root)));
    if (moved) {
      narrow = under();
      if (ro) {
        ro.disconnect();
        ro.observe(root);
        if (root.parentElement) ro.observe(root.parentElement);
      }
    }
    parent = root.parentElement;
    const themed = ms.some((m) => m.type === 'attributes' && m.attributeName === 'data-mq-theme');
    // A stylesheet put in, taken out or rewritten can set tokens; a linked one is checked once it loads.
    for (const m of ms)
      for (const n of m.addedNodes)
        if (n.nodeName === 'LINK') {
          links.add(n);
          n.addEventListener('load', loaded, { once: true });
        }
    // A link switched in place (href, media, rel, disabled) applies at once or once its new sheet loads.
    for (const m of ms)
      if (m.type === 'attributes' && m.target.nodeName === 'LINK' && LINKED.includes(m.attributeName ?? '')) {
        links.add(m.target);
        m.target.addEventListener('load', loaded, { once: true });
      }
    const styled = ms.some(
      (m) =>
        (m.type === 'attributes' && m.target.nodeName === 'LINK' && LINKED.includes(m.attributeName ?? '')) ||
        (m.type === 'childList' &&
          ([...m.addedNodes, ...m.removedNodes].some(sheet) || m.target.nodeName === 'STYLE')) ||
        (m.type === 'characterData' && m.target.parentNode?.nodeName === 'STYLE'),
    );
    if (themed || styled || moved || !done || sig() !== last) {
      done = true;
      run();
    }
  });
  const mqs = ['(prefers-color-scheme: dark)', '(forced-colors: active)'].map((q) => matchMedia(q));
  // One registration (a second on the same node would replace the first); the signature sorts out
  // which class or style changes are on the root's own line.
  mo.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-mq-theme', 'class', 'style', ...LINKED],
    childList: true,
    characterData: true,
  });
  mqs.forEach((q) => q.addEventListener('change', run));
  // Print has its own black-on-white palette: the screen fallbacks step aside for it, then come back.
  // A rejected value stays out of print, the root's own or one inherited from above: each pinned token
  // takes the print palette's value (the screen fallback where print sets none), and the screen pins come back after.
  const printing = () => {
    const pal = printPalette();
    for (const p of pinned.get(root) || []) root.style.setProperty(p.t, (p.put = pal[p.t] ?? p.ship), 'important');
    last = sig();
  };
  const printed = () => {
    for (const p of pinned.get(root) || []) root.style.setProperty(p.t, (p.put = p.ship), 'important');
    run();
  };
  addEventListener('beforeprint', printing);
  addEventListener('afterprint', printed);
  // A host web font for marks may load after the first check measured its fallback: check again once it has.
  const fonts = document.fonts,
    loaded = () => {
      if (root.isConnected) run();
    };
  let live = true;
  if (fonts) {
    fonts.addEventListener('loadingdone', loaded);
    void fonts.ready.then(() => {
      if (live) loaded();
    });
  }
  // On a resize, re-checked when the pane crosses the width floor, or when a host media query
  // has moved a token's computed value; not on every frame.
  const under = () => room(root) < FLOOR;
  let narrow = under();
  const resized = () => {
    if (!root.isConnected) return;
    if (under() === narrow && values() === seen) return;
    narrow = under();
    run();
  };
  const ro = typeof ResizeObserver !== 'undefined' && new ResizeObserver(resized);
  if (ro) {
    ro.observe(root);
    if (root.parentElement) ro.observe(root.parentElement);
  }
  addEventListener('resize', resized);
  return () => {
    mo.disconnect();
    mqs.forEach((q) => q.removeEventListener('change', run));
    if (ro) ro.disconnect();
    removeEventListener('beforeprint', printing);
    removeEventListener('afterprint', printed);
    removeEventListener('resize', resized);
    live = false;
    if (fonts) fonts.removeEventListener('loadingdone', loaded);
    for (const n of links) n.removeEventListener('load', loaded);
    links.clear();
  };
}
