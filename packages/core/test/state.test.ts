// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The rung function (docs/DERIVATION.md, Table 2, src/attention.ts) and the kit's state layer
// (src/state.ts), run against the memo under plain node (no DOM).
// `node test/state.test.ts`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rung, sections } from '../src/attention.ts';
import {
  appendAcknowledgementIssue,
  appendAct,
  empty,
  record,
  see,
  linted,
  snapshot,
  view,
  docView,
  effectiveReady,
  writeConfirmationToken,
  writeToken,
  ACTS,
} from '../src/state.ts';
import type {
  ActAppendRequest,
  AppendActResult,
  Act,
  ArtifactField,
  ArtifactView,
  MarkingInput,
  Reading,
  Blocks,
  Doc,
  FindingView,
  Moment,
  NeedsPerson,
  Rung,
  EvaluationBasis,
  RequirementStatus,
  State,
} from '../src/types.ts';

/* Table 2, row by row. */
const T: [NeedsPerson, Blocks, Moment, Rung][] = [
  ['none', 'never', 'editing', 'quiet'],
  ['optional', 'never', 'editing', 'advisory'],
  ['optional', 'never', 'finalize', 'advisory'],
  ['optional', 'finalize', 'editing', 'advisory'],
  ['optional', 'finalize', 'finalize', 'blocking'],
  ['required', 'finalize', 'editing', 'action'],
  ['required', 'finalize', 'finalize', 'blocking'],
  ['required', 'finalize', 'send', 'blocking'],
  ['required', 'now', 'editing', 'blocking'],
  ['required', 'now', 'finalize', 'blocking'],
];
for (const [needs_person, blocks, moment, want] of T) {
  assert.equal(rung({ needs_person, blocks }, moment), want, `${needs_person} × ${blocks} × ${moment}`);
}
{
  const request: ActAppendRequest = {
    requestId: 'validate-known-history',
    id: 'known',
    act: 'answered',
    value: null,
    at: 't1',
  };
  const malformedHistories: State[] = [
    {
      ...empty(),
      log: [],
      actSequence: 1,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 1] },
    },
    {
      ...empty(),
      log: [
        { sequence: 1, requestId: 'old-1', id: 'one', act: 'answered', value: null, at: 't1' },
        { sequence: 1, requestId: 'old-2', id: 'two', act: 'answered', value: null, at: 't2' },
      ],
      actSequence: 2,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 2] },
    },
    {
      ...empty(),
      log: [
        { sequence: 2, requestId: 'old-2', id: 'two', act: 'answered', value: null, at: 't2' },
        { sequence: 1, requestId: 'old-1', id: 'one', act: 'answered', value: null, at: 't1' },
      ],
      actSequence: 2,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 2] },
    },
  ];
  for (const [index, malformed] of malformedHistories.entries()) {
    const refused = appendAct(malformed, { ...request, requestId: `incoherent-${index}` });
    assert.equal(refused.status, 'refused');
    assert.equal(refused.reason, 'history-incomplete');
    assert.deepEqual(refused.state.log, malformed.log, 'malformed declared history cannot be extended');
    assert.equal(refused.state.actSequence, malformed.actSequence);
  }

  const duplicateKeys: State = {
    ...empty(),
    log: [
      { sequence: 1, requestId: 'repeat', id: 'one', act: 'answered', value: null, at: 't1' },
      { sequence: 2, requestId: 'repeat', id: 'two', act: 'answered', value: null, at: 't2' },
    ],
    actSequence: 2,
    actHistoryCoverage: { state: 'complete', sequenceRange: [1, 2] },
  };
  const duplicateKeyRefusal = appendAct(duplicateKeys, { ...request, requestId: 'new-after-duplicate' });
  assert.equal(duplicateKeyRefusal.status, 'refused');
  assert.equal(duplicateKeyRefusal.reason, 'request-id-conflict');
}
{
  const request: ActAppendRequest = {
    requestId: 'acknowledgement-check',
    id: 'finding',
    act: 'answered',
    value: null,
    at: 't1',
  };
  const committed = appendAct(empty(), request);
  assert.equal(committed.status, 'committed');
  assert.equal(appendAcknowledgementIssue(request, committed), null);

  const partialReplayState: State = {
    ...committed.state,
    actHistoryCoverage: { state: 'partial', sequenceRange: [1, 1] },
  };
  const partialReplay = appendAct(partialReplayState, request);
  assert.equal(partialReplay.status, 'committed');
  assert.equal(partialReplay.replayed, true);
  assert.equal(appendAcknowledgementIssue(request, partialReplay), null);

  const invalid = { ...committed.entry, sequence: 0 };
  const invalidAck: AppendActResult = {
    status: 'committed',
    entry: invalid,
    replayed: false,
    state: {
      ...committed.state,
      log: [invalid],
      actSequence: 0,
      actHistoryCoverage: { state: 'complete', sequenceRange: null },
    },
  };
  assert.equal(appendAcknowledgementIssue(request, invalidAck), 'invalid-frontier');

  const missingRowAck: AppendActResult = {
    status: 'committed',
    entry: committed.entry,
    replayed: false,
    state: {
      ...committed.state,
      log: [],
      actSequence: 1,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 1] },
    },
  };
  assert.equal(appendAcknowledgementIssue(request, missingRowAck), 'request-id-conflict');
}
{
  const request: ActAppendRequest = {
    requestId: 'restart-staged-request',
    id: 'finding',
    act: 'answered',
    value: { free: 'captured before restart' },
    at: 't1',
  };
  const staged: State = {
    ...empty(),
    pendingAppends: [{ ...request, sequence: null, state: 'staged' }],
  };
  const committed = appendAct(staged, request);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.entry.requestId, request.requestId);
  assert.equal(committed.state.pendingAppends?.length, 0, 'commit consumes the durable staged copy');

  const conflicting = appendAct(staged, { ...request, value: { free: 'different action' } });
  assert.equal(conflicting.status, 'refused');
  assert.equal(conflicting.reason, 'request-id-conflict');
  assert.deepEqual(conflicting.state.pendingAppends, staged.pendingAppends);
}
// Noticeable while a visible change is unseen; seen only quiets; whitespace isn't visible.
const comma = {
  needs_person: 'none' as const,
  blocks: 'never' as const,
  marking: { as_written: { text: '(S//REL TO USA FVEY)' } },
  outcome: { result: { text: '(S//REL TO USA, FVEY)' } },
};
assert.equal(rung(comma), 'noticeable');
assert.equal(rung({ ...comma, seen: true }), 'quiet');
assert.equal(rung({ ...comma, outcome: { result: { text: '(S//REL TO  USA FVEY)' } } }), 'quiet');

/* The memo. */
const doc = JSON.parse(readFileSync(new URL('../../../fixtures/memo.findings.json', import.meta.url), 'utf8')) as Doc;

// Raw14 caller control: its act-history lane is complete only through sequence 1,
// while the separate caller-issued frontier is already MAX_SAFE_INTEGER.
const rawActControl = JSON.parse(
  readFileSync(new URL('../../../fixtures/joint-handle-inputs.json', import.meta.url), 'utf8'),
) as {
  input: {
    act_history: {
      coverage: { state: 'complete' | 'partial' | 'unavailable'; sequence_range: [number, number] };
      ordered_acts: Array<Record<string, unknown>>;
    };
    append_request: { unsequenced_act: Record<string, unknown> };
    caller_control: { watermarks: { act_sequence: number } };
  };
};
const { expected: rawExpected } = JSON.parse(
  readFileSync(new URL('../../../fixtures/joint-protocol-cases.json', import.meta.url), 'utf8'),
) as {
  expected: { act_sequence: string; wrap_rounding_or_duplicate: boolean };
};
const rawAct = rawActControl.input.append_request.unsequenced_act;
// Map the raw handles and bindings into the kit's corresponding act fields.
const rawBinding = (act: Record<string, unknown>): NonNullable<ActAppendRequest['binding']> => ({
  chain: act.chain as string,
  subject: act.subject as { chain: string; serial: number },
  question: act.question as { chain: string; serial: number },
  questionRevision: act.question_revision as number,
  resultRevision: act.result_revision as number,
  payloadRef: act.payload_ref as string,
  sourceRevisions: act.source_revisions as string[],
  basisRef: act.basis as string,
  supersedes: act.supersedes as null,
  takesBack: act.takes_back as null,
});
const rawId = (act: Record<string, unknown>): string => {
  const subject = act.subject as { chain: string; serial: number };
  return `${subject.chain}/${subject.serial}`;
};
const raw14Request: ActAppendRequest = {
  requestId: `request-${rawAct.row_id as string}`,
  id: rawId(rawAct),
  act: rawAct.action as ActAppendRequest['act'],
  value: null,
  binding: rawBinding(rawAct),
};
assert.equal(rawAct.row_id, 'unsequenced-append');
assert.equal(rawAct.sequence, null);
assert.equal(rawAct.payload_ref, 'payload-unsequenced-append');
assert.equal(rawExpected.act_sequence, 'exhausted');
assert.equal(rawExpected.wrap_rounding_or_duplicate, false);
assert.deepEqual(raw14Request.binding, {
  chain: 'chain-A',
  subject: { chain: 'chain-A', serial: 1 },
  question: { chain: 'chain-A', serial: 1 },
  questionRevision: 1,
  resultRevision: 1,
  payloadRef: 'payload-unsequenced-append',
  sourceRevisions: ['src-A@1'],
  basisRef: 'b0',
  supersedes: null,
  takesBack: null,
});
{
  const history = rawActControl.input.act_history;
  const watermark = rawActControl.input.caller_control.watermarks.act_sequence;
  assert.equal(watermark, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(history.coverage.sequence_range, [1, 1]);
  const prior: State = {
    ...empty(),
    log: history.ordered_acts.map((act) => ({
      sequence: act.sequence as number,
      id: rawId(act),
      act: act.action as ActAppendRequest['act'],
      value: null,
      at: 'prior',
      binding: rawBinding(act),
    })),
    actSequence: watermark,
    actHistoryCoverage: { state: history.coverage.state, sequenceRange: history.coverage.sequence_range },
  };
  const refused = appendAct(prior, raw14Request);
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'sequence-exhausted');
  assert.equal(refused.reason === 'sequence-exhausted' ? 'exhausted' : 'other', rawExpected.act_sequence);
  assert.equal(refused.state.log.length > prior.log.length, rawExpected.wrap_rounding_or_duplicate);
  assert.deepEqual(refused.state.log, prior.log);
  assert.equal(refused.state.actSequence, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(refused.state.actHistoryCoverage, prior.actHistoryCoverage);
  assert.equal(refused.state.pendingAppends?.length, 1);
  assert.equal(refused.pending?.sequence, null);
  assert.equal(refused.pending?.state, 'pending_sequence');
  assert.deepEqual(refused.pending?.binding, raw14Request.binding);
  assert.equal(
    refused.state.log.some((entry) => entry.requestId === raw14Request.requestId),
    false,
  );

  const reloaded = JSON.parse(JSON.stringify(refused.state)) as State;
  const retry = appendAct(reloaded, raw14Request);
  assert.equal(retry.status, 'refused');
  assert.equal(retry.reason, 'sequence-exhausted');
  assert.deepEqual(
    retry.state.pendingAppends,
    refused.state.pendingAppends,
    'reload and retry preserve the exact pending request',
  );
  assert.equal(retry.state.pendingAppends?.length, 1);
}
{
  const legacy: State = {
    log: [{ sequence: 1, id: 'legacy', act: 'answered', value: null, at: 'prior' }],
    seen: [],
  };
  const refused = appendAct(legacy, { ...raw14Request, requestId: 'legacy-missing-frontier' });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'missing-frontier');
  assert.equal(refused.state.actSequence, undefined, 'a legacy watermark is not inferred from log length');
  assert.equal(refused.state.log.length, 1);
  assert.equal(refused.state.pendingAppends?.[0]?.sequence, null);
}
{
  const noCoverage: State = {
    log: [{ sequence: 1, id: 'known-watermark', act: 'answered', value: null, at: 'prior' }],
    seen: [],
    actSequence: 1,
  };
  const refused = appendAct(noCoverage, { ...raw14Request, requestId: 'legacy-missing-coverage' });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'missing-coverage');
  assert.equal(refused.state.actSequence, 1);
  assert.equal(refused.state.actHistoryCoverage, undefined, 'coverage is not fabricated from an explicit watermark');
  assert.deepEqual(refused.state.log, noCoverage.log);
  assert.equal(refused.state.pendingAppends?.[0]?.sequence, null);
  const sameRefusal = appendAct(refused.state, { ...raw14Request, requestId: 'legacy-missing-coverage' });
  assert.equal(sameRefusal.status, 'refused');
  assert.equal(
    sameRefusal.state.pendingAppends?.length,
    1,
    'retrying an unresolved request replaces rather than duplicates it',
  );

  const repaired: State = {
    ...refused.state,
    actHistoryCoverage: { state: 'complete', sequenceRange: [1, 1] },
  };
  const retried = appendAct(JSON.parse(JSON.stringify(repaired)) as State, {
    ...raw14Request,
    requestId: 'legacy-missing-coverage',
  });
  assert.equal(retried.status, 'committed');
  assert.equal(retried.entry.sequence, 2);
  assert.equal(
    retried.state.pendingAppends?.some((item) => item.requestId === 'legacy-missing-coverage'),
    false,
  );
  assert.equal(retried.state.log.filter((entry) => entry.requestId === 'legacy-missing-coverage').length, 1);
  const recoveredReplay = appendAct(JSON.parse(JSON.stringify(retried.state)) as State, {
    ...raw14Request,
    requestId: 'legacy-missing-coverage',
  });
  assert.equal(recoveredReplay.status, 'committed');
  assert.equal(recoveredReplay.replayed, true);
  assert.equal(recoveredReplay.state.log.length, 2);
}
{
  const committedRequest: ActAppendRequest = {
    requestId: 'known-committed-request',
    id: 'finding-known',
    act: 'answered',
    value: { free: 'same' },
    at: 'committed-at',
  };
  const committed = appendAct(empty(), committedRequest);
  assert.equal(committed.status, 'committed');
  const partialHistory: State = {
    ...committed.state,
    actHistoryCoverage: { state: 'partial', sequenceRange: [1, 1] },
  };
  const exactReplay = appendAct(partialHistory, committedRequest);
  assert.equal(
    exactReplay.status,
    'committed',
    'a known retained request replays even when other history is incomplete',
  );
  assert.equal(exactReplay.replayed, true);

  const unknown = appendAct(partialHistory, { ...committedRequest, requestId: 'unknown-new-request' });
  assert.equal(unknown.status, 'refused');
  assert.equal(unknown.reason, 'history-incomplete', 'a partial log cannot prove an absent request ID is novel');
  assert.equal(unknown.state.log.length, 1);
  assert.equal(unknown.state.actSequence, 1);
  assert.equal(unknown.state.pendingAppends?.[0]?.requestId, 'unknown-new-request');

  for (const coverage of [
    { state: 'unavailable' as const, sequenceRange: null },
    { state: 'complete' as const, sequenceRange: [1, 1] as [number, number] },
  ]) {
    const frontier = coverage.sequenceRange ? 2 : 0;
    const incomplete: State = { ...empty(), actSequence: frontier, actHistoryCoverage: coverage };
    const refused = appendAct(incomplete, { ...committedRequest, requestId: `unknown-${coverage.state}-${frontier}` });
    assert.equal(refused.status, 'refused');
    assert.equal(refused.reason, 'history-incomplete');
  }
}
for (const frontier of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  const malformed: State = { ...empty(), actSequence: frontier };
  const refused = appendAct(malformed, { ...raw14Request, requestId: `malformed-${frontier}` });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'invalid-frontier', `reject malformed frontier ${frontier}`);
  assert.equal(refused.state.actSequence, frontier);
  assert.equal(refused.state.log.length, 0);
  assert.equal(malformed.pendingAppends?.length, 0, 'refusal must not mutate the caller state');
  assert.equal(refused.state.pendingAppends?.length, 1);
}
{
  const occupied: State = {
    ...empty(),
    log: [{ sequence: 1, id: 'existing', act: 'answered', value: null, at: 'prior' }],
    actSequence: 0,
    actHistoryCoverage: { state: 'partial', sequenceRange: [1, 1] },
  };
  const refused = appendAct(occupied, { ...raw14Request, requestId: 'occupied-next-sequence' });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'invalid-frontier');
  assert.deepEqual(refused.state.log, occupied.log, 'an occupied next sequence is never duplicated');
  assert.equal(refused.state.actSequence, 0);
  assert.equal(refused.state.pendingAppends?.length, 1);
  assert.equal(occupied.pendingAppends?.length, 0);
}
{
  const initial = empty();
  assert.equal(initial.actSequence, 0);
  const request: ActAppendRequest = {
    requestId: 'append-retry-1',
    id: 'finding-1',
    act: 'answered',
    value: { free: 'one answer' },
  };
  const committed = appendAct(initial, request);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.entry.sequence, 1);
  assert.equal(committed.state.actSequence, 1);
  assert.deepEqual(committed.state.actHistoryCoverage, { state: 'complete', sequenceRange: [1, 1] });

  const reloaded = JSON.parse(JSON.stringify(committed.state)) as State;
  const replay = appendAct(reloaded, request);
  assert.equal(replay.status, 'committed');
  assert.equal(replay.replayed, true, 'a retry after a lost acknowledgement returns the original entry');
  assert.equal(replay.entry.requestId, request.requestId);
  assert.equal(replay.entry.sequence, 1);
  assert.equal(replay.state.log.length, 1, 'idempotent replay must not append a duplicate');

  const conflictingRetry = appendAct(committed.state, { ...request, value: { free: 'different answer' } });
  assert.equal(conflictingRetry.status, 'refused');
  assert.equal(conflictingRetry.reason, 'request-id-conflict');
  assert.equal(conflictingRetry.state, committed.state);

  const reorderedRequest: ActAppendRequest = {
    requestId: 'ordered-fields-1',
    id: 'finding-ordered',
    act: 'answered',
    value: { free: 'same value' },
    binding: {
      chain: 'chain-A',
      question: { chain: 'chain-A', serial: 1 },
      subject: { chain: 'chain-A', serial: 1 },
      questionRevision: 1,
      payloadRef: 'payload-1',
      basisRef: 'basis-1',
    },
  };
  const ordered = appendAct(empty(), reorderedRequest);
  assert.equal(ordered.status, 'committed');
  const fieldsReordered: ActAppendRequest = {
    requestId: reorderedRequest.requestId,
    id: reorderedRequest.id,
    act: reorderedRequest.act,
    value: { free: 'same value' },
    binding: {
      basisRef: 'basis-1',
      payloadRef: 'payload-1',
      questionRevision: 1,
      subject: { serial: 1, chain: 'chain-A' },
      question: { serial: 1, chain: 'chain-A' },
      chain: 'chain-A',
    },
  };
  const orderedReplay = appendAct(JSON.parse(JSON.stringify(ordered.state)) as State, fieldsReordered);
  assert.equal(orderedReplay.status, 'committed');
  assert.equal(orderedReplay.replayed, true, 'object-key order does not change request identity');
  const changedTimestamp = appendAct(ordered.state, { ...reorderedRequest, at: 'different-time' });
  assert.equal(changedTimestamp.status, 'refused');
  assert.equal(changedTimestamp.reason, 'request-id-conflict');

  const next = appendAct(replay.state, { ...request, requestId: 'append-retry-2', id: 'finding-2' });
  assert.equal(next.status, 'committed');
  assert.equal(next.entry.sequence, 2, 'the next sequence follows the explicit frontier');
}
const id = (x: { id: string }): string => x.id;
const P3 = 'f-p3-ownership',
  P4 = 'f-p4-portion-mark-absent',
  P5 = 'f-p5-noforn-rel-conflict',
  P2 = 'f-p2-rel-to-separator';
const f = (k: string): FindingView => doc.findings.find((x) => x.id === k)!;
const art = (d: Doc, k: string): ArtifactView => d.document.artifacts.find((a) => a.id === k)!;
const basis = (change: Partial<EvaluationBasis> = {}): EvaluationBasis => ({
  sourceRevisions: { document: 'source-1' },
  selectionRevision: 'selection-1',
  relationshipRevision: 'relationships-1',
  contextRevision: 'context-1',
  policyRevision: 'policy-1',
  declarationsRevision: 'declarations-1',
  scope: 'document',
  operation: 'send',
  evaluationContextRevision: 'send-1',
  targetProfile: 'default',
  questionRevisions: { [P3]: 'question-1' },
  artifactRevisions: { 'a-cab.derived_from': 'field-1' },
  replacements: {},
  ...change,
});
const readyEvaluation = (b = basis()) => ({
  basis: b,
  completion: 'complete' as const,
  requirements: [],
  snapshotReady: true,
});

// A lost append acknowledgement cannot lose or duplicate the independently
// recoverable host write: the exact committed token stays outstanding on replay.
{
  const question = f(P3);
  const request: ActAppendRequest = {
    requestId: 'recoverable-write-p3',
    id: P3,
    act: 'answered',
    value: { reading: question.outcome.readings![0]!, index: 0 },
    about: snapshot(question),
  };
  const committed = appendAct(empty(), request);
  assert.equal(committed.status, 'committed');
  const firstView = docView(doc, committed.state);
  assert.ok(firstView.document.pending?.includes(P3), 'a committed answer still awaits host application');
  assert.deepEqual(firstView.document.awaitingWrites, [writeToken(committed.entry)]);

  const reloaded = JSON.parse(JSON.stringify(committed.state)) as State;
  const retry = appendAct(reloaded, request);
  assert.equal(retry.status, 'committed');
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.entry, JSON.parse(JSON.stringify(committed.entry)));
  const recoveredView = docView(doc, retry.state);
  assert.deepEqual(recoveredView.document.pending, firstView.document.pending);
  assert.deepEqual(recoveredView.document.awaitingWrites, firstView.document.awaitingWrites);

  const hostDocument: Doc = {
    ...doc,
    document: {
      ...doc.document,
      pending: ['host-pending', P3],
      awaitingWrites: ['host-write:external', writeToken(committed.entry)],
    },
  };
  const mergedView = docView(hostDocument, committed.state);
  assert.deepEqual(mergedView.document.pending, ['host-pending', P3], 'host pending work survives projection');
  assert.deepEqual(
    mergedView.document.awaitingWrites,
    ['host-write:external', writeToken(committed.entry)],
    'host write intents survive and duplicate tokens are collapsed',
  );
}

// One real host consumer path: an incomplete/stale engine result or an unmet requirement
// cannot become ready through attention overlays; optional preview availability is separate.
{
  const b = basis();
  const blocked: Doc = {
    ...doc,
    findings: doc.findings.map((x) =>
      x.id === P3
        ? { ...x, severity: 'info', needs_person: 'none' as const, blocks: 'never' as const, evaluationBasis: b }
        : x,
    ),
    document: {
      ...doc.document,
      blocking: [P3],
      evaluation: {
        ...readyEvaluation(b),
        snapshotReady: false,
        requirements: [{ id: 'portion-mark', status: 'unmet', mandatory: true, scope: 'portion:4' }],
      },
    },
  };
  const current = { currentBasis: b };
  assert.ok(
    !effectiveReady(blocked, current),
    'a mandatory requirement stays blocking when severity/attention are quiet',
  );
  const question = blocked.findings.find((x) => x.id === P3)!;
  const answered = record(
    empty(),
    P3,
    'answered',
    { reading: question.outcome.readings![0]!, index: 0 },
    'act',
    snapshot(question),
  );
  const overlaid = docView(blocked, answered);
  assert.ok(overlaid.document.blocking.includes(P3), 'a local answer cannot clear the engine blocker');
  assert.ok(!effectiveReady(overlaid, current));

  const changedContext = basis({ contextRevision: 'context-2' });
  const staleDoc: Doc = {
    ...blocked,
    findings: blocked.findings.map((x) => (x.id === P3 ? { ...x, evaluationBasis: changedContext } : x)),
    document: {
      ...blocked.document,
      artifacts: blocked.document.artifacts.map((a) =>
        a.id === 'a-cab' ? { ...a, evaluationBasis: changedContext } : a,
      ),
    },
  };
  assert.ok(
    view(
      staleDoc.findings.find((x) => x.id === P3)!,
      answered,
    ).stale,
    'context changes stale a same-text question act',
  );
  assert.ok(
    !effectiveReady(
      { ...staleDoc, document: { ...staleDoc.document, blocking: [], evaluation: readyEvaluation(b) } },
      { currentBasis: changedContext },
    ),
  );

  const cabBase = {
    ...art(doc, 'a-cab'),
    evaluationBasis: b,
    fields: {
      ...art(doc, 'a-cab').fields!,
      derived_from: { ...art(doc, 'a-cab').fields!.derived_from!, evaluationBasis: b },
    },
  };
  const fieldAct = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'A source' } },
    'field-act',
    snapshot(cabBase),
  );
  const cabChanged = {
    ...cabBase,
    evaluationBasis: changedContext,
    fields: { ...cabBase.fields, derived_from: { ...cabBase.fields.derived_from!, evaluationBasis: changedContext } },
  };
  assert.equal(
    view(cabChanged, fieldAct).stale,
    true,
    'a context-only change stales a CAB field act independently of the banner',
  );

  const fresh = {
    ...doc,
    document: {
      ...doc.document,
      blocking: [],
      evaluation: { ...readyEvaluation(b), jointPreview: { status: 'unavailable' as const, basis: b } },
    },
  };
  assert.ok(
    effectiveReady(fresh, current),
    'an optional unavailable joint preview does not block a complete base evaluation',
  );
  assert.ok(
    !effectiveReady(
      {
        ...fresh,
        document: { ...fresh.document, evaluation: { ...readyEvaluation(b), completion: 'incomplete' as const } },
      },
      current,
    ),
  );
  assert.ok(!effectiveReady(fresh, { ...current, requiredWrites: ['a-cab'], confirmedWrites: [] }));
  assert.ok(
    effectiveReady(fresh, {
      ...current,
      requiredWrites: ['a-cab'],
      confirmedWrites: [writeConfirmationToken('a-cab', b)!],
      requiredAcceptanceChecks: ['outgoing-document'],
      acceptanceChecks: { 'outgoing-document': writeConfirmationToken('outgoing-document', b)! },
    }),
  );

  const mandatoryUnavailable = {
    ...fresh,
    document: {
      ...fresh.document,
      evaluation: {
        ...readyEvaluation(b),
        requirements: [{ id: 'rel-audience', status: 'unavailable' as const, mandatory: true, scope: 'page:1' }],
      },
    },
  };
  assert.ok(
    !effectiveReady(mandatoryUnavailable, current),
    'a complete evaluation with an unavailable mandatory requirement is not ready',
  );
  const mandatoryUnknown = {
    ...fresh,
    document: {
      ...fresh.document,
      evaluation: {
        ...readyEvaluation(b),
        requirements: [
          {
            id: 'rel-audience',
            status: 'future-status',
            mandatory: true,
            scope: 'page:1',
          } as unknown as RequirementStatus,
        ],
      },
    },
  };
  assert.ok(
    !effectiveReady(mandatoryUnknown, current),
    'an unrecognized mandatory requirement status cannot pass on snapshotReady alone',
  );
  const mandatoryMissingStatus = {
    ...fresh,
    document: {
      ...fresh.document,
      evaluation: {
        ...readyEvaluation(b),
        requirements: [
          {
            id: 'rel-audience',
            mandatory: true,
            scope: 'page:1',
          } as unknown as RequirementStatus,
        ],
      },
    },
  };
  assert.ok(
    !effectiveReady(mandatoryMissingStatus, current),
    'a missing mandatory requirement status cannot pass on snapshotReady alone',
  );
  const optionalUnavailable = {
    ...fresh,
    document: {
      ...fresh.document,
      evaluation: {
        ...readyEvaluation(b),
        requirements: [{ id: 'optional-preview', status: 'unavailable' as const, mandatory: false, scope: 'page:1' }],
      },
    },
  };
  assert.ok(
    effectiveReady(optionalUnavailable, current),
    'an optional unavailable requirement does not block an otherwise complete ready evaluation',
  );
  for (const status of ['satisfied', 'permitted'] as const) {
    const resolvedRequirement = {
      ...fresh,
      document: {
        ...fresh.document,
        evaluation: {
          ...readyEvaluation(b),
          requirements: [{ id: 'rel-audience', status, mandatory: true, scope: 'page:1' }],
        },
      },
    };
    assert.ok(
      effectiveReady(resolvedRequirement, {
        ...current,
        requiredWrites: ['a-cab'],
        confirmedWrites: [writeConfirmationToken('a-cab', b)!],
        requiredAcceptanceChecks: ['outgoing-document'],
        acceptanceChecks: { 'outgoing-document': writeConfirmationToken('outgoing-document', b)! },
      }),
      `mandatory ${status} requirement passes with current basis and confirmed host work`,
    );
  }

  const nextBasis = basis({ contextRevision: 'context-2' });
  const nextEvaluation = { ...fresh, document: { ...fresh.document, evaluation: readyEvaluation(nextBasis) } };
  const requiredCheck = { requiredAcceptanceChecks: ['outgoing-document'] };
  assert.ok(
    !effectiveReady(nextEvaluation, {
      currentBasis: nextBasis,
      ...requiredCheck,
      acceptanceChecks: { 'outgoing-document': writeConfirmationToken('outgoing-document', b)! },
    }),
    'a passed check at the previous context basis cannot carry forward',
  );
  assert.ok(
    effectiveReady(nextEvaluation, {
      currentBasis: nextBasis,
      ...requiredCheck,
      acceptanceChecks: { 'outgoing-document': writeConfirmationToken('outgoing-document', nextBasis)! },
    }),
    'the same named check passes when confirmed against the current basis',
  );
}

let g = sections(docView(doc, empty()), 'editing');
assert.deepEqual(g.must.map(id), [P3]);
assert.deepEqual(g.can.map(id), [P5, 'a-banner'], 'the derived banner is a card, not a receipt line');
assert.deepEqual(g.later.map(id), [P4, 'a-cab'], 'absent mark and CAB wait for finalize');
g = sections(docView(doc, empty()), 'finalize');
assert.deepEqual(g.must.map(id), [P3, P4, 'a-cab'], 'at finalize they all block');
// Artifacts follow Table 2 like findings: optional + finalize blocks at the gate; blocks: now blocks while editing.
const withBanner = (b: Partial<ArtifactView>): Doc => ({
  ...doc,
  document: {
    ...doc.document,
    artifacts: doc.document.artifacts.map((a) => (a.id === 'a-banner' ? { ...a, ...b } : a)),
  },
});
assert.ok(
  sections(withBanner({ needs_person: 'optional', blocks: 'finalize' }), 'finalize').must.some(
    (a) => a.id === 'a-banner',
  ),
);
assert.ok(
  sections(withBanner({ needs_person: 'optional', blocks: 'finalize' }), 'editing').can.some(
    (a) => a.id === 'a-banner',
  ),
);
assert.ok(
  sections(withBanner({ needs_person: 'required', blocks: 'now' }), 'editing').must.some((a) => a.id === 'a-banner'),
);

/* Acts. */
assert.throws(() => record(empty(), P3, 'undo' as Act), /Unknown act/);
assert.deepEqual(ACTS, ['answered', 'changed', 'kept_as_written', 'deferred', 'declined']);

// Answer ¶3: no longer needs a person, the answer is kept, the log is append-only.
const reading = f(P3).outcome.readings![0]!;
let s = record(empty(), P3, 'answered', { reading, index: 0 }, 't1');
let v = view(f(P3), s);
assert.equal(v.needs_person, 'none');
assert.equal(v.outcome.result!.text, reading.result!.text);
assert.equal(v.asks, null);
assert.ok(v.asked, 'the original question travels with the answer');
// Change my answer: back to the question, both lines in the log.
s = record(s, P3, 'changed', null, 't2');
assert.equal(view(f(P3), s).needs_person, 'required');
assert.equal(view(f(P3), s).history!.length, 2);

// Deferred stays open and moves to "Before you finalize" while editing.
s = record(empty(), P3, 'deferred');
g = sections(docView(doc, s), 'editing');
assert.ok(g.later.some((x) => x.id === P3) && !g.must.some((x) => x.id === P3));
assert.ok(docView(doc, s).document.blocking.includes(P3), 'deferral never answers for the person');
// Declined ("not my call") is still open too, and stays in Needs you for whoever gets it.
assert.ok(docView(doc, record(empty(), P3, 'declined')).document.blocking.includes(P3));
assert.ok(sections(docView(doc, record(empty(), P3, 'declined')), 'editing').must.some((x) => x.id === P3));

// An individual answer is never composed into an artifact preview by the kit.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings![0]!, index: 0 });
let banner = art(docView(doc, s), 'a-banner');
assert.equal((banner.derived_value as MarkingInput).text, 'SECRET//FGI AUS GBR//NOFORN');
assert.equal(banner.jointPreview, undefined);
s = record(s, P5, 'changed', null);
banner = art(docView(doc, s), 'a-banner');
assert.equal((banner.derived_value as MarkingInput).text, 'SECRET//FGI AUS GBR//NOFORN');

// Keep as written is an override: recorded, reported, never hidden.
s = record(empty(), P2, 'kept_as_written');
v = view(f(P2), s);
assert.equal(v.overridden, true);
assert.equal(v.outcome.result!.text, f(P2).marking!.as_written!.text);
assert.equal(v.history![0]!.act, 'kept_as_written');

// Seen only quiets.
assert.equal(rung(view(f(P2), see(empty(), f(P2)))), 'quiet');
assert.equal(rung(view(f(P3), see(empty(), f(P3)))), 'action', 'seen never touches a required finding');
// A new result under the same id is unseen again.
const p2b = { ...f(P2), outcome: { ...f(P2).outcome, result: { text: '(S//REL TO USA, FVEY, NZL)' } } };
assert.equal(rung(view(p2b, see(empty(), f(P2)))), 'noticeable');

// The CAB: Derived From filled → Declassify On opens → both filled → no longer blocks.
const cab = art(doc, 'a-cab');
s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Example Guide 2024-01, 20240115' } });
const cv = view(cab, s);
assert.equal(cv.fields!.derived_from!.state, 'known');
assert.equal(cv.fields!.declassify_on!.state, 'blank', 'a field waiting on a filled one becomes fillable');
assert.equal(cv.needs_person, 'required');
s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } });
assert.equal(view(cab, s).needs_person, 'none');

// Ready only when everything the engine listed is settled.
s = empty();
s = record(s, P3, 'answered', { reading, index: 0 });
s = record(s, P4, 'answered', { free: '(U)' });
assert.ok(!effectiveReady(docView(doc, s), { currentBasis: basis() }));
assert.ok(
  sections(docView(doc, s), 'editing').done.some((x) => x.id === P4),
  'an answered missing mark is done, not waiting',
);
s = record(s, 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources', declassify_on: '20490115' } });
let done = docView(doc, s);
assert.ok(done.document.blocking.includes(P3), 'an answer does not erase the semantic blocker');
assert.deepEqual(done.document.pending, [P3, P4, 'a-cab'], 'answered is not applied');
assert.ok(!effectiveReady(done, { currentBasis: basis() }), 'a missing fresh evaluation cannot establish readiness');
// The host re-lints: the new findings carry the answers; the old ones are never replayed.
// oxlint-disable-next-line no-unused-vars -- the overlay is what's dropped
const strip = <T extends FindingView | ArtifactView>({ person, history, ...x }: T) => x;
const relint = {
  ...done,
  findings: done.findings.map(strip),
  document: {
    ...done.document,
    blocking: [],
    pending: [],
    evaluation: readyEvaluation(basis()),
    artifacts: done.document.artifacts.map(strip),
  },
};
s = linted(s);
done = docView(relint, s);
assert.deepEqual(done.document.pending, []);
assert.ok(
  !effectiveReady(done, { currentBasis: basis() }),
  'a fresh evaluation does not by itself confirm host writes',
);
assert.ok(
  effectiveReady(done, {
    currentBasis: basis(),
    confirmedWrites: done.document.awaitingWrites!.map((token) => writeConfirmationToken(token, basis())!),
  }),
  'the host confirms each accepted write against the same evaluation basis',
);
// A same-id finding that asks again after the lint is not settled by the old answer.
assert.equal(view(f(P3), s).needs_person, 'required', "an answer before the lint is the engine's to report");
assert.ok(docView(doc, s).document.blocking.includes(P3));
// The engine's document is untouched.
assert.ok(!doc.document.evaluation, 'the hand-written source fixture remains the legacy oracle');
assert.equal(f(P3).needs_person, 'required');

// Every edit waits for the lint, not only blockers.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings![0]!, index: 0 });
assert.deepEqual(docView(doc, s).document.pending, [P5]);
// Applying the derived banner is an edit too; the host writes it.
s = record(empty(), 'a-banner', 'answered', { apply: true });
assert.equal(art(docView(doc, s), 'a-banner').applying, true);
assert.deepEqual(docView(doc, s).document.pending, ['a-banner']);
// A typed answer to a prose question is not a marking.
v = view(f(P3), record(empty(), P3, 'answered', { free: 'The UK alone' }));
assert.notEqual(v.outcome.result?.text, 'The UK alone');
assert.equal(view(f(P4), record(empty(), P4, 'answered', { free: '(U)' })).outcome.result!.text, '(U)');

// A lint covers only the acts made before it began.
s = record(empty(), P3, 'answered', { reading, index: 0 });
s = record(s, P5, 'changed', { reading: f(P5).outcome.readings![0]!, index: 0 });
s = linted(s, 1);
assert.deepEqual(docView(doc, s).document.pending, [P5], 'an edit made during the lint is still pending');
assert.equal(view(f(P3), s).person, null, 'an answer the lint reflects is no longer the current act');
assert.equal(view(f(P3), s).history!.length, 1, 'but stays in the audit');
assert.equal(linted(s, 0).linted, 1, 'the checkpoint never moves back');
// Any artifact takes artifact handling, fields or not.
const notice: ArtifactView = {
  id: 'a-notice',
  kind: 'notice' as const,
  state: 'absent_but_required' as const,
  fixability: 'fixable',
  says: { text: '' },
  needs_person: 'none' as const,
  blocks: 'never' as const,
};
assert.equal(view(notice, record(empty(), 'a-notice', 'answered', { apply: true })).applying, true);
const extra: ArtifactView = { ...notice, state: 'present_not_required' as const };
assert.ok(
  sections({ ...doc, document: { ...doc.document, artifacts: [extra] } }, 'editing').can.some(
    (a) => a.id === 'a-notice',
  ),
);

// Acts on a finding a later lint withdrew stay for the receipt.
s = record(empty(), P3, 'declined');
const lessDoc = { ...doc, findings: doc.findings.filter((x) => x.id !== P3) };
assert.deepEqual(
  docView(lessDoc, s).document.withdrawn!.map((x) => x.history![0]!.act),
  ['declined'],
);
assert.deepEqual(docView(doc, s).document.withdrawn, []);
// An artifact's seen is of its value: a new value under the same id is unseen again.
const ban = art(doc, 'a-banner');
s = see(empty(), ban);
assert.equal(view(ban, s).seen, true);
assert.equal(view({ ...ban, derived_value: { text: 'SECRET//NOFORN' } }, s).seen, false);

// Undoing a written answer is a write; undoing an unwritten one cancels it.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings![0]!, index: 0 });
assert.deepEqual(docView(doc, record(s, P5, 'changed', null)).document.pending, [], 'cancelled before any lint');
assert.deepEqual(
  docView(doc, record(linted(s), P5, 'changed', null)).document.pending,
  [P5],
  'reversing a written edit waits for the lint',
);
// An override holds only for the marking and fix it was taken on.
s = record(empty(), P2, 'kept_as_written', null, 't', snapshot(f(P2)));
assert.equal(view(f(P2), s).overridden, true);
const p2new = { ...f(P2), marking: { ...f(P2).marking!, as_written: { text: '(S//REL TO USA FVEY NZL)' } } };
assert.equal(view(p2new, s).overridden, undefined, 'a changed marking under the same id is open again');
// Taking back a written answer reopens the question it answered.
s = record(empty(), P3, 'answered', { reading, index: 0 }, 't1', snapshot(f(P3)));
s = linted(s);
const writtenP3: FindingView = {
  ...view(f(P3), record(empty(), P3, 'answered', { reading, index: 0 })),
  person: undefined,
  history: undefined,
  asks: null,
  outcome: { ...f(P3).outcome, kind: 'applied' as const, result: reading.result },
};
s = record(s, P3, 'changed', null, 't2', snapshot(writtenP3));
v = view(writtenP3, s);
assert.equal(v.asks!.text, f(P3).asks!.text);
assert.equal(v.needs_person, 'required');
assert.equal(v.outcome.kind, 'choices');
assert.deepEqual(
  docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? writtenP3 : x)) }, s).document.pending,
  [P3],
);
// A write to a withdrawn finding is not pending; its acts stay in withdrawn.
s = record(empty(), P3, 'answered', { reading, index: 0 });
const gone = docView({ ...doc, findings: doc.findings.filter((x) => x.id !== P3) }, s);
assert.deepEqual(gone.document.pending, []);
assert.equal(gone.document.withdrawn![0]!.id, P3);

// An answer taken on a different question under the same id doesn't carry over.
s = record(empty(), P3, 'answered', { reading, index: 0 }, 't', snapshot(f(P3)));
const reworded = { ...f(P3), asks: { ...f(P3).asks!, text: 'Who owns paragraph 3?' } };
assert.equal(view(reworded, s).needs_person, 'required');
assert.deepEqual(
  docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? reworded : x)) }, s).document.pending,
  [],
);
// A snapshot is a copy.
const src = structuredClone(f(P3));
const snap = snapshot(src);
src.asks!.text = 'changed in place';
assert.equal(snap.asks!.text, f(P3).asks!.text);

// A withdrawn finding keeps what it was about.
s = record(empty(), P3, 'declined', null, 't', snapshot(f(P3)));
const w = docView({ ...doc, findings: doc.findings.filter((x) => x.id !== P3) }, s).document.withdrawn![0]!;
assert.equal(w.about!.rule, `${f(P3).rule.scheme}:${f(P3).rule.predicate}`);
assert.equal(w.about!.as_written, f(P3).marking!.as_written!.text);

// A derived field counts as filled.
const derivedCab: ArtifactView = {
  ...cab,
  fields: { ...cab.fields!, derived_from: { state: 'derived' as const, value: 'Example Guide 2024-01' } },
};
assert.equal(view(derivedCab, empty()).fields!.declassify_on!.state, 'blank');
assert.equal(
  view(derivedCab, record(empty(), 'a-cab', 'answered', { fields: { declassify_on: '20490115' } })).needs_person,
  'none',
);

// A reading picked that the finding no longer offers doesn't carry over.
{
  const s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  assert.equal(view(f(P3), s).needs_person, 'none');
  const moved = { ...f(P3), outcome: { ...f(P3).outcome, readings: f(P3).outcome.readings!.slice(1) } };
  assert.equal(view(moved, s).stale, true);
  assert.deepEqual(
    docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? moved : x)) }, s).document.pending,
    [],
  );
}
// Seen is of the result shown: taking the alternative after opening the card is a new, unseen result.
{
  const s = record(see(empty(), f(P5)), P5, 'changed', { reading: f(P5).outcome.readings![0]!, index: 0 });
  assert.equal(view(f(P5), see(empty(), f(P5))).seen, true);
  assert.equal(view(f(P5), s).seen, false);
  assert.equal(rung(view(f(P5), s)), 'noticeable');
}

// An override a lint invalidated isn't pending: there is nothing to write.
{
  const p2 = f(P2);
  const s = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(p2));
  const moved = { ...p2, marking: { ...p2.marking!, as_written: { text: '(S//REL TO USA, FVEY)' } } };
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P2 ? moved : x)) }, s);
  assert.deepEqual(d.document.pending, []);
  assert.equal(d.findings.find((x) => x.id === P2)!.overridden, undefined);
}
// An override doesn't answer a question asked of the finding since: it's open, and it blocks again.
{
  const p2 = f(P2);
  const s = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(p2));
  const asked: FindingView = {
    ...p2,
    asks: { kind: 'confirm', text: 'Is FVEY meant here?', free_answer: true },
    needs_person: 'required',
    blocks: 'finalize',
  };
  const d = docView(
    {
      ...doc,
      findings: doc.findings.map((x) => (x.id === P2 ? asked : x)),
      document: { ...doc.document, blocking: [...doc.document.blocking, P2] },
    },
    s,
  );
  const v = d.findings.find((x) => x.id === P2)!;
  assert.equal(v.overridden, undefined);
  assert.equal(v.stale, true);
  assert.ok(d.document.blocking.includes(P2), 'a new question is never answered by an old override');
  assert.ok(!effectiveReady(d, { currentBasis: basis() }));
}
// A take-back of a written answer on a finding that has since changed restores nothing and isn't pending.
{
  let s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  s = linted(s);
  const written: FindingView = {
    ...f(P3),
    asks: null,
    needs_person: 'none' as const,
    blocks: 'never' as const,
    marking: { ...f(P3).marking!, as_written: f(P3).outcome.readings![0]!.result! },
  };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  const later = { ...written, marking: { ...written.marking!, as_written: { text: '(S//NF)' } } };
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? later : x)) }, s);
  assert.deepEqual(d.document.pending, []);
  assert.equal(d.findings.find((x) => x.id === P3)!.asks, null, 'the old question is not restored');
}
// An apply taken on one banner value doesn't carry over to a new one.
{
  const ban = art(doc, 'a-banner');
  const s = record(empty(), 'a-banner', 'answered', { apply: true }, undefined, snapshot(ban));
  assert.equal(view(ban, s).applying, true);
  const next = { ...ban, derived_value: { text: 'SECRET//NOFORN' } };
  assert.equal(view(next, s).applying, undefined);
  assert.deepEqual(
    docView(
      {
        ...doc,
        document: { ...doc.document, artifacts: doc.document.artifacts.map((a) => (a.id === 'a-banner' ? next : a)) },
      },
      s,
    ).document.pending,
    [],
  );
}

// An answer to a question whose field changed doesn't carry over, even with the same words.
{
  const s = record(empty(), P4, 'answered', { free: 'U' }, undefined, snapshot(f(P4)));
  const now = { ...f(P4), asks: { ...f(P4).asks!, field: { ...f(P4).asks!.field!, type: 'prose' as const } } };
  assert.equal(view(now, s).stale, true);
}
// A typed field on a field that changed or went away doesn't carry over.
{
  const s = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'Multiple Sources' } },
    undefined,
    snapshot(cab),
  );
  assert.equal(view(cab, s).fields!.derived_from!.value, 'Multiple Sources');
  const { derived_from, ...rest }: Record<string, ArtifactField> = cab.fields!;
  assert.equal(view({ ...cab, fields: rest }, s).stale, true);
  assert.equal(
    view({ ...cab, fields: { ...cab.fields!, derived_from: { ...derived_from!, hint: 'a source list' } } }, s).stale,
    true,
  );
}
// A correction to a filled field is of the value the lint gave; a new value there drops it.
{
  const s = record(empty(), 'a-cab', 'answered', { fields: { classified_by: 'J. Example' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).fields!.classified_by!.value, 'J. Example');
  const moved = {
    ...cab,
    fields: { ...cab.fields!, classified_by: { ...cab.fields!.classified_by!, value: 'J. Example, Analyst' } },
  };
  assert.equal(view(moved, s).stale, true);
}
// A field opened by an earlier local act is checked against the lint's own state, not the overlay.
{
  let s = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'Multiple Sources' } },
    undefined,
    snapshot(cab),
  );
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(view(cab, s)));
  const v = view(cab, s);
  assert.notEqual(v.stale, true);
  assert.equal(v.fields!.declassify_on!.value, '20490115');
}
// A deferral, or an answer, on another question or rule under the same id doesn't carry over.
{
  const p3 = f(P3);
  const s = record(empty(), p3.id, 'deferred', null, undefined, snapshot(p3));
  assert.equal(view(p3, s).deferred, 'deferred');
  const asked = { ...p3, asks: { ...p3.asks!, text: 'Which countries own this information?' } };
  assert.equal(view(asked, s).stale, true);
  assert.equal(view(asked, s).deferred, undefined);
  const a = record(empty(), p3.id, 'answered', { reading: p3.outcome.readings![0]! }, undefined, snapshot(p3));
  assert.equal(view({ ...p3, rule: { ...p3.rule, predicate: 'another' } }, a).stale, true);
}
// A host editing a view doesn't edit the log.
{
  const s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } });
  const v = view(cab, s);
  v.history![0]!.value!.fields!.derived_from = 'changed';
  v.person!.act = 'declined';
  assert.equal(s.log[0]!.value!.fields!.derived_from, 'Multiple Sources');
  assert.equal(s.log[0]!.act, 'answered');
}
// A block filled in to the last field waits to be written; one still open doesn't yet.
{
  let s = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'Multiple Sources' } },
    undefined,
    snapshot(cab),
  );
  assert.equal(view(cab, s).applying, undefined);
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).applying, true);
  assert.equal(view(cab, linted(s)).applying, undefined);
}
// A stale later field leaves an earlier one that still holds: shown, and still waiting to be written.
{
  let s = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'Multiple Sources' } },
    undefined,
    snapshot(cab),
  );
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(cab));
  const now: ArtifactView = {
    ...cab,
    fields: { ...cab.fields!, declassify_on: { ...cab.fields!.declassify_on!, hint: 'eight digits' } },
  };
  const v = view(now, s);
  assert.notEqual(v.stale, true);
  assert.equal(v.fields!.derived_from!.value, 'Multiple Sources');
  assert.notEqual(v.fields!.declassify_on!.source, 'person');
  const d = {
    ...doc,
    document: { ...doc.document, artifacts: doc.document.artifacts.map((a) => (a.id === 'a-cab' ? now : a)) },
  };
  assert.ok(docView(d, s).document.pending!.includes('a-cab'));
}

// A reading whose label or assertions changed under the same marking is a different reading.
{
  const r0 = f(P3).outcome.readings![0]!;
  const s = record(empty(), P3, 'answered', { reading: r0, index: 0 }, undefined, snapshot(f(P3)));
  const now = {
    ...f(P3),
    outcome: {
      ...f(P3).outcome,
      readings: [{ ...r0, asserts: { ...r0.asserts, owners: ['AUS'] } }, ...f(P3).outcome.readings!.slice(1)],
    },
  };
  assert.equal(view(now, s).stale, true);
}
// A take-back of a written answer is stale once the engine's result moved, too.
{
  let s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  s = linted(s);
  const written: FindingView = {
    ...f(P3),
    asks: null,
    needs_person: 'none' as const,
    blocks: 'never' as const,
    outcome: { ...f(P3).outcome, result: f(P3).outcome.readings![0]!.result },
  };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  assert.equal(view(written, s).stale, undefined);
  assert.equal(view({ ...written, outcome: { ...written.outcome, result: { text: '(S//NF)' } } }, s).stale, true);
}
// The log owns its values.
{
  const reading = structuredClone(f(P3).outcome.readings![0]!);
  const s = record(empty(), P3, 'answered', { reading, index: 0 });
  reading.reading = 'edited in place';
  assert.notEqual(s.log[0]!.value!.reading!.reading, 'edited in place');
}

// "Fix it after all" on a written override stays pending: the host has the fix to apply.
{
  let s = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(f(P2)));
  s = linted(s);
  const kept = view(f(P2), s);
  assert.equal(kept.overridden, true);
  s = record(s, P2, 'changed', null, undefined, snapshot(kept));
  const d = docView(doc, s);
  assert.deepEqual(d.document.pending, [P2]);
  assert.equal(d.findings.find((x) => x.id === P2)!.stale, undefined);
}

// A choice from the question's own options holds: ¶4 lists them in asks.options, not outcome.readings.
{
  const o = f(P4).asks!.options![0] as Reading;
  const s = record(empty(), P4, 'answered', { reading: o, index: 0 }, undefined, snapshot(f(P4)));
  assert.equal(view(f(P4), s).needs_person, 'none');
  assert.deepEqual(docView(doc, s).document.pending, [P4]);
}
// "Change my answer" doesn't need a round trip: an answer to the reopened question holds while the take-back waits.
{
  let s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  s = linted(s);
  const written: FindingView = {
    ...f(P3),
    asks: null,
    needs_person: 'none' as const,
    blocks: 'never' as const,
    outcome: { ...f(P3).outcome, result: f(P3).outcome.readings![0]!.result },
  };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  const reopened = view(written, s);
  assert.equal(reopened.asks!.text, f(P3).asks!.text);
  s = record(s, P3, 'answered', { reading: reopened.outcome.readings![1]!, index: 1 }, undefined, snapshot(reopened));
  const now = view(written, s);
  assert.equal(now.stale, undefined);
  assert.equal(now.outcome.result!.text, f(P3).outcome.readings![1]!.result!.text);
}
// Individual answers never move the banner; only a matching joint engine preview can do that.
{
  const r0 = f(P5).outcome.readings![0]!;
  const s = record(empty(), P5, 'changed', { reading: r0, index: 0 }, undefined, snapshot(f(P5)));
  const ban = (d: Doc) => (art(d, 'a-banner').derived_value as MarkingInput).text;
  const base = ban(doc);
  assert.equal(ban(docView(doc, s)), base);
  const moved = { ...f(P5), outcome: { ...f(P5).outcome, readings: [{ ...r0, reading: 'something else' }] } };
  assert.equal(ban(docView({ ...doc, findings: doc.findings.map((x) => (x.id === P5 ? moved : x)) }, s)), base);
}

// Deferring or declining a reopened question keeps it reopened, and the take-back still waits to be written.
for (const act of ['deferred', 'declined'] as const) {
  let s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  s = linted(s);
  const written: FindingView = {
    ...f(P3),
    asks: null,
    needs_person: 'none' as const,
    blocks: 'never' as const,
    outcome: { ...f(P3).outcome, result: f(P3).outcome.readings![0]!.result },
  };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  s = record(s, P3, act, null, undefined, snapshot(view(written, s)));
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? written : x)) }, s);
  const v = d.findings.find((x) => x.id === P3)!;
  assert.equal(v.asks?.text, f(P3).asks!.text, act);
  assert.equal(v.needs_person, f(P3).needs_person, act);
  assert.ok(d.document.pending!.includes(P3), act);
  assert.ok(!effectiveReady(d, { currentBasis: basis() }), act);
}

// A marking given as a plain string is a marking result, not typed content.
{
  const a: ArtifactView = {
    id: 'x',
    kind: 'front_marking',
    state: 'absent_but_required',
    derived_value: 'SECRET',
    says: { text: '' },
    needs_person: 'none',
    blocks: 'never',
  };
  const snap = snapshot(a);
  assert.equal(snap.result, 'SECRET');
  assert.equal(snap.content, undefined);
}

// An answer taken on one paragraph doesn't carry to another under the same id; a moved span does.
{
  const p3 = f(P3);
  const s = record(
    empty(),
    p3.id,
    'answered',
    { reading: p3.outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(p3),
  );
  assert.equal(view({ ...p3, anchor: { ...p3.anchor!, portion: 4 } }, s).stale, true);
  assert.notEqual(view({ ...p3, anchor: { ...p3.anchor!, span: [0, 1] } }, s).stale, true);
}
// A field filled after a local answer to the one it waits on goes when that answer does.
{
  let s = record(
    empty(),
    'a-cab',
    'answered',
    { fields: { derived_from: 'Multiple Sources' } },
    undefined,
    snapshot(cab),
  );
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(view(cab, s)));
  const reasked = {
    ...cab,
    fields: { ...cab.fields!, derived_from: { ...cab.fields!.derived_from!, hint: 'a source list' } },
  };
  const v = view(reasked, s);
  assert.equal(v.stale, true);
}
// The same text with other masks is a new result: seen again.
{
  const p2 = f('f-p2-rel-to-separator');
  const s = see(empty(), p2);
  assert.equal(view(p2, s).seen, true);
  const masked = {
    ...p2,
    outcome: {
      ...p2.outcome,
      result: { ...p2.outcome.result!, masks: [{ kind: 'concealed' as const, start: 0, end: 1 }] },
    },
  };
  assert.equal(view(masked, s).seen, false);
}

// An override on one paragraph doesn't carry to another under the same id.
{
  const p2 = f(P2);
  const s = record(empty(), p2.id, 'kept_as_written', null, undefined, snapshot(p2));
  assert.equal(view(p2, s).overridden, true);
  assert.equal(view({ ...p2, anchor: { ...p2.anchor!, portion: 5 } }, s).stale, true);
}

// Taking back a written answer reopens the question as it was asked, fallback included.
{
  let s = record(
    empty(),
    P3,
    'answered',
    { reading: f(P3).outcome.readings![0]!, index: 0 },
    undefined,
    snapshot(f(P3)),
  );
  s = linted(s);
  const { fallback, ...rest } = f(P3).outcome;
  const written: FindingView = {
    ...f(P3),
    asks: null,
    needs_person: 'none' as const,
    blocks: 'never' as const,
    outcome: { ...rest, result: f(P3).outcome.readings![0]!.result },
  };
  s = record(s, P3, 'changed', null, undefined, snapshot(view(written, s)));
  assert.ok(fallback, 'the fixture has a fallback');
  assert.deepEqual(view(written, s).outcome.fallback, fallback);
}
// A mask added under the same text is another marking: an act taken on the unmasked one doesn't carry over.
{
  const p3 = f(P3);
  const a = record(empty(), p3.id, 'answered', { reading: p3.outcome.readings![0]! }, undefined, snapshot(p3));
  const hid: FindingView = {
    ...p3,
    marking: {
      ...p3.marking!,
      as_written: { ...p3.marking!.as_written!, masks: [{ kind: 'concealed' as const, span: [12, 15] }] },
    },
  };
  assert.notEqual(view(p3, a).stale, true);
  assert.equal(view(hid, a).stale, true);
  const p2 = f(P2);
  const k = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(p2));
  const res: FindingView = {
    ...p2,
    outcome: {
      ...p2.outcome,
      result: { ...p2.outcome.result!, masks: [{ kind: 'unidentified' as const, span: [12, 13] }] },
    },
  };
  assert.equal(view(p2, k).overridden, true);
  assert.equal(view(res, k).overridden, undefined);
}

console.log('state: ok');
