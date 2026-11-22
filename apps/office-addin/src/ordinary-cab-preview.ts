// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { canon } from '@knitli/marque-kit-core/state';
import type { NativeEvaluationV2, NativeField } from '@knitli/marque-kit-core/native-wire';

const fields: readonly NativeField[] = [
  'classified_by',
  'agency_and_office_of_origin',
  'classification_reason',
  'derived_from',
  'declassify_on',
];
type Question = { chain?: unknown; serial?: unknown; revision?: unknown; field?: unknown };
const key = (q: Question) => JSON.stringify([q.chain, q.serial, q.revision, q.field]);

/** Only the current base may issue handles used by the separately granted group. */
export function issuedAnswers(base: NativeEvaluationV2, answers: unknown): answers is { question: Question }[] {
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 16) return false;
  const issued = new Set(
    base.findings.items.flatMap((finding) => {
      const q = finding.question;
      return q &&
        finding.requirement.status === 'resolved' &&
        base.requirements[Number(finding.requirement.index)]?.field === q.field
        ? [key(q)]
        : [];
    }),
  );
  return answers.every((a: unknown) => {
    if (!a || typeof a !== 'object' || !('question' in a) || !a.question || typeof a.question !== 'object')
      return false;
    return issued.delete(key(a.question));
  });
}

/** Only bounded, exact accepted-question projections can reach the display. */
export function projectedRows(
  value: unknown,
  answers: { question: Question }[],
  target: unknown,
  chain: string,
): { field: NativeField; satisfaction: string }[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as {
    schema?: unknown;
    version?: unknown;
    status?: unknown;
    reason?: unknown;
    cutoff?: unknown;
    accepted_questions?: unknown;
    hypothetical_fields?: unknown;
  };
  if (
    p.schema !== 'knitli.native-cab-joint-preview.v1' ||
    p.version !== 1 ||
    p.status !== 'complete' ||
    p.reason !== null ||
    p.cutoff !== null ||
    !Array.isArray(p.accepted_questions) ||
    !Array.isArray(p.hypothetical_fields) ||
    p.accepted_questions.length !== answers.length ||
    p.hypothetical_fields.length > fields.length
  )
    return null;
  const expected = new Set<string>();
  const acceptedFields = new Set<NativeField>();
  for (const { question: q } of answers) {
    if (
      q.chain !== chain ||
      typeof q.serial !== 'string' ||
      typeof q.revision !== 'string' ||
      !fields.includes(q.field as NativeField) ||
      expected.has(key(q))
    )
      return null;
    expected.add(key(q));
    acceptedFields.add(q.field as NativeField);
  }
  for (const item of p.accepted_questions) {
    if (!item || typeof item !== 'object') return null;
    const row = item as {
      question_chain?: unknown;
      question_serial?: unknown;
      question_revision?: unknown;
      field?: unknown;
      target?: unknown;
    };
    if (
      canon(row.target) !== canon(target) ||
      !expected.delete(
        key({
          chain: row.question_chain,
          serial: row.question_serial,
          revision: row.question_revision,
          field: row.field,
        }),
      )
    )
      return null;
  }
  if (expected.size) return null;
  const seen = new Set<NativeField>();
  const result: { field: NativeField; satisfaction: string }[] = [];
  for (const item of p.hypothetical_fields) {
    if (!item || typeof item !== 'object') return null;
    const row = item as { field?: NativeField; applicability?: unknown; coverage?: unknown; satisfaction?: unknown };
    if (
      !row.field ||
      !fields.includes(row.field) ||
      !acceptedFields.has(row.field) ||
      seen.has(row.field) ||
      !['required', 'conditional_unresolved'].includes(String(row.applicability)) ||
      !['present', 'no_evidence', 'unavailable', 'partial', 'examined_absent', 'unknown', 'unexamined'].includes(
        String(row.coverage),
      ) ||
      !['satisfied', 'missing', 'unverified', 'not_applicable'].includes(String(row.satisfaction))
    )
      return null;
    seen.add(row.field);
    result.push({ field: row.field, satisfaction: String(row.satisfaction) });
  }
  return seen.size === acceptedFields.size ? result : null;
}

/** Parse bounded executor output without treating it as authority. */
export async function executePreview(
  operation: (this: void, request: string) => Promise<string>,
  request: unknown,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const encoder = new TextEncoder();
  const input = JSON.stringify(request);
  if (encoder.encode(input).length > Math.min(maxBytes, 1_048_576)) throw new Error();
  const output = await operation(input);
  if (typeof output !== 'string' || encoder.encode(output).length > Math.min(maxBytes, 1_048_576)) throw new Error();
  const value: unknown = JSON.parse(output);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

/** Bind each response to independently qualified commitments and the same base. */
export function preparedPreview(response: Record<string, unknown>, expectedReceipt: string): boolean {
  return (
    response.schema === 'marque.ordinary-cab-preview.v1' &&
    response.status === 'available' &&
    response.reason === null &&
    response.preview_receipt === expectedReceipt
  );
}

export function appliedPreview(
  response: Record<string, unknown>,
  prepared: Record<string, unknown>,
  expectedFingerprint: string,
): boolean {
  return (
    preparedPreview(response, String(prepared.preview_receipt)) &&
    response.preview_fingerprint === expectedFingerprint &&
    JSON.stringify(response.snapshot) === JSON.stringify(prepared.snapshot)
  );
}
