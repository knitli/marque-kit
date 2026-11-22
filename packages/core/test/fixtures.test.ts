// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The fixtures against the contract in types. JSON.parse gives `unknown`, and a JSON import
// widens 'span' to string, so each fixture is written out as a literal that `satisfies` its
// type and the checker runs on it: a slot the types don't name, or a value outside a union, fails.
// The files are .mts so they are ESM wherever the temp dir is, with or without a package.json above.
// `node test/fixtures.test.ts`
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc');
const FIXTURES = { 'memo.findings.json': 'Doc', 'memo.vocab.json': 'Vocab', 'memo.manual.json': 'Manual' } as const;

/** The checker's output on these sources, '' when they type. */
const check = (sources: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mq-fixtures-'));
  try {
    for (const [name, text] of Object.entries(sources)) writeFileSync(join(dir, name), text);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: join(root, 'tsconfig.json'),
        compilerOptions: { types: [], isolatedDeclarations: false },
        include: ['*.mts'],
      }),
    );
    execFileSync(process.execPath, [tsc, '-p', dir], { encoding: 'utf8' });
    return '';
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? e);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const source = (type: string, json: string): string =>
  `import type { ${type} } from ${JSON.stringify(join(root, 'packages/core/src/types.ts'))};\n` +
  `export const fixture = (${json}) satisfies ${type};\n`;

const sources = Object.fromEntries(
  Object.entries(FIXTURES).map(([file, type]) => [
    file.replace('.json', '.mts'),
    source(type, readFileSync(join(root, 'fixtures', file), 'utf8')),
  ]),
);
assert.equal(check(sources), '', "every fixture is in the contract's shape");

// The check bites: a value outside a union, and a slot the types don't name, both fail.
const memo = readFileSync(join(root, 'fixtures/memo.findings.json'), 'utf8');
const outside = check({ 'bad.mts': source('Doc', memo.replace('"kind": "span"', '"kind": "spam"')) });
assert.match(outside, /"spam"/);
const unnamed = check({ 'bad.mts': source('Doc', memo.replace('"needs_person"', '"unlisted": 1, "needs_person"')) });
assert.match(unnamed, /unlisted/);

const audienceFixture = JSON.parse(
  readFileSync(join(root, 'packages/kit/test/fixtures/rust-ordinary-audience-variants.fixture'), 'utf8'),
);
const audience = audienceFixture.document.intake.audience_evidence;
const intake = audienceFixture.document.intake;
assert.equal(
  check({ 'audience.mts': source('IntakeAudienceEvidence', JSON.stringify(audience)) }),
  '',
  'every audience claim emitted by the engine fits the kit contract',
);
assert.equal(
  check({
    ...Object.fromEntries(
      intake.candidates.map((row: unknown, index: number) => [
        `candidate-${index}.mts`,
        source('IntakeCandidateReference', JSON.stringify(row)),
      ]),
    ),
    ...Object.fromEntries(
      intake.source_occurrences.map((row: unknown, index: number) => [
        `occurrence-${index}.mts`,
        source('IntakeSourceOccurrence', JSON.stringify(row)),
      ]),
    ),
    ...Object.fromEntries(
      intake.claims.map((row: unknown, index: number) => [
        `claim-${index}.mts`,
        source('IntakeSemanticClaim', JSON.stringify(row)),
      ]),
    ),
    'empty-value.mts': source('IntakeSemanticValue', '{"kind":"known_empty_foreign_receive"}'),
  }),
  '',
  'producer candidates, occurrences and claims fit without adding audience members',
);
assert.notEqual(
  check({ 'bad-occurrence.mts': source('IntakeSemanticValue', '{"kind":"receive","member":"GBR"}') }),
  '',
);
const show = audience.claims.find((claim: { kind: string }) => claim.kind === 'show');
const empty = audience.claims.find((claim: { kind: string }) => claim.kind === 'known_empty_foreign_receive');
const authored = audience.claims.find((claim: { support: string }) => claim.support === 'authored');
const implied = audience.claims.find((claim: { support: string }) => claim.support === 'implied_usa');
assert.ok(show && empty && authored && implied, 'fixture contains each needed audience example');
assert.equal(
  check({
    'eyes.mts': source('IntakeAudienceClaim', JSON.stringify({ ...show, support: 'eyes_receive_implies_show' })),
  }),
  '',
);
for (const invalid of [
  { ...show, member: null },
  { ...empty, member: 'USA' },
  { ...authored, occurrence: null },
  { ...implied, occurrence: 0 },
  { ...show, support: 'future_support' },
  { ...show, kind: 'future_kind' },
]) {
  assert.notEqual(check({ 'bad-audience.mts': source('IntakeAudienceClaim', JSON.stringify(invalid)) }), '');
}
