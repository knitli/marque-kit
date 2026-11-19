// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Doc } from './types.ts';
import { isParsedNativeSemanticResults } from './native-wire.ts';
import type { NativeSemanticResultsEnvelope } from './native-wire.ts';

export interface NativeSemanticResultsContext {
  documentId: string;
  revisionId: string;
  viewerId: string;
  principalRevision: string;
  /** Opaque current-evaluation token issued by the trusted provider. */
  evaluationId: string;
}
export interface NativeSemanticResultGrantRow {
  meaning: boolean;
  supportKinds: boolean;
  dependencies: boolean;
}
/** Host-authenticated disclosure for one exact viewer/document/principal revision. */
export interface NativeSemanticResultsRequest {
  current: NativeSemanticResultsContext;
  grant: NativeSemanticResultsContext & {
    grantId: string;
    rows: readonly NativeSemanticResultGrantRow[];
    coverage: boolean;
  };
}

/** Runtime guard for a host callback boundary; TypeScript types are not runtime validation. */
export function isNativeSemanticResultsRequest(value: unknown): value is NativeSemanticResultsRequest {
  if (value === null || typeof value !== 'object') return false;
  const request = value as { current?: unknown; grant?: unknown };
  if (
    request.current === null ||
    typeof request.current !== 'object' ||
    request.grant === null ||
    typeof request.grant !== 'object'
  )
    return false;
  const grant = request.grant as { rows?: unknown; coverage?: unknown };
  return Array.isArray(grant.rows) && typeof grant.coverage === 'boolean';
}

const sameContext = (a: NativeSemanticResultsContext, b: NativeSemanticResultsContext): boolean =>
  !!a &&
  !!b &&
  typeof a.documentId === 'string' &&
  a.documentId.length > 0 &&
  a.documentId === b.documentId &&
  typeof a.revisionId === 'string' &&
  a.revisionId.length > 0 &&
  a.revisionId === b.revisionId &&
  typeof a.viewerId === 'string' &&
  a.viewerId.length > 0 &&
  a.viewerId === b.viewerId &&
  typeof a.principalRevision === 'string' &&
  a.principalRevision.length > 0 &&
  a.principalRevision === b.principalRevision &&
  typeof a.evaluationId === 'string' &&
  a.evaluationId.length > 0 &&
  a.evaluationId === b.evaluationId;

/**
 * A result disclosure is accepted only with a fresh host context and a
 * matching host-issued grant. The wire token alone grants no authority.
 */
export function readNativeSemanticResults(
  doc: Doc,
  request: unknown,
  currentPrincipalRevision: string | undefined,
): NativeSemanticResultsEnvelope | null {
  const envelope = doc.document.native_semantic_results;
  if (
    !isParsedNativeSemanticResults(envelope) ||
    !isNativeSemanticResultsRequest(request) ||
    !sameContext(request.current, request.grant) ||
    currentPrincipalRevision !== request.current.principalRevision ||
    typeof request.grant.grantId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(request.grant.grantId) ||
    request.grant.grantId !== envelope.disclosure.grant_id ||
    request.grant.rows.length !== envelope.disclosure.items.length ||
    request.grant.rows.length > 2048 ||
    (request.grant.coverage ? envelope.disclosure.coverage === null : envelope.disclosure.coverage !== null)
  )
    return null;
  for (let index = 0; index < request.grant.rows.length; index++) {
    const permission = request.grant.rows[index];
    const row = envelope.disclosure.items[index];
    if (
      !permission ||
      typeof permission.meaning !== 'boolean' ||
      typeof permission.supportKinds !== 'boolean' ||
      typeof permission.dependencies !== 'boolean' ||
      !row ||
      row.ordinal !== String(index + 1) ||
      (permission.meaning ? row.meaning === null : row.meaning !== null) ||
      (permission.supportKinds ? row.support_kinds === null : row.support_kinds !== null) ||
      (permission.dependencies ? row.dependencies === null : row.dependencies !== null)
    )
      return null;
  }
  return envelope;
}
