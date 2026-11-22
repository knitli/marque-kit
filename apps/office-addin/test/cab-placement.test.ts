// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverWordCabBindings, readWordCabInspection, readWordCabPlacement } from '../src/cab-placement.ts';
import type { CabSpan, WordCabBinding, WordCabPlacementRequest } from '../src/cab-placement.ts';

const byte = (text: string): number => new TextEncoder().encode(text).length;
function request(text: string, fields: [number, number, number, number][]): WordCabPlacementRequest {
  const at = (start: number, end: number): CabSpan => [byte(text.slice(0, start)), byte(text.slice(0, end))];
  const target = {
    document_id: 'doc',
    revision_id: 'r1',
    contribution_id: 'body',
    scope_locator: [0, byte(text)] as CabSpan,
  };
  return {
    identity: { source_id: 'doc', revision_id: 'r1', contribution_id: 'body' },
    layout_revision: 'L1',
    bindings: fields.map(([a, b, c, d]): WordCabBinding => ({
      candidate_span: at(a, d),
      label_span: at(a, b),
      value_span: at(c, d),
      target,
      face_page: 1,
    })),
  };
}

type FakeOptions = { unsupported?: boolean; reverse?: boolean; changedAt?: number; failAt?: number; noPages?: boolean };
function word(initial: string, pageBreaks: number[], options: FakeOptions = {}): void {
  let text = initial;
  let syncs = 0;
  class Range {
    readonly start: number;
    readonly end: number;
    constructor(start: number, end: number) {
      this.start = start;
      this.end = end;
    }
    get text(): string {
      return text.slice(this.start, this.end);
    }
    load(): this {
      return this;
    }
    compareLocationWith(other: Range): { value: string } {
      return { value: this.end === other.start ? 'AdjacentBefore' : this.end < other.start ? 'Before' : 'After' };
    }
    expandTo(other: Range): Range {
      return new Range(Math.min(this.start, other.start), Math.max(this.end, other.end));
    }
    get pages(): { items: { index: number }[]; load(): unknown } {
      const first = 1 + pageBreaks.filter((at) => at <= this.start).length;
      const last = 1 + pageBreaks.filter((at) => at < this.end).length;
      const items = options.noPages ? [] : Array.from({ length: last - first + 1 }, (_, i) => ({ index: first + i }));
      return {
        items,
        load() {
          return this;
        },
      };
    }
  }
  const paragraphs = {
    get items() {
      let offset = 0;
      return text.split('\n').map((part) => {
        const start = offset;
        offset += part.length + 1;
        return {
          text: part,
          search(needle: string) {
            const items: Range[] = [];
            for (let at = part.indexOf(needle); at !== -1; at = part.indexOf(needle, at + needle.length))
              items.push(new Range(start + at, start + at + needle.length));
            if (options.reverse) items.reverse();
            return {
              items,
              load() {
                return this;
              },
            };
          },
        };
      });
    },
    load() {
      return this;
    },
  };
  const context = {
    document: { body: { paragraphs } },
    async sync() {
      syncs++;
      if (syncs === options.changedAt) text += ' changed';
      if (syncs === options.failAt) throw Error('Word failed');
    },
  };
  Object.assign(globalThis, {
    Office: { context: { requirements: { isSetSupported: () => !options.unsupported } } },
    Word: { run: async (fn: (ctx: typeof context) => unknown) => fn(context) },
  });
}

void test('reads exact duplicate UTF-8 fields separately and observes layout changes without text edits', async () => {
  const text = 'α Classified By: Adam | Classified By: Adam';
  const first = text.indexOf('Classified');
  const second = text.lastIndexOf('Classified');
  const field = (start: number): [number, number, number, number] => [start, start + 13, start + 15, start + 19];
  const req = request(text, [field(first), field(second)]);
  word(text, [second]);
  const result = await readWordCabPlacement(text, req);
  assert.equal(result.status, 'observed');
  assert.deepEqual(
    result.observations.map((row) => row.pages),
    [[1], [2]],
  );
  assert.deepEqual(
    result.observations.map((row) => row.candidate_span),
    req.bindings.map((row) => row.candidate_span),
  );
  assert.ok(!JSON.stringify(result).includes('Adam'));
  word(text, [first + 10, second]);
  const afterReflow = await readWordCabPlacement(text, { ...req, layout_revision: 'L2' });
  assert.deepEqual(
    afterReflow.observations.map((row) => row.pages),
    [[1, 2], [3]],
  );
  assert.ok(afterReflow.observations.every((row) => row.layout_revision === 'L2'));
});

void test('a field spanning paragraphs uses its complete extent', async () => {
  const text = 'Classified By:\nAdam';
  const req = request(text, [[0, 13, 15, 19]]);
  word(text, [15]);
  const result = await readWordCabPlacement(text, req);
  assert.equal(result.status, 'observed');
  assert.deepEqual(result.observations[0]?.pages, [1, 2]);
});

void test('unavailable, stale, ambiguous and failed reads cannot supply page evidence', async () => {
  const text = 'Classified By: Adam | Classified By: Adam';
  const field: [number, number, number, number] = [0, 13, 15, 19];
  const req = request(text, [field]);
  word(text, [], { unsupported: true });
  assert.equal((await readWordCabPlacement(text, req)).status, 'unsupported');
  word(`${text}!`, []);
  assert.deepEqual(await readWordCabPlacement(text, req), { status: 'stale', observations: [] });
  word(text, [], { changedAt: 5 });
  assert.deepEqual(await readWordCabPlacement(text, req), { status: 'stale', observations: [] });
  for (const options of [{ reverse: true }, { noPages: true }, { failAt: 5 }]) {
    word(text, [], options);
    const result = await readWordCabPlacement(text, req);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.observations[0]?.pages, []);
  }
  word(text, []);
  const foreign = structuredClone(req);
  foreign.bindings[0]!.target.document_id = 'another-document';
  const result = await readWordCabPlacement(text, foreign);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.observations[0]?.pages, []);
});

void test('empty values and bounded-out evidence remain unknown', async () => {
  const text = 'Classified By: Adam';
  const req = request(text, [[0, 13, 15, 19]]);
  const empty = structuredClone(req);
  empty.bindings[0]!.value_span = [15, 15];
  word(text, []);
  assert.deepEqual((await readWordCabPlacement(text, empty)).observations[0]?.pages, []);
  word(
    text,
    Array.from({ length: 512 }, () => 8),
  );
  assert.deepEqual((await readWordCabPlacement(text, req)).observations[0]?.pages, []);
  const many = { ...req, bindings: Array.from({ length: 257 }, () => req.bindings[0]!) };
  assert.deepEqual(await readWordCabPlacement(text, many), { status: 'partial', observations: [] });
});

void test('complete inspection cannot omit or split the group containing fields on pages 1, 1 and 2', () => {
  const text = 'a: x\nb: y\nc: z';
  const req = request(text, [
    [0, 1, 3, 4],
    [5, 6, 8, 9],
    [10, 11, 13, 14],
  ]);
  for (const binding of req.bindings) binding.candidate_span = [0, byte(text)];
  const observations = req.bindings.map((binding, index) => ({
    candidate_span: binding.candidate_span,
    label_span: binding.label_span,
    value_span: binding.value_span,
    target: binding.target,
    layout_revision: req.layout_revision,
    pages: [index === 2 ? 2 : 1],
  }));
  const fields = req.bindings.map((binding, index) => ({
    candidate_span: binding.candidate_span,
    label_span: binding.label_span,
    value_span: binding.value_span,
    label_kind: 'classified_by',
    binding_index: index,
    placement: index === 2 ? 'off_face' : 'on_face',
    reason: null,
  }));
  const labels = req.bindings.map(() => 'classified_by' as const);
  const group = {
    field_indices: [0, 1, 2],
    target_binding_index: 0,
    candidate_span: [0, byte(text)],
    face_page: 1,
    placement: 'split_page',
    complete: true,
  };
  const report = { status: 'complete', fields, groups: [group], unmatched_bindings: 0, unmatched_observations: 0 };
  assert.equal(readWordCabInspection(JSON.stringify(report), req, observations, labels)?.split_group, true);
  assert.equal(readWordCabInspection(JSON.stringify({ ...report, groups: [] }), req, observations, labels), null);
  const swapped = structuredClone(report);
  swapped.fields[0]!.label_kind = 'derived_from';
  assert.equal(readWordCabInspection(JSON.stringify(swapped), req, observations, labels), null);
  assert.equal(
    readWordCabInspection(
      JSON.stringify({ ...report, groups: [{ ...group, complete: false, placement: 'unknown' }] }),
      req,
      observations,
      labels,
    ),
    null,
  );
  assert.equal(
    readWordCabInspection(
      JSON.stringify({
        ...report,
        groups: fields.map((_, index) => ({
          ...group,
          field_indices: [index],
          target_binding_index: index,
          placement: index === 2 ? 'off_face' : 'on_face',
        })),
      }),
      req,
      observations,
      labels,
    ),
    null,
  );
  assert.equal(
    readWordCabInspection(
      JSON.stringify({ ...report, groups: [{ ...group, target_binding_index: 3 }] }),
      req,
      observations,
      labels,
    ),
    null,
  );
});

void test('only a fully contained candidate is automatically bound to an exclusive owner grant', () => {
  const text = 'Classified By: Adam';
  const req = request(text, [[0, 13, 15, 19]]);
  const binding = req.bindings[0]!;
  const grant = { ownership: 'exclusive' as const, target: binding.target, face_page: 1 };
  const row = {
    candidate_span: binding.candidate_span,
    label_span: binding.label_span,
    value_span: binding.value_span,
    label_kind: 'classified_by',
    binding_index: null,
    placement: 'unknown',
    reason: 'unbound',
  };
  const result = { status: 'partial', fields: [row], groups: [], unmatched_bindings: 0, unmatched_observations: 0 };
  assert.deepEqual(discoverWordCabBindings(JSON.stringify(result), grant, byte(text)), {
    bindings: [binding],
    labels: ['classified_by'],
  });
  assert.deepEqual(
    discoverWordCabBindings(
      JSON.stringify(result),
      { ...grant, target: { ...grant.target, scope_locator: [0, 13] } },
      byte(text),
    ),
    { bindings: [], labels: [] },
  );
  assert.equal(discoverWordCabBindings(JSON.stringify(result), { ...grant, ownership: 'shared' }, byte(text)), null);
  assert.equal(discoverWordCabBindings(JSON.stringify({ ...result, fields: [row, row] }), grant, byte(text)), null);
});
