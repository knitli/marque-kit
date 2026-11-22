// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The parsing half of src/marking.js, run under plain node (no DOM).
// `node test/marking.test.js`
import assert from 'node:assert/strict';
import { layers, tokens, parse, spoken, masked } from '../src/marking.ts';
import type { Marking } from '@knitli/marque-kit-core/types';

const cases: [text: string, layers: string[], tokens: string[][]][] = [
  ['(U)', ['(U)'], [['(U)']]],
  ['(S//REL TO USA, FVEY)', ['(S', '//REL TO USA, FVEY)'], [['(S'], ['//REL TO ', 'USA, ', 'FVEY)']]],
  [
    '(//JOINT S AUS GBR//REL TO USA, GBR)',
    ['(//JOINT S AUS GBR', '//REL TO USA, GBR)'],
    [
      ['(//JOINT ', 'S ', 'AUS ', 'GBR'],
      ['//REL TO ', 'USA, ', 'GBR)'],
    ],
  ],
  ['(S//NF/REL TO USA, GBR)', ['(S', '//NF/REL TO USA, GBR)'], [['(S'], ['//NF', '/REL TO ', 'USA, ', 'GBR)']]],
  [
    'TOP SECRET//SI-G/TK//NOFORN',
    ['TOP SECRET', '//SI-G/TK', '//NOFORN'],
    [['TOP SECRET'], ['//SI-G', '/TK'], ['//NOFORN']],
  ],
  ['(S//FGI AUS GBR//NF)', ['(S', '//FGI AUS GBR', '//NF)'], [['(S'], ['//FGI ', 'AUS ', 'GBR'], ['//NF)']]],
];
for (const [text, L, T] of cases) {
  assert.deepEqual(layers(text), L, `layers of ${text}`);
  assert.deepEqual(layers(text).map(tokens), T, `tokens of ${text}`);
  // never a break inside a multi-word token
  for (const t of parse(text).layers.flatMap((l) => l.tokens.map((x) => x.t))) {
    assert.ok(!/^(REL|TOP|DISPLAY)$/.test(t.trim()), `split inside a token: "${t}" in ${text}`);
  }
}
// a long one: 24 countries, every code its own token, nothing lost
const codes =
  'AUS, AUT, BEL, BGR, CAN, CHE, CZE, DEU, DNK, ESP, EST, FIN, FRA, GBR, GRC, HRV, HUN, IRL, ISL, ITA, LTU, LUX, LVA, NLD';
const long = `(S//REL TO USA, ${codes})`;
const toks = tokens(layers(long)[1]!);
assert.equal(toks.filter((t) => /^[A-Z]{3},? ?\)?$/.test(t)).length, 25, '25 codes');
assert.equal(layers(long).join(''), long, 'round-trips');
assert.equal(spoken('(S//REL TO USA, GBR)'), 'S, REL TO, U-S-A, G-B-R');
// A concealed span the tokens still carry is never said: only that a source is concealed.
const hidden: Marking = {
  text: '(S//FGI AUS//NF)',
  layers: [{ tokens: [{ t: '(S' }] }, { tokens: [{ t: '//FGI ' }, { t: 'AUS' }] }, { tokens: [{ t: '//NF)' }] }],
  masks: [{ kind: 'concealed', span: [8, 11] }],
};
assert.equal(spoken(hidden).includes('A-U-S'), false, 'concealed code not spoken');
assert.equal(spoken(hidden), 'S, F-G-I, source concealed, NF');
// Spans are UTF-8 bytes: text before the mask that isn't ASCII doesn't shift it onto another token.
const wide: Marking = {
  text: '(S//éééé AUS//NF)',
  layers: [{ tokens: [{ t: '(S' }] }, { tokens: [{ t: '//éééé ' }, { t: 'AUS' }] }, { tokens: [{ t: '//NF)' }] }],
  masks: [{ kind: 'concealed', span: [13, 16] }],
};
assert.equal(spoken(wide).includes('A-U-S'), false, 'byte span conceals AUS');
assert.equal(spoken(wide).includes('NF'), true, 'and only AUS');
// A span through part of a token keeps the rest of it, and the mask is said where it stands.
const part: Marking = {
  text: '(S//REL TO USA)',
  layers: [{ tokens: [{ t: '(S' }] }, { tokens: [{ t: '//REL TO ' }, { t: 'USA)' }] }],
  masks: [{ kind: 'unidentified', span: [12, 13] }],
};
assert.equal(spoken(part), 'S, REL TO, U, 1 character not identified, A');
// As plain text (a receipt label), the mask is drawn and the bytes it covers never are.
assert.equal(masked(hidden), '(S//FGI ███//NF)');
assert.equal(masked(part), '(S//REL TO U_A)');
// Inconsistent producer tokens never override the source text or its span masks.
const mismatch: Marking = {
  text: 'PUBLIC HIDE END',
  layers: [{ tokens: [{ t: 'PUBLIC HIDE END-CANARY', help: 'CANARY-HELP' }] }],
  masks: [{ kind: 'concealed', span: [7, 11] }],
};
assert.equal(masked(mismatch), 'PUBLIC ████ END');
assert.ok(!spoken(mismatch).includes('CANARY'));
const inline: Marking = {
  text: 'PUBLIC END',
  layers: [{ tokens: [{ t: 'PUBLIC ' }, { t: '', mask: { kind: 'concealed', len: 2 } }, { t: 'END' }] }],
  masks: [],
};
assert.equal(masked(inline), 'PUBLIC ██END');
assert.ok(spoken(inline).includes('source concealed'));
const both: Marking = {
  ...inline,
  text: 'PUBLIC HIDE END',
  layers: [{ tokens: [{ t: 'PUBLIC HIDE ' }, { t: '', mask: { kind: 'unidentified', len: 2 } }, { t: 'END' }] }],
  masks: [{ kind: 'concealed', span: [7, 11] }],
};
assert.equal(masked(both), 'PUBLIC ████ __END');
assert.ok(spoken(both).includes('source concealed'));
assert.ok(spoken(both).includes('2 characters not identified'));
const ambiguous: Marking = { ...inline, text: 'PUBLIC SECRET END' };
assert.ok(!masked(ambiguous).includes('SECRET'));
assert.ok(!spoken(ambiguous).includes('SECRET'));
const invalid: Marking = {
  text: 'éSECRET',
  layers: [{ tokens: [{ t: 'éSECRET' }] }],
  masks: [{ kind: 'concealed', span: [1, 3] }],
};
assert.ok(!masked(invalid).includes('SECRET'));
assert.ok(!spoken(invalid).includes('SECRET'));
const malformedSpan = {
  text: 'SECRET',
  layers: [{ tokens: [{ t: 'SECRET' }] }],
  masks: [{ kind: 'concealed', span: 'bad' }],
} as unknown as Marking;
assert.ok(!masked(malformedSpan).includes('SECRET'));
assert.ok(!spoken(malformedSpan).includes('SECRET'));
console.log(`ok · ${cases.length + 1} markings`);
