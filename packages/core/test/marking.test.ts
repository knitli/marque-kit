// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// html(): a marking as a string, under plain node, with no DOM at all.
// `node --conditions=source --test test/marking.test.ts`
import assert from 'node:assert/strict';
import { escape, html, tree } from '../src/marking.ts';
import type { Marking } from '../src/types.ts';

assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined', 'no DOM here');

// The memo's ¶5, with help on two tokens: layers, tokens, <wbr> between, help targets, the spoken label.
const p5 = html('(S//NF/REL TO USA, GBR)', { help: ['NF', 'REL TO'], vocab: { USA: 'United States' } });
assert.equal(
  p5,
  '<span class="mq-mark" dir="ltr" data-text="(S//NF/REL TO USA, GBR)" role="group" ' +
    'aria-label="S, NF, REL TO, United States, G-B-R">' +
    '<span class="mq-l"><span class="mq-i">(S</span></span><wbr>' +
    '<span class="mq-l"><span class="mq-i mq-tok" tabindex="0" data-help="NF" role="button">//NF</span><wbr>' +
    '<span class="mq-i mq-tok" tabindex="0" data-help="REL TO" role="button">/REL TO </span><wbr>' +
    '<span class="mq-i">USA, </span><wbr><span class="mq-i">GBR)</span></span></span>',
);
// Never inside a token: REL TO is one span.
assert.ok(!/>\/REL <|>TO </.test(p5), 'REL TO not split');

// States and sizes are classes; stacked is fixed so a later measure doesn't undo it.
assert.match(html('(U)', { state: 'derived', size: 'lg' }), /^<span class="mq-mark derived lg" dir="ltr"/);
assert.match(html('(U)', { size: 'xs', stacked: true }), /^<span class="mq-mark xs stacked" data-stack="fixed"/);
assert.match(html('(U)', { form: 'summary' }), /^<span class="mq-mark summary"/);

// Classes and attributes only: nothing a strict CSP (style-src 'self') would refuse.
const codes = 'AUS, AUT, BEL, BGR, CAN, CHE, CZE, DEU, DNK, ESP';
for (const form of ['full', 'folded', 'summary', 'diff'] as const) {
  const s = html(`(S//REL TO USA, ${codes})`, { form, state: 'review' });
  assert.ok(!/\sstyle=|<script|<style|\son\w+=/i.test(s), `${form}: no inline style, script or handler`);
}

// The folded form: a fold control, and the model it opens to (masks stay masks).
const folded = html(`(S//REL TO USA, ${codes})`, { form: 'folded' });
assert.match(folded, /<span class="mq-fold" role="button" tabindex="0">\+8 more<\/span>/);
assert.match(folded, / data-model="\{&quot;layers&quot;:/);
assert.ok(!html(`(S//REL TO USA, ${codes})`).includes('data-model'), 'the full form carries no model');

// Both masks: underscores and blocks, never the bytes they cover, in text, label or model.
const concealed: Marking = {
  text: '(S//FGI AUS//NF)',
  layers: [{ tokens: [{ t: '(S' }] }, { tokens: [{ t: '//FGI ' }, { t: 'AUS' }] }, { tokens: [{ t: '//NF)' }] }],
  masks: [{ kind: 'concealed', span: [8, 11] }],
};
for (const form of ['full', 'folded', 'summary', 'diff'] as const) {
  const s = html(concealed, { form, fold: 0 });
  assert.ok(!s.includes('AUS'), `${form}: concealed code never written`);
  if (form !== 'summary')
    assert.match(s, /<span class="mq-conceal" tabindex="0" title="Source concealed.">███<\/span>/);
  else assert.ok(s.includes('███'));
  assert.match(s, /aria-label="S, F-G-I, source concealed, NF"/);
}
const unread = html({ text: '(TS//REL TO USA, KOR)', masks: [{ kind: 'unidentified', layer: 0, len: 5 }] });
assert.match(
  unread,
  /<span class="mq-mask" tabindex="0" title="5 characters Marque couldn&#39;t identify.">_____<\/span>/,
);

// Hostile input: every text and attribute value is escaped, so nothing becomes markup.
const evil = `(S//REL TO USA, <script>alert("x")</script> & 'GBR' "><img src=x onerror=alert(1)>)`;
const hostile = [
  html(evil, {
    state: `review" onmouseover="alert(1)`,
    vocab: { USA: '<b>"United" & \'States\'</b>' },
  }),
  // Through every attribute: help, a fold label, the model a fold carries.
  html(
    {
      text: evil,
      layers: [
        { tokens: [{ t: '(S' }] },
        {
          tokens: ['//REL TO ', 'USA, ', 'AUS, ', 'CAN, ', 'GBR, ', 'NZL, ', `"><script>x</script>)`].map((t) => ({
            t,
            help: `"><img onerror=1>`,
          })),
        },
      ],
    },
    { form: 'folded', foldLabel: '<i onclick="x">more</i>' },
  ),
];
const TAGS = /<(\/?)([a-z]+)((?:\s[a-z-]+="[^"]*")*)>/g;
for (const out of hostile) {
  // Every '<' starts one of the marking's own tags, with only the marking's own attributes.
  const tags = [...out.matchAll(TAGS)];
  assert.equal(tags.length, (out.match(/</g) || []).length, 'every < is a tag the kit wrote');
  for (const [, , tag, attrs] of tags) {
    assert.ok(tag === 'span' || tag === 'wbr', `tag ${tag}`);
    for (const [, name] of attrs!.matchAll(/\s([a-z-]+)="[^"]*"/g))
      assert.ok(
        [
          'class',
          'dir',
          'data-text',
          'data-stack',
          'data-model',
          'data-help',
          'role',
          'aria-label',
          'tabindex',
          'title',
        ].includes(name!),
        `attribute ${name}`,
      );
  }
  assert.ok(!out.includes('<script') && !out.includes('<img') && !out.includes('<b>') && !out.includes('<i '));
}
assert.ok(hostile[0]!.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'), 'the text survives, escaped');
assert.ok(hostile[0]!.includes('&amp; &#39;GBR&#39;'), '& and quotes escaped');
assert.ok(
  hostile[0]!.includes('class="mq-mark review&quot; onmouseover=&quot;alert(1)"'),
  'a hostile state stays in its attribute',
);
assert.ok(hostile[1]!.includes('data-help="&quot;&gt;&lt;img onerror=1&gt;"'), 'help escaped');
assert.equal(escape(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');

// tree() is the structure html() writes: same root, same children.
const t = tree('(S//REL TO USA, GBR)');
assert.equal(t.tag, 'span');
assert.equal(t.kids.filter((k) => typeof k !== 'string' && k.tag === 'span').length, 2, 'two layers');
console.log('marking: ok');
