// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { OfficeSourceMarkingInstallation } from './source-marking.ts';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
import type { NativeSemanticResultsRequest } from '@knitli/marque-kit-core/native-results';
import type {
  ActAppendRequest,
  AppendActResult,
  Doc,
  EvaluationBasis,
  HistoryDisclosure,
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
  /** The installation guarantees notification for any change to document revision, disclosure, session, or provider before further results may be shown. */
  watchNativeCabInvalidation?(documentId: string, chain: string, invalidate: () => void): () => void;
  /** Fires before semantic result disclosure, viewer, document, or provider changes can be shown. */
  watchNativeSemanticResultsInvalidation?(documentId: string, viewerId: string, invalidate: () => void): () => void;
  /** Independently obtain the current request, grant token and row permissions for this viewer. */
  readNativeSemanticResultsRequest?(documentId: string, viewerId: string): Promise<NativeSemanticResultsRequest | null>;
  /** Independently obtain the current authorized target, profile and evaluation basis. */
  readNativeCabScope?(
    documentId: string,
    chain: string,
  ): Promise<Omit<NativeCabRequest, 'maxBasisBytes' | 'expectedChain'> | null>;
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
  currentDisclosureRevision?: string;
  historyDisclosure?: HistoryDisclosure;
  requiredWrites: string[];
  requiredAcceptanceChecks: string[];
  confirmedWrites: string[];
  acceptanceChecks: Record<string, string>;
  confirmedWriteAcks: Record<string, string>;
}

/** Native wire text and independently issued scope, without a legacy document. */
export interface OfficeNativeCabSnapshot {
  documentId: string;
  chain: string;
  wire: string;
  /** Legacy provider claim; ignored for currentness. The installation supplies scope independently. */
  request?: Omit<NativeCabRequest, 'maxBasisBytes'>;
}
export interface OfficeNativeWordSession {
  readonly kind: 'native_cab';
  readonly documentId: string;
  readonly chain: string;
  readonly nativeCab: OfficeNativeCabSnapshot;
  /** Read-only refresh; must not apply or acknowledge a write. */
  readNativeCab?(): Promise<OfficeNativeCabSnapshot>;
}
/** A restricted viewer receives only a sanitized semantic-results projection. */
export interface OfficeNativeSemanticResultsSnapshot {
  documentId: string;
  wire: string;
}
export interface OfficeNativeSemanticResultsSession {
  readonly kind: 'native_semantic_results';
  readonly documentId: string;
  readonly viewerId: string;
  readonly nativeSemanticResults: OfficeNativeSemanticResultsSnapshot;
  /** Fresh sanitized bytes only; current grant/context come from OfficeWordHost. */
  readNativeSemanticResults?(): Promise<OfficeNativeSemanticResultsSnapshot>;
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
  readonly currentDisclosureRevision?: string;
  readonly historyDisclosure?: HistoryDisclosure;
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
  openWord(
    host: OfficeWordHost,
  ): Promise<OfficeWordSession | OfficeNativeWordSession | OfficeNativeSemanticResultsSession | null>;
}

declare global {
  interface Window {
    marqueOfficeSourceMarking?: OfficeSourceMarkingInstallation;
    marqueOfficeWorkspace?: {
      provider: OfficeWorkspaceProvider;
      wordHost: OfficeWordHost;
      /** Installation-owned UTF-8 byte cap for native wire and current basis. */
      nativeMaxBytes?: number;
    };
  }
}

export const isSameWordDocument = async (
  host: OfficeWordHost,
  session: { readonly documentId: string },
): Promise<boolean> => (await host.activeDocumentId()) === session.documentId;
