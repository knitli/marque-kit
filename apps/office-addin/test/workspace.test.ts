// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { appendAct, empty, sameBasis } from '@knitli/marque-kit-core/state';
import type { ActAppendRequest, AppendActResult, LogEntry, StagedAct, State } from '@knitli/marque-kit-core/types';
import type { OfficeWorkspaceProvider, OfficeWordHost, OfficeWordSession, OfficeWriteAck } from '../src/workspace.ts';

// Deliberately test-only: a real filesystem transaction across independent provider instances.
// It proves the provider contract and restart behavior; it is not a trusted or deployed workspace.
interface DiskState {
  state: State;
  staged: Record<string, ActAppendRequest>;
  pending: Record<string, LogEntry>;
  acknowledgements: Record<string, OfficeWriteAck>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const testBasis = () => ({
  sourceRevisions: {},
  selectionRevision: '1',
  relationshipRevision: '1',
  contextRevision: '1',
  policyRevision: '1',
  declarationsRevision: '1',
  scope: 'test',
  operation: 'test',
  evaluationContextRevision: '1',
  targetProfile: 'test',
  questionRevisions: {},
  artifactRevisions: {},
  replacements: {},
});
const testDoc = () => ({
  findings: [],
  document: {
    blocking: [],
    artifacts: [],
    evaluation: { basis: testBasis(), completion: 'incomplete' as const, requirements: [], snapshotReady: false },
  },
});
class LocalTestWorkspace implements OfficeWorkspaceProvider {
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
  }

  async openWord(host: OfficeWordHost): Promise<OfficeWordSession | null> {
    if ((await host.activeDocumentId()) !== 'local-test-document') return null;
    await this.transact((disk) => [disk, undefined]);
    const initial = await this.read();
    const state: State = {
      ...initial.state,
      pendingAppends: [
        ...(initial.state.pendingAppends ?? []),
        ...Object.values(initial.staged).map((request): StagedAct => ({ ...request, sequence: null, state: 'staged' })),
      ],
    };
    return {
      documentId: 'local-test-document',
      chain: 'local-test-chain',
      doc: testDoc(),
      vocab: {},
      state,
      basis: testBasis(),
      requiredWrites: [],
      requiredAcceptanceChecks: [],
      confirmedWrites: [],
      acceptanceChecks: {},
      append: (request) => this.append(request),
      stageAppend: (request) => this.stage(request),
      pendingWrites: async () => Object.values((await this.read()).pending).sort((a, b) => a.sequence - b.sequence),
      applyCommitted: (requestId, writeHost) => this.apply(requestId, writeHost),
      evaluateCurrent: async () => {
        const disk = await this.transact((before) => {
          const pending = { ...before.pending };
          for (const requestId of Object.keys(before.acknowledgements)) delete pending[requestId];
          return [{ ...before, pending }, before];
        });
        return {
          documentId: 'local-test-document',
          chain: 'local-test-chain',
          doc: testDoc(),
          basis: testBasis(),
          requiredWrites: [],
          requiredAcceptanceChecks: [],
          confirmedWrites: Object.values(disk.acknowledgements).map((ack) => ack.acknowledgement),
          acceptanceChecks: {},
          confirmedWriteAcks: Object.fromEntries(
            Object.entries(disk.acknowledgements).map(([id, ack]) => [id, ack.acknowledgement]),
          ),
        };
      },
    };
  }

  private async read(): Promise<DiskState> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as DiskState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { state: empty(), staged: {}, pending: {}, acknowledgements: {} };
    }
  }

  async inspect(): Promise<DiskState> {
    return this.read();
  }

  private async transact<T>(fn: (disk: DiskState) => [DiskState, T]): Promise<T> {
    const lock = `${this.file}.lock`;
    let handle;
    for (let attempt = 0; ; attempt++) {
      try {
        handle = await open(lock, 'wx');
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 500) throw error;
        await delay(5);
      }
    }
    try {
      const before = await this.read();
      const [after, value] = fn(before);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(after));
      await rename(temporary, this.file);
      return value as T;
    } finally {
      await handle.close();
      await rm(lock, { force: true });
    }
  }

  private async append(request: ActAppendRequest): Promise<AppendActResult> {
    return this.transact((disk) => {
      const staged = disk.staged[request.requestId];
      if (staged && JSON.stringify(staged) !== JSON.stringify(request)) throw new Error('Staged request changed.');
      if (!staged && !disk.state.log.some((entry) => entry.requestId === request.requestId)) {
        throw new Error('Intent must be durably staged before append.');
      }
      const result = appendAct(disk.state, request);
      const stagedRequests = { ...disk.staged };
      delete stagedRequests[request.requestId];
      const pending = { ...disk.pending };
      if (result.status === 'committed' && result.entry.requestId) pending[result.entry.requestId] = result.entry;
      const next: DiskState = { ...disk, state: result.state, staged: stagedRequests, pending };
      return [next, result];
    });
  }

  private async stage(request: ActAppendRequest): Promise<void> {
    if (request.binding?.documentId !== 'local-test-document' || request.binding.chain !== 'local-test-chain') {
      throw new Error('Intent is outside the local test document scope.');
    }
    await this.transact((disk) => {
      const existing = disk.staged[request.requestId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(request)) throw new Error('Request key conflict.');
      const committed = disk.state.log.find((entry) => entry.requestId === request.requestId);
      if (committed) return [disk, undefined];
      const staged = { ...disk.staged, [request.requestId]: structuredClone(request) };
      return [{ ...disk, staged }, undefined];
    });
  }

  private async apply(requestId: string, host: OfficeWordHost): Promise<OfficeWriteAck> {
    const before = await this.read();
    if (before.acknowledgements[requestId]) return before.acknowledgements[requestId];
    const entry = before.pending[requestId];
    if (!entry || (await host.activeDocumentId()) !== 'local-test-document')
      throw new Error('No matching local test work.');
    const first = Object.values(before.pending).sort((a, b) => a.sequence - b.sequence)[0];
    if (first?.requestId !== requestId) throw new Error('Earlier test work must be evaluated first.');
    const acknowledgement = await host.applyCommitted(entry, 'local-test-document');
    if (
      acknowledgement.requestId !== requestId ||
      acknowledgement.documentId !== 'local-test-document' ||
      !sameBasis(acknowledgement.basis, entry.binding?.basis)
    )
      throw new Error('The local test host returned a stale acknowledgement.');
    return this.transact((disk) => {
      const prior = disk.acknowledgements[requestId];
      if (prior) return [disk, prior];
      if (!disk.pending[requestId]) throw new Error('Pending work changed.');
      const acknowledgements = { ...disk.acknowledgements, [requestId]: acknowledgement };
      return [{ ...disk, acknowledgements }, acknowledgement];
    });
  }
}

const tempStore = async (): Promise<{ dir: string; file: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), 'marque-office-workspace-'));
  return { dir, file: join(dir, 'workspace.json'), cleanup: () => rm(dir, { recursive: true, force: true }) };
};
const request = (requestId: string): ActAppendRequest => ({
  requestId,
  id: 'finding-1',
  act: 'deferred',
  value: null,
  binding: { documentId: 'local-test-document', chain: 'local-test-chain', basis: testBasis() },
});
const appendCaptured = async (session: OfficeWordSession, req: ActAppendRequest) => {
  await session.stageAppend(req);
  return session.append(req);
};

void test('durable local test provider recovers an append after reopening and replays the same key', async () => {
  const store = await tempStore();
  try {
    const first = new LocalTestWorkspace(store.file);
    const host: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async () => {
        throw Error();
      },
    };
    const result = await first.openWord(host);
    assert.ok(result);
    const committed = await appendCaptured(result, request('same-key'));
    assert.equal(committed.status, 'committed');
    const reopened = new LocalTestWorkspace(store.file);
    const reopenedSession = await reopened.openWord(host);
    assert.ok(reopenedSession);
    const replayed = await appendCaptured(reopenedSession, request('same-key'));
    assert.equal(replayed.status, 'committed');
    if (committed.status === 'committed' && replayed.status === 'committed') {
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.entry.sequence, committed.entry.sequence);
      assert.deepEqual((await reopened.inspect()).state.log, [committed.entry]);
      assert.equal((await reopened.inspect()).pending['same-key']?.requestId, 'same-key');
    }
  } finally {
    await store.cleanup();
  }
});

void test('durable local test provider recovers an intent captured before append', async () => {
  const store = await tempStore();
  try {
    const host: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async () => {
        throw Error();
      },
    };
    const first = await new LocalTestWorkspace(store.file).openWord(host);
    assert.ok(first);
    await first.stageAppend(request('captured-before-append'));

    const reopened = await new LocalTestWorkspace(store.file).openWord(host);
    assert.ok(reopened);
    assert.deepEqual(reopened.state.pendingAppends, [
      { ...request('captured-before-append'), sequence: null, state: 'staged' },
    ]);
    const result = await appendCaptured(reopened, request('captured-before-append'));
    assert.equal(result.status, 'committed');
    const disk = await new LocalTestWorkspace(store.file).inspect();
    assert.equal(disk.staged['captured-before-append'], undefined);
    assert.equal(disk.state.log[0]?.requestId, 'captured-before-append');
  } finally {
    await store.cleanup();
  }
});

void test('independent local test providers serialize concurrent appends atomically', async () => {
  const store = await tempStore();
  try {
    const a = new LocalTestWorkspace(store.file),
      b = new LocalTestWorkspace(store.file);
    const host: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async () => {
        throw Error();
      },
    };
    const [as, bs] = await Promise.all([a.openWord(host), b.openWord(host)]);
    assert.ok(as && bs);
    const outcomes = await Promise.all([appendCaptured(as, request('first')), appendCaptured(bs, request('second'))]);
    assert.ok(outcomes.every((outcome) => outcome.status === 'committed'));
    const persisted = await a.inspect();
    assert.deepEqual(
      persisted.state.log.map((entry) => entry.sequence),
      [1, 2],
    );
    assert.deepEqual(Object.keys(persisted.pending).sort(), ['first', 'second']);
  } finally {
    await store.cleanup();
  }
});

void test('pending write is recovered and its acknowledgement survives another reopen', async () => {
  const store = await tempStore();
  try {
    const provider = new LocalTestWorkspace(store.file);
    const host: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async (entry, documentId) => ({
        requestId: entry.requestId!,
        documentId,
        acknowledgement: `local-test:${entry.requestId}`,
        basis: testBasis(),
      }),
    };
    const opened = await provider.openWord(host);
    assert.ok(opened);
    await appendCaptured(opened, request('write-key'));
    assert.equal((await opened.pendingWrites())[0]?.requestId, 'write-key');
    const ack = await opened.applyCommitted('write-key', host);
    assert.equal(ack.acknowledgement, 'local-test:write-key');
    const afterAck = await new LocalTestWorkspace(store.file).inspect();
    assert.equal(
      afterAck.pending['write-key']?.requestId,
      'write-key',
      'evaluation is still recoverable after persisted write acknowledgement',
    );
    const reopened = await new LocalTestWorkspace(store.file).openWord(host);
    assert.ok(reopened);
    assert.deepEqual(await reopened.pendingWrites(), [afterAck.pending['write-key']]);
    assert.equal((await reopened.applyCommitted('write-key', host)).acknowledgement, ack.acknowledgement);
    await reopened.evaluateCurrent(host);
    const disk = await new LocalTestWorkspace(store.file).inspect();
    assert.equal(disk.pending['write-key'], undefined);
    assert.equal(disk.acknowledgements['write-key']?.acknowledgement, ack.acknowledgement);
  } finally {
    await store.cleanup();
  }
});

void test('local test provider refuses a switched document and a stale host acknowledgement', async () => {
  const store = await tempStore();
  try {
    const provider = new LocalTestWorkspace(store.file);
    let writes = 0;
    const switched: OfficeWordHost = {
      activeDocumentId: async () => 'another-document',
      applyCommitted: async () => {
        writes++;
        throw new Error('must not run');
      },
    };
    const validHost: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async (entry, documentId) => {
        writes++;
        return { requestId: 'wrong-key', documentId, acknowledgement: 'wrong-key', basis: testBasis() };
      },
    };
    const session = await provider.openWord({ ...validHost, activeDocumentId: async () => 'local-test-document' });
    assert.ok(session);
    await appendCaptured(session, request('bound-write'));
    await assert.rejects(session.applyCommitted('bound-write', switched), /No matching local test work/);
    await assert.rejects(session.applyCommitted('bound-write', validHost), /stale acknowledgement/);
    assert.equal(writes, 1);
    assert.equal((await provider.inspect()).pending['bound-write']?.requestId, 'bound-write');
  } finally {
    await store.cleanup();
  }
});

void test('local test provider applies outstanding writes in order before evaluation', async () => {
  const store = await tempStore();
  try {
    const provider = new LocalTestWorkspace(store.file);
    const host: OfficeWordHost = {
      activeDocumentId: async () => 'local-test-document',
      applyCommitted: async (entry, documentId) => ({
        requestId: entry.requestId!,
        documentId,
        acknowledgement: `local-test:${entry.requestId}`,
        basis: testBasis(),
      }),
    };
    const session = await provider.openWord(host);
    assert.ok(session);
    await appendCaptured(session, request('first-write'));
    await appendCaptured(session, request('second-write'));
    await assert.rejects(session.applyCommitted('second-write', host), /Earlier test work/);
    await session.applyCommitted('first-write', host);
    await session.evaluateCurrent(host);
    await session.applyCommitted('second-write', host);
    assert.deepEqual(
      (await provider.inspect()).state.log.map((entry) => entry.sequence),
      [1, 2],
    );
  } finally {
    await store.cleanup();
  }
});
