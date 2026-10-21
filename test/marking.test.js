// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// The parsing half of src/marking.js, run under plain node (no DOM).
// `node test/marking.test.js`
import assert from 'node:assert/strict';
import { layers, tokens, parse, spoken } from '../src/marking.js';

const cases = [
  ['(U)', ['(U)'], [['(U)']]],
  ['(S//REL TO USA, FVEY)', ['(S', '//REL TO USA, FVEY)'], [['(S'], ['//REL TO ', 'USA, ', 'FVEY)']]],
  ['(//JOINT S AUS GBR//REL TO USA, GBR)', ['(//JOINT S AUS GBR', '//REL TO USA, GBR)'], [['(//JOINT ', 'S ', 'AUS ', 'GBR'], ['//REL TO ', 'USA, ', 'GBR)']]],
  ['(S//NF/REL TO USA, GBR)', ['(S', '//NF/REL TO USA, GBR)'], [['(S'], ['//NF', '/REL TO ', 'USA, ', 'GBR)']]],
  ['TOP SECRET//SI-G/TK//NOFORN', ['TOP SECRET', '//SI-G/TK', '//NOFORN'], [['TOP SECRET'], ['//SI-G', '/TK'], ['//NOFORN']]],
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
const codes = 'AUS, AUT, BEL, BGR, CAN, CHE, CZE, DEU, DNK, ESP, EST, FIN, FRA, GBR, GRC, HRV, HUN, IRL, ISL, ITA, LTU, LUX, LVA, NLD';
const long = `(S//REL TO USA, ${codes})`;
const toks = tokens(layers(long)[1]);
assert.equal(toks.filter((t) => /^[A-Z]{3},? ?\)?$/.test(t)).length, 25, '25 codes');
assert.equal(layers(long).join(''), long, 'round-trips');
assert.equal(spoken('(S//REL TO USA, GBR)'), 'S, REL TO, U-S-A, G-B-R');
console.log(`ok · ${cases.length + 1} markings`);
