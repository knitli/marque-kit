// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { OfficeSourceMarkingInstallation } from './source-marking.ts';
import type { WordCabOwnerGrant } from './cab-placement.ts';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
import type { NativeField } from '@knitli/marque-kit-core/native-wire';
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
  /** Notify before further results on any document, revision, disclosure, session, provider, pagination or formatting change. */
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
  /** Revoke before target or source, viewer, grant, permission, provider, layout, formatting or answer changes. */
  watchOrdinaryCabInvalidation?(
    documentId: string,
    chain: string,
    viewerId: string,
    invalidate: () => void,
  ): () => void;
  /** Independently authorize this viewer, exact member and raw evaluator input/output. */
  readOrdinaryCabGrant?(documentId: string, chain: string, viewerId: string): Promise<OfficeOrdinaryCabGrant | null>;
  /** Independently grant this exact viewer access to preview input and output. */
  readOrdinaryCabPreviewGrant?(
    documentId: string,
    chain: string,
    viewerId: string,
  ): Promise<OfficeOrdinaryCabPreviewGrant | null>;
  /** Independently grant this viewer the exact current linked source and raw disclosure. */
  readOrdinaryCabSourceLinkGrant?(
    documentId: string,
    chain: string,
    viewerId: string,
  ): Promise<OfficeOrdinaryCabSourceLinkGrant | null>;
  /** Independent current owner, source text and layout revision. */
  readNativeCabPlacementScope?(documentId: string, chain: string): Promise<OfficeCabPlacementScope | null>;
  /** Revoke before any selected source, selection, viewer, grant or provider changes. */
  watchNativeSelectedAudienceInvalidation?(documentId: string, viewerId: string, invalidate: () => void): () => void;
  /** Independently grant this viewer the current selected sources and permitted result fields. */
  readNativeSelectedAudienceScope?(documentId: string, viewerId: string): Promise<OfficeSelectedAudienceScope | null>;
}

export interface OfficeSelectedAudienceIdentity {
  source_id: string;
  revision_id: string;
  contribution_id: string;
}

/** Every source and selection is independently current and authorized by the host. */
export interface OfficeSelectedAudienceScope {
  documentId: string;
  viewerId: string;
  /** Digests measured from the deployed engine and its build-generated register. */
  engineArtifactSha256: string;
  recipientVocabularySha256: string;
  permissionRevision: string;
  selectionRevision: string;
  grantId: string;
  disclosure: {
    foreign_receive: boolean;
    foreign_show: boolean;
    foreign_display_only: boolean;
    implied_usa: boolean;
    coverage: boolean;
  };
  documents: { identity: OfficeSelectedAudienceIdentity; source: string }[];
  selections: { identity: OfficeSelectedAudienceIdentity; span: [number, number] }[];
}

export interface OfficeCabPlacementScope extends WordCabOwnerGrant {
  /** Independently designated owner and face; never inferred from a candidate or an attachment. */
  text: string;
  layout_revision: string;
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

/** Host grant; raw executor authorization and visible fields are separate permissions. */
export interface OfficeOrdinaryCabGrant {
  documentId: string;
  chain: string;
  viewerId: string;
  grantId: string;
  permissionRevision: string;
  layoutRevision: string;
  authorizeRawInput: true;
  authorizeRawOutput: true;
  requestJson: string;
  current: Omit<NativeCabRequest, 'expectedChain' | 'maxBasisBytes'>;
  disclosedFields: NativeField[];
}

/** Separate permission for one independently supplied opaque answer group.
 * Raw-output permission includes unkeyed receipt and fingerprint commitments,
 * which can confirm guesses about source or answer references. Recipients must
 * be authorized for those inputs; these digests do not authenticate or conceal them. */
export interface OfficeOrdinaryCabPreviewGrant {
  documentId: string;
  chain: string;
  viewerId: string;
  grantId: string;
  permissionRevision: string;
  /** Independently qualified commitments to this exact base and answer group. */
  expectedReceipt: string;
  expectedPreviewFingerprint: string;
  authorizeRawInput: true;
  authorizeRawOutput: true;
  /** Opaque references must distinguish changed values, or the host must revoke and reissue on every change. */
  answersJson: string;
  /** Independently observed source examination for this exact current target. */
  sourceExaminationJson: string;
  /** When present, a separate matching source grant is required before preview. */
  sourceLinkGrantId?: string;
  disclosedFields: NativeField[];
}

/** Independent authority for a linked source; raw-output permission includes commitments to its inputs. */
export interface OfficeOrdinaryCabSourceLinkGrant {
  documentId: string;
  chain: string;
  viewerId: string;
  grantId: string;
  permissionRevision: string;
  authorizeRawInput: true;
  authorizeRawOutput: true;
  current: {
    documentId: string;
    revisionId: string;
    contributionId: string;
    scopeLocator: [number, number];
    text: string;
    layoutRevision: string;
    facePage: number;
    owner: {
      role: 'transmittal' | 'attachment';
      parentDocumentId: string | null;
      intrinsicClassificationLocator: [number, number];
    };
  };
  sourceLinkJson: string;
}

export interface OfficeOrdinaryCabProvider {
  viewerId: string;
  /** Executes the current ordinary CAB questions operation; no writes or accepted answers. */
  evaluate(requestJson: string): Promise<string>;
  /** Optional separately granted read-only prepare/apply preview operation. */
  preview?(this: void, requestJson: string): Promise<string>;
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
  /** Optional trusted executor; independently authorized by readOrdinaryCabGrant. */
  readonly ordinaryCab?: OfficeOrdinaryCabProvider;
  /** Read-only refresh; must not apply or acknowledge a write. */
  readNativeCab?(): Promise<OfficeNativeCabSnapshot>;
}
/** An authorized ordinary-document placement inspection; it carries no policy or readiness receipt. */
export interface OfficeNativeCabPlacementSession {
  readonly kind: 'native_cab_placement';
  readonly documentId: string;
  readonly chain: string;
  /** Read-only native/WASM comparison over Word's observed pages and the independent owner binding. */
  inspectCabPlacement(text: string, requestJson: string): Promise<string>;
}
/** The operation is read-only; host scope is the authority for source and result disclosure. */
export interface OfficeNativeSelectedAudienceSession {
  readonly kind: 'native_selected_audience';
  readonly documentId: string;
  readonly viewerId: string;
  /** Digests measured from the engine artifact and its build-generated register. */
  readonly engineArtifactSha256: string;
  readonly recipientVocabularySha256: string;
  evaluateSelectedAudience(requestJson: string): Promise<string>;
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
  ): Promise<
    | OfficeWordSession
    | OfficeNativeWordSession
    | OfficeNativeCabPlacementSession
    | OfficeNativeSemanticResultsSession
    | OfficeNativeSelectedAudienceSession
    | null
  >;
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
