// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { isSelectedAudienceRecipient } from './selected-audience-vocabulary.ts';

type Coverage = 'complete' | 'partial' | 'unavailable';
type AxisStatus = 'exact' | 'bounded' | 'unavailable' | 'not_applicable' | 'not_requested';
type Participation = 'participating' | 'nonparticipating' | 'unresolved' | 'not_applicable';

export interface AudienceAxis<T> {
  status: AxisStatus;
  participation: Participation;
  value: T | null;
}

export interface SelectedAudienceResult {
  status: Coverage;
  scan: Coverage;
  source: Coverage;
  query: Coverage;
  selected: number;
  selections: number;
  cutoff: boolean;
  foreignReceive: AudienceAxis<string[]>;
  foreignShow: AudienceAxis<string[]>;
  foreignDisplayOnly: AudienceAxis<string[]>;
  impliedUsa: AudienceAxis<boolean>;
}

const coverage = ['complete', 'partial', 'unavailable'] as const;
const axisStatuses = ['exact', 'bounded', 'unavailable', 'not_applicable', 'not_requested'] as const;
const participation = ['participating', 'nonparticipating', 'unresolved', 'not_applicable'] as const;
const phases = ['intake', 'retention', 'query', 'preview', 'confirmation'];
const resources = [
  'input_bytes',
  'input_records',
  'input_members',
  'items',
  'support_edges',
  'work',
  'retained_bytes',
  'output_bytes',
];

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((item) => item === value);
}

function reason(value: unknown): boolean {
  return value === null || (typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value));
}

function axis<T>(value: unknown, accepts: (value: unknown) => value is T): AudienceAxis<T> | null {
  if (
    !record(value, ['status', 'participation', 'value']) ||
    !oneOf(value.status, axisStatuses) ||
    !oneOf(value.participation, participation)
  )
    return null;
  if (value.value !== null && !accepts(value.value)) return null;
  if (value.status === 'exact' && value.value === null) return null;
  if (['unavailable', 'not_applicable', 'not_requested'].includes(value.status) && value.value !== null) return null;
  return { status: value.status, participation: value.participation, value: value.value as T | null };
}

function members(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 512 &&
    value.every((member) => typeof member === 'string' && isSelectedAudienceRecipient(member))
  );
}

function selectedCount(items: unknown[]): number | null {
  let selected = 0;
  for (const item of items) {
    if (
      !record(item, ['status', 'reason']) ||
      !oneOf(item.status, ['selected', 'unavailable']) ||
      !reason(item.reason) ||
      (item.status === 'selected' ? item.reason !== null : item.reason === null)
    )
      return null;
    if (item.status === 'selected') selected++;
  }
  return selected;
}

/** Accept only the bounded, content-free shape of the selected-audience operation. */
export function readSelectedAudience(
  wire: unknown,
  maxBytes: number,
  documents: number,
  selections: number,
): SelectedAudienceResult | null {
  if (typeof wire !== 'string' || wire.length > maxBytes || new TextEncoder().encode(wire).length > maxBytes)
    return null;
  let value: unknown;
  try {
    value = JSON.parse(wire) as unknown;
  } catch {
    return null;
  }
  if (
    !record(value, [
      'status',
      'requested_documents',
      'completed_documents',
      'scan_completeness',
      'source_completeness',
      'query_completeness',
      'refusal',
      'selections',
      'foreign_receive',
      'foreign_show',
      'foreign_display_only',
      'implied_usa',
      'cutoff',
    ]) ||
    !oneOf(value.status, coverage) ||
    !oneOf(value.scan_completeness, coverage) ||
    !oneOf(value.source_completeness, coverage) ||
    !oneOf(value.query_completeness, coverage) ||
    value.requested_documents !== documents ||
    !reason(value.refusal) ||
    !(
      value.completed_documents === null ||
      (Number.isSafeInteger(value.completed_documents) &&
        (value.completed_documents as number) >= 0 &&
        (value.completed_documents as number) <= documents)
    ) ||
    !Array.isArray(value.selections) ||
    value.selections.length !== selections
  )
    return null;
  if (value.scan_completeness === 'complete' && value.completed_documents !== documents) return null;
  if ((value.status === 'unavailable') !== (value.refusal !== null)) return null;
  const selected = selectedCount(value.selections as unknown[]);
  if (selected === null) return null;
  if (selected !== selections && value.refusal === null) return null;
  if (
    value.cutoff !== null &&
    (!record(value.cutoff, ['phase', 'resource']) ||
      !oneOf(value.cutoff.phase, phases) ||
      !oneOf(value.cutoff.resource, resources))
  )
    return null;
  const foreignReceive = axis(value.foreign_receive, members);
  const foreignShow = axis(value.foreign_show, members);
  const foreignDisplayOnly = axis(value.foreign_display_only, members);
  const impliedUsa = axis(value.implied_usa, (item): item is boolean => typeof item === 'boolean');
  if (!foreignReceive || !foreignShow || !foreignDisplayOnly || !impliedUsa) return null;
  if (
    value.status === 'complete' &&
    (value.query_completeness !== 'complete' ||
      selected !== selections ||
      [foreignReceive, foreignShow, foreignDisplayOnly, impliedUsa].some(
        (item) => item.status === 'bounded' || item.status === 'unavailable' || item.participation === 'unresolved',
      ))
  )
    return null;
  return {
    status: value.status,
    scan: value.scan_completeness,
    source: value.source_completeness,
    query: value.query_completeness,
    selected,
    selections,
    cutoff: value.cutoff !== null,
    foreignReceive,
    foreignShow,
    foreignDisplayOnly,
    impliedUsa,
  };
}
