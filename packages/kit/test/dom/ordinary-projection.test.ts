// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { mount } from '../../src/render.ts';
import type { Doc } from '@knitli/marque-kit-core/types';

type RustProjection = { document: Doc['document'] };
const fixture = (name: string): Doc => {
  const value = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')) as RustProjection;
  return { findings: [], document: value.document };
};
const root = (): HTMLDivElement => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 360 });
  document.body.append(element);
  return element;
};

describe('ordinary Rust source projection', () => {
  test('retains Restricted and unresolved foreign ownership without disclosing source tokens', () => {
    const n = root();
    const doc = fixture('rust-ordinary-restricted-owner-unresolved.fixture');
    const mounted = mount(n, { doc, readOnly: true });
    const candidate = mounted.view()?.document.intake?.candidates?.[0];

    expect(candidate?.hypothesis).toEqual({ kind: 'classification', classification: 'r' });
    expect(candidate?.evidence).toContainEqual({
      kind: 'known_lexical_token',
      span: [12, 13],
      polarity: 'supports',
      category: 'classification',
      system: 'fgi',
      level: 'restricted',
    });
    expect(candidate?.evidence).toContainEqual({
      kind: 'unresolved_owner',
      span: [7, 11],
      polarity: 'opposes_well_formedness',
    });
    expect(mounted.view()?.document.intake?.audience_evidence?.claims?.[0]).toMatchObject({
      source_group: 0,
      member: 'USA',
      support: 'implied_usa',
      occurrence: null,
    });

    expect(n.textContent).toContain('FGI classification: Restricted');
    expect(n.textContent).toContain('Foreign ownership unresolved.');
    expect(n.textContent).toContain('Not ready');
    expect(n.textContent).not.toContain('GBR');
    expect(n.textContent).not.toContain('XYZK');
    expect(n.textContent).not.toContain('Ownership complete');
    mounted.destroy();
    n.remove();
  });

  test('shows candidate coverage as partial when projection work cut off the rows', () => {
    const n = root();
    const doc = fixture('rust-ordinary-partial-foreign-projection.fixture');
    const mounted = mount(n, { doc, readOnly: true });
    const intake = mounted.view()?.document.intake;

    expect(intake?.status).toBe('partial');
    expect(intake?.candidate_count).toBe(1501);
    expect(intake?.candidate_count_emitted).toBe(0);
    expect(intake?.projection_cutoff?.resource).toBe('work');
    expect(n.textContent).toContain('Partial source evidence · 0 of 1501 candidates retained');
    expect(n.textContent).toContain('Candidate evidence is incomplete; projection stopped at work.');
    expect(n.textContent).toContain('Not ready');
    expect(n.textContent).not.toContain('GBR');
    expect(n.textContent).not.toContain('XYZK');
    expect(n.textContent).not.toContain('Restricted');
    mounted.destroy();
    n.remove();
  });
});
