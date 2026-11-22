// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

/// <reference types="office-js" />

import { hasUnpairedSurrogate } from '@knitli/marque-kit-core/marking';

/** All spans are half-open UTF-8 byte offsets into the exact Word body text. */
export type CabSpan = [number, number];
export interface WordCabTarget {
  document_id: string;
  revision_id: string;
  contribution_id: string;
  scope_locator: CabSpan;
}
export interface WordCabOwnerGrant {
  ownership: 'exclusive' | 'shared' | 'unknown';
  target: WordCabTarget;
  face_page: number;
}
export type WordCabLabel =
  | 'classified_by'
  | 'derived_by'
  | 'derived_from'
  | 'classification_reason'
  | 'declassify_on'
  | 'agency_office'
  | 'ambiguous_classified'
  | 'ambiguous_derived';
export type WordCabPlacement = 'on_face' | 'off_face' | 'split_page' | 'unknown';
export interface WordCabInspection {
  fields: { label_kind: WordCabLabel; placement: WordCabPlacement; pages: number[]; face_page: number | null }[];
  split_group: boolean;
  incomplete: boolean;
}
export interface WordCabBinding {
  candidate_span: CabSpan;
  label_span: CabSpan;
  value_span: CabSpan;
  target: WordCabTarget;
  /** 1-based physical page, independently selected by the host. */
  face_page: number;
}
export interface WordCabDiscovery {
  bindings: WordCabBinding[];
  labels: WordCabLabel[];
}
export interface WordCabPlacementRequest {
  identity: { source_id: string; revision_id: string; contribution_id: string };
  /** The host's revision for pagination and formatting, including reflow without a text change. */
  layout_revision: string;
  bindings: WordCabBinding[];
}
export interface WordCabObservation {
  candidate_span: CabSpan;
  label_span: CabSpan;
  value_span: CabSpan;
  target: WordCabTarget;
  layout_revision: string;
  /** Empty means the range could not be established; numbers are 1-based physical pages. */
  pages: number[];
}
export interface WordCabReadback {
  status: 'observed' | 'partial' | 'unsupported' | 'stale';
  observations: WordCabObservation[];
}

type Anchor = { paragraph: number; text: string; nth: number; count: number };
type Paragraph = { text: string; start: number; end: number };
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_BYTES = 1_048_576;
const MAX_BINDINGS = 256;
const MAX_PARAGRAPHS = 16_384;
const MAX_MATCHES = 256;
const MAX_PAGES = 512;
const LABELS: WordCabLabel[] = [
  'classified_by',
  'derived_by',
  'derived_from',
  'classification_reason',
  'declassify_on',
  'agency_office',
  'ambiguous_classified',
  'ambiguous_derived',
];
const span = (value: CabSpan, length: number): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isSafeInteger(value[0]) &&
  Number.isSafeInteger(value[1]) &&
  value[0] >= 0 &&
  value[0] < value[1] &&
  value[1] <= length;

/** Bind retained spans only when an independently granted, exclusively owned extent contains the whole candidate. */
export function discoverWordCabBindings(
  wire: string,
  grant: WordCabOwnerGrant,
  textByteLength: number,
): WordCabDiscovery | null {
  if (
    typeof wire !== 'string' ||
    wire.length > MAX_BYTES ||
    encoder.encode(wire).length > MAX_BYTES ||
    !grant ||
    grant.ownership !== 'exclusive' ||
    !grant.target ||
    !span(grant.target.scope_locator, textByteLength) ||
    !Number.isSafeInteger(textByteLength) ||
    textByteLength < 0 ||
    textByteLength > MAX_BYTES ||
    !Number.isSafeInteger(grant.face_page) ||
    grant.face_page < 1 ||
    [grant.target.document_id, grant.target.revision_id, grant.target.contribution_id].some(
      (value) => typeof value !== 'string' || !value || value.length > 256,
    )
  )
    return null;
  try {
    const data: unknown = JSON.parse(wire);
    if (!data || typeof data !== 'object') return null;
    const result = data as Record<string, unknown>;
    if (
      !['partial', 'unavailable'].includes(result.status as string) ||
      !Array.isArray(result.fields) ||
      result.fields.length > MAX_BINDINGS ||
      !Array.isArray(result.groups) ||
      result.groups.length ||
      result.unmatched_bindings !== 0 ||
      result.unmatched_observations !== 0
    )
      return null;
    const seen = new Set<string>();
    const bindings: WordCabBinding[] = [];
    const labels: WordCabLabel[] = [];
    for (const field of result.fields) {
      if (!field || typeof field !== 'object') return null;
      const row = field as Record<string, unknown>;
      const candidate = row.candidate_span as CabSpan,
        label = row.label_span as CabSpan,
        value = row.value_span as CabSpan;
      if (
        row.binding_index !== null ||
        row.placement !== 'unknown' ||
        row.reason !== 'unbound' ||
        !LABELS.includes(row.label_kind as WordCabLabel) ||
        !span(candidate, textByteLength) ||
        !span(label, textByteLength) ||
        !Array.isArray(value) ||
        value.length !== 2 ||
        !Number.isSafeInteger(value[0]) ||
        !Number.isSafeInteger(value[1]) ||
        value[0] < 0 ||
        value[0] > value[1] ||
        value[1] > textByteLength ||
        candidate[0] > label[0] ||
        label[1] > value[0] ||
        value[1] > candidate[1]
      )
        return null;
      const key = JSON.stringify([candidate, label, value]);
      if (seen.has(key)) return null;
      seen.add(key);
      if (candidate[0] < grant.target.scope_locator[0] || candidate[1] > grant.target.scope_locator[1]) continue;
      bindings.push({
        candidate_span: [...candidate],
        label_span: [...label],
        value_span: [...value],
        target: {
          document_id: grant.target.document_id,
          revision_id: grant.target.revision_id,
          contribution_id: grant.target.contribution_id,
          scope_locator: [...grant.target.scope_locator],
        },
        face_page: grant.face_page,
      });
      labels.push(row.label_kind as WordCabLabel);
    }
    return { bindings, labels };
  } catch {
    return null;
  }
}

/** Searchable beginning and ending anchors prove the whole field, including long or multi-paragraph fields. */
function anchors(paragraphs: Paragraph[], bytes: Uint8Array, binding: WordCabBinding): [Anchor, Anchor] | null {
  const { candidate_span: candidate, label_span: label, value_span: value, target } = binding;
  if (
    !target ||
    !span(candidate, bytes.length) ||
    !span(label, bytes.length) ||
    !span(value, bytes.length) ||
    !span(target.scope_locator, bytes.length) ||
    candidate[0] > label[0] ||
    label[1] > value[0] ||
    value[1] > candidate[1] ||
    target.scope_locator[0] > label[0] ||
    value[1] > target.scope_locator[1]
  )
    return null;
  const paragraphAt = (position: number): number => {
    let low = 0,
      high = paragraphs.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const paragraph = paragraphs[middle]!;
      if (position < paragraph.start) high = middle - 1;
      else if (position >= paragraph.end) low = middle + 1;
      else return middle;
    }
    return -1;
  };
  const first = paragraphAt(label[0]);
  const last = paragraphAt(value[1] - 1);
  if (first < 0 || last < first) return null;
  try {
    const firstEnd = Math.min(value[1], paragraphs[first]!.end);
    const lastStart = Math.max(label[0], paragraphs[last]!.start);
    const startText = Array.from(decoder.decode(bytes.subarray(label[0], firstEnd)))
      .slice(0, 80)
      .join('');
    const endText = Array.from(decoder.decode(bytes.subarray(lastStart, value[1])))
      .slice(-80)
      .join('');
    if (!startText || !endText) return null;
    const anchor = (index: number, atByte: number, text: string): Anchor | null => {
      const paragraph = paragraphs[index]!;
      const atChar = decoder.decode(bytes.subarray(paragraph.start, atByte)).length;
      let count = 0,
        nth = 0;
      for (let at = paragraph.text.indexOf(text); at !== -1; at = paragraph.text.indexOf(text, at + 1)) {
        if (at < atChar) nth++;
        if (++count > MAX_MATCHES) return null;
      }
      if (paragraph.text.slice(atChar, atChar + text.length) !== text) return null;
      return { paragraph: index, text, nth, count };
    };
    const start = anchor(first, label[0], startText);
    const end = anchor(last, value[1] - encoder.encode(endText).length, endText);
    return start && end ? [start, end] : null;
  } catch {
    return null;
  }
}

/**
 * Read physical pages only. The caller must independently bind the active document, source revision,
 * owner scope and layout revision, and recheck them around this read; this is not authority or readiness.
 */
export async function readWordCabPlacement(text: string, request: WordCabPlacementRequest): Promise<WordCabReadback> {
  try {
    if (typeof Office === 'undefined' || !Office.context.requirements.isSetSupported('WordApiDesktop', '1.2'))
      return { status: 'unsupported', observations: [] };
  } catch {
    return { status: 'unsupported', observations: [] };
  }
  const validPair = (value: CabSpan): boolean =>
    Array.isArray(value) && value.length === 2 && value.every((n) => Number.isSafeInteger(n) && n >= 0);
  if (
    typeof text !== 'string' ||
    text.length > MAX_BYTES ||
    hasUnpairedSurrogate(text) ||
    encoder.encode(text).length > MAX_BYTES ||
    !request ||
    !Array.isArray(request.bindings) ||
    request.bindings.length > MAX_BINDINGS ||
    typeof request.layout_revision !== 'string' ||
    !request.layout_revision ||
    request.layout_revision.length > 256 ||
    !request.identity ||
    [request.identity.source_id, request.identity.revision_id, request.identity.contribution_id].some(
      (value) => typeof value !== 'string' || !value || value.length > 256,
    ) ||
    request.bindings.some(
      (binding) =>
        !binding ||
        !binding.target ||
        !validPair(binding.candidate_span) ||
        !validPair(binding.label_span) ||
        !validPair(binding.value_span) ||
        !validPair(binding.target.scope_locator) ||
        [binding.target.document_id, binding.target.revision_id, binding.target.contribution_id].some(
          (value) => typeof value !== 'string' || !value || value.length > 256,
        ) ||
        !Number.isSafeInteger(binding.face_page) ||
        binding.face_page < 1,
    )
  )
    return { status: 'partial', observations: [] };
  const observations = request.bindings.map(({ candidate_span, label_span, value_span, target }) => ({
    candidate_span: [...candidate_span] as CabSpan,
    label_span: [...label_span] as CabSpan,
    value_span: [...value_span] as CabSpan,
    target: {
      document_id: target.document_id,
      revision_id: target.revision_id,
      contribution_id: target.contribution_id,
      scope_locator: [...target.scope_locator] as CabSpan,
    },
    layout_revision: request.layout_revision,
    pages: [] as number[],
  }));
  try {
    return await Word.run(async (ctx) => {
      const paragraphs = ctx.document.body.paragraphs.load({ select: 'text', top: MAX_PARAGRAPHS + 1 });
      await ctx.sync();
      if (paragraphs.items.length > MAX_PARAGRAPHS) return { status: 'partial', observations: [] };
      const texts = paragraphs.items.map((paragraph) => paragraph.text);
      if (texts.join('\n') !== text) return { status: 'stale', observations: [] };
      const bytes = encoder.encode(text);
      let offset = 0;
      const indexed = texts.map((paragraph) => {
        const item = { text: paragraph, start: offset, end: offset + encoder.encode(paragraph).length };
        offset = item.end + 1;
        return item;
      });
      const searches = request.bindings.map((binding) => {
        if (
          binding.target?.document_id !== request.identity.source_id ||
          binding.target?.revision_id !== request.identity.revision_id ||
          binding.target?.contribution_id !== request.identity.contribution_id
        )
          return null;
        const pair = anchors(indexed, bytes, binding);
        if (!pair) return null;
        const collections = pair.map((anchor) =>
          paragraphs.items[anchor.paragraph]!.search(anchor.text, { matchCase: true }).load({
            select: 'text',
            top: MAX_MATCHES + 1,
          }),
        );
        return { pair, collections };
      });
      await ctx.sync();
      const selected = searches.map((search) => {
        if (!search) return null;
        const ranges = search.collections.map((collection, index) => {
          const anchor = search.pair[index]!;
          if (collection.items.length !== anchor.count || collection.items.some((item) => item.text !== anchor.text))
            return null;
          return collection.items[anchor.nth] ?? null;
        });
        if (!ranges[0] || !ranges[1]) return null;
        const order = search.collections.flatMap((collection) =>
          collection.items.slice(1).map((item, index) => collection.items[index]!.compareLocationWith(item)),
        );
        return { ranges, order };
      });
      await ctx.sync();
      const ranges = selected.map((selection) => {
        if (!selection || selection.order.some((order) => !['Before', 'AdjacentBefore'].includes(order.value)))
          return null;
        const range = selection.ranges[0]!.expandTo(selection.ranges[1]!).load('text');
        return { range, pages: range.pages.load({ select: 'index', top: MAX_PAGES + 1 }) };
      });
      await ctx.sync();
      for (const [index, range] of ranges.entries()) {
        if (!range) continue;
        const binding = request.bindings[index]!;
        const expected = decoder.decode(bytes.subarray(binding.label_span[0], binding.value_span[1]));
        if (range.range.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n') !== expected) continue;
        if (!range.pages.items.length || range.pages.items.length > MAX_PAGES) continue;
        const numbers = range.pages.items.map((page) => page.index);
        if (numbers.every((number) => Number.isSafeInteger(number) && number > 0))
          observations[index]!.pages = [...new Set(numbers)].sort((a, b) => a - b);
      }
      paragraphs.load({ select: 'text', top: MAX_PARAGRAPHS + 1 });
      await ctx.sync();
      if (paragraphs.items.map((paragraph) => paragraph.text).join('\n') !== text)
        return { status: 'stale', observations: [] };
      return { status: observations.every((item) => item.pages.length) ? 'observed' : 'partial', observations };
    });
  } catch {
    return { status: 'partial', observations: observations.map((item) => ({ ...item, pages: [] })) };
  }
}

/** Accept only engine placement claims that agree with the independently observed pages. */
export function readWordCabInspection(
  wire: string,
  request: WordCabPlacementRequest,
  observations: WordCabObservation[],
  labels: WordCabLabel[],
): WordCabInspection | null {
  if (typeof wire !== 'string' || wire.length > MAX_BYTES || encoder.encode(wire).length > MAX_BYTES) return null;
  try {
    const result: unknown = JSON.parse(wire);
    if (!result || typeof result !== 'object') return null;
    const data = result as Record<string, unknown>;
    if (
      !['complete', 'partial', 'unavailable'].includes(data.status as string) ||
      !Array.isArray(data.fields) ||
      !Array.isArray(data.groups) ||
      data.fields.length > MAX_BINDINGS ||
      data.groups.length > MAX_BINDINGS ||
      observations.length !== request.bindings.length ||
      labels.length !== request.bindings.length ||
      labels.some((label) => !LABELS.includes(label))
    )
      return null;
    const used = new Set<number>();
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const details: WordCabInspection['fields'] = [];
    let splitGroup = false;
    let incompleteGroup = false;
    const fields = data.fields.map((field: unknown) => {
      if (!field || typeof field !== 'object') throw Error();
      const row = field as Record<string, unknown>;
      const value = row.placement as WordCabPlacement;
      const label = row.label_kind as WordCabLabel;
      if (!LABELS.includes(label) || !['on_face', 'off_face', 'split_page', 'unknown'].includes(value)) throw Error();
      if (row.binding_index === null) {
        if (value !== 'unknown') throw Error();
        details.push({ label_kind: label, placement: value, pages: [], face_page: null });
        return { row, pages: [] as number[], binding: null };
      }
      if (
        !Number.isSafeInteger(row.binding_index) ||
        (row.binding_index as number) < 0 ||
        (row.binding_index as number) >= request.bindings.length ||
        used.has(row.binding_index as number)
      )
        throw Error();
      const index = row.binding_index as number;
      used.add(index);
      const binding = request.bindings[index]!;
      const observed = observations[index]!;
      if (
        label !== labels[index] ||
        !same(row.candidate_span, binding.candidate_span) ||
        !same(row.label_span, binding.label_span) ||
        !same(row.value_span, binding.value_span) ||
        !same(observed.candidate_span, binding.candidate_span) ||
        !same(observed.label_span, binding.label_span) ||
        !same(observed.value_span, binding.value_span) ||
        !same(observed.target, binding.target) ||
        observed.layout_revision !== request.layout_revision
      )
        throw Error();
      const pages = observed.pages;
      if (
        !Array.isArray(pages) ||
        pages.length > MAX_PAGES ||
        pages.some((page, i) => !Number.isSafeInteger(page) || page < 1 || (i > 0 && page <= pages[i - 1]!))
      )
        throw Error();
      const expected: WordCabPlacement = !pages.length
        ? 'unknown'
        : pages.length > 1
          ? 'split_page'
          : pages[0] === binding.face_page
            ? 'on_face'
            : 'off_face';
      if (value !== 'unknown' && value !== expected) throw Error();
      details.push({
        label_kind: label,
        placement: value,
        pages: value === 'unknown' ? [] : [...pages],
        face_page: binding.face_page,
      });
      return { row, pages: value === 'unknown' ? [] : pages, binding };
    });
    const expectedGroups = new Map<string, number[]>();
    for (const [index, field] of fields.entries()) {
      if (!field.binding) continue;
      const key = JSON.stringify([field.row.candidate_span, field.binding.target]);
      const members = expectedGroups.get(key) ?? [];
      members.push(index);
      expectedGroups.set(key, members);
    }
    const grouped = new Set<number>();
    const seenGroups = new Set<string>();
    for (const item of data.groups) {
      if (!item || typeof item !== 'object') throw Error();
      const group = item as Record<string, unknown>;
      if (
        !Array.isArray(group.field_indices) ||
        !group.field_indices.length ||
        group.field_indices.length > fields.length ||
        !Number.isSafeInteger(group.target_binding_index) ||
        (group.target_binding_index as number) < 0 ||
        (group.target_binding_index as number) >= request.bindings.length ||
        typeof group.complete !== 'boolean'
      )
        throw Error();
      const binding = request.bindings[group.target_binding_index as number]!;
      if (group.face_page !== binding.face_page || !same(group.candidate_span, binding.candidate_span)) throw Error();
      const key = JSON.stringify([group.candidate_span, binding.target]);
      const members = expectedGroups.get(key);
      const indices = group.field_indices;
      if (
        !members ||
        seenGroups.has(key) ||
        members.some((index) => !indices.includes(index)) ||
        !indices.some((index) => fields[index]?.row.binding_index === group.target_binding_index)
      )
        throw Error();
      seenGroups.add(key);
      const pages = new Set<number>();
      let unknown = false;
      for (const fieldIndex of group.field_indices) {
        if (
          !Number.isSafeInteger(fieldIndex) ||
          fieldIndex < 0 ||
          fieldIndex >= fields.length ||
          grouped.has(fieldIndex)
        )
          throw Error();
        grouped.add(fieldIndex);
        const field = fields[fieldIndex]!;
        if (
          !same(field.row.candidate_span, group.candidate_span) ||
          (field.binding &&
            (!same(field.binding.target, binding.target) || field.binding.face_page !== binding.face_page))
        )
          throw Error();
        if (!field.pages.length) unknown = true;
        for (const page of field.pages) pages.add(page);
      }
      const expected: WordCabPlacement =
        pages.size > 1
          ? 'split_page'
          : unknown || !pages.size
            ? 'unknown'
            : pages.has(binding.face_page)
              ? 'on_face'
              : 'off_face';
      if (group.placement !== 'unknown' && group.placement !== expected) throw Error();
      if (group.complete && unknown) throw Error();
      if (group.placement === 'split_page') splitGroup = true;
      if (!group.complete || group.placement === 'unknown') incompleteGroup = true;
    }
    if (
      data.status === 'complete' &&
      (grouped.size !== fields.length ||
        used.size !== request.bindings.length ||
        seenGroups.size !== expectedGroups.size ||
        incompleteGroup ||
        data.unmatched_bindings !== 0 ||
        data.unmatched_observations !== 0)
    )
      return null;
    return {
      fields: details,
      split_group: splitGroup,
      incomplete:
        grouped.size !== fields.length ||
        used.size !== request.bindings.length ||
        data.status !== 'complete' ||
        incompleteGroup ||
        !details.length ||
        details.some((field) => field.placement === 'unknown'),
    };
  } catch {
    return null;
  }
}
