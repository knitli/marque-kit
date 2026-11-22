// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ActAppendRequest,
  AppendActResult,
  Doc,
  EvaluationBasis,
  LogEntry,
  State,
  Vocab,
} from '@knitli/marque-kit-core/types';

/** Host operations must target this exact active document and remain idempotent by requestId. */
export interface OfficeWordHost {
  activeDocumentId(): Promise<string | null>;
  /** Must bind the write to entry.binding and revalidate target/destination before touching Word. */
  applyCommitted(entry: LogEntry, documentId: string): Promise<OfficeWriteAck>;
  jump?(subjectId: string, documentId: string): Promise<void>;
}

export interface OfficeWriteAck {
  requestId: string;
  documentId: string;
  basis: EvaluationBasis;
  acknowledgement: string;
}

export interface OfficeCurrentEvaluation {
  documentId: string;
  chain: string;
  doc: Doc;
  basis: EvaluationBasis;
  requiredWrites: string[];
  requiredAcceptanceChecks: string[];
  confirmedWrites: string[];
  acceptanceChecks: Record<string, string>;
  confirmedWriteAcks: Record<string, string>;
}

/** One provider-issued document scope. Never use a session with another document or provider. */
export interface OfficeWordSession {
  readonly documentId: string;
  readonly chain: string;
  readonly doc: Doc;
  readonly vocab: Vocab;
  /** On open, pendingAppends must include every durably staged or refused intent for this document and chain. */
  readonly state: State;
  readonly basis: EvaluationBasis;
  readonly requiredWrites: string[];
  readonly requiredAcceptanceChecks: string[];
  readonly confirmedWrites: string[];
  readonly acceptanceChecks: Record<string, string>;
  append(request: ActAppendRequest): Promise<AppendActResult>;
  /** Persist the exact intent before any append attempt whose acknowledgement can be lost. */
  stageAppend(request: ActAppendRequest): Promise<void>;
  /** Ascending sequence; includes acked writes awaiting evaluation until that obligation is closed durably. */
  pendingWrites(): Promise<LogEntry[]>;
  /** Applies and durably acknowledges one outstanding write, or returns its persisted acknowledgement on replay. */
  applyCommitted(requestId: string, host: OfficeWordHost): Promise<OfficeWriteAck>;
  /** Must return a fresh authoritative snapshot, durably close the evaluation obligation, and replay safely. */
  evaluateCurrent(host: OfficeWordHost): Promise<OfficeCurrentEvaluation>;
}

/** Installed by a trusted host integration; no default network or browser-storage implementation exists. */
export interface OfficeWorkspaceProvider {
  openWord(host: OfficeWordHost): Promise<OfficeWordSession | null>;
}

declare global {
  interface Window {
    marqueOfficeWorkspace?: {
      provider: OfficeWorkspaceProvider;
      wordHost: OfficeWordHost;
    };
  }
}

export const isSameWordDocument = async (host: OfficeWordHost, session: OfficeWordSession): Promise<boolean> =>
  (await host.activeDocumentId()) === session.documentId;
