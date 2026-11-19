// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

(() => {
  const scenario = new URLSearchParams(location.search).get('scenario') ?? 'restricted-current';
  const initialToken = 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
  const wire = window.marqueTestFixture;
  const initialContext = {
    documentId: 'word-doc-restricted-7',
    revisionId: 'document-revision-15',
    viewerId: 'restricted-viewer-9',
    principalRevision: 'principal-revision-4',
    evaluationId: 'evaluation-token-27',
  };
  let currentContext = { ...initialContext };
  const fullRows = () => Array.from({ length: 4 }, () => ({ meaning: true, supportKinds: true, dependencies: true }));
  const deniedRows = () =>
    Array.from({ length: 4 }, () => ({ meaning: false, supportKinds: false, dependencies: false }));
  let currentGrantId = initialToken;
  let currentRows = fullRows();
  let currentCoverage = true;
  const requestFor = (context, grantId = currentGrantId, rows = currentRows, coverage = currentCoverage) => ({
    current: { ...context },
    grant: {
      ...context,
      grantId,
      rows,
      coverage,
    },
  });
  const wireFor = (grantId, denied = false) => {
    const envelope = JSON.parse(wire);
    envelope.disclosure.grant_id = grantId;
    if (denied) {
      envelope.disclosure.coverage = null;
      for (const row of envelope.disclosure.items) {
        row.meaning = null;
        row.support_kinds = null;
        row.dependencies = null;
      }
    }
    return JSON.stringify(envelope);
  };
  const snapshotFor = (context, grantId = initialToken, denied = false) => ({
    documentId: initialContext.documentId,
    wire: grantId === initialToken && !denied ? wire : wireFor(grantId, denied),
  });
  const calls = {
    activeDocumentId: 0,
    providerOpenWord: 0,
    currentSemanticRequest: 0,
    semanticInvalidationWatch: 0,
    semanticInvalidationUnwatch: 0,
    semanticRefresh: 0,
    cabScopeRead: 0,
    cabInvalidationWatch: 0,
    applyCommitted: 0,
    wordRun: 0,
    sourceActiveDocumentId: 0,
    sourceOpen: 0,
    sourceCurrentBinding: 0,
    sourceInvalidationWatch: 0,
    sourceRead: 0,
  };
  const canaries = {
    cab: 'CAB_PRIVILEGED_READ_CANARY_42',
    source: 'SOURCE_MARKING_READ_CANARY_51',
    write: 'WORD_WRITE_CANARY_63',
  };
  const state = {
    calls,
    canaries,
    wire,
    scenario,
    get context() {
      return { ...currentContext };
    },
    bootComplete: false,
    error: null,
    invalidateSemantic: null,
    malformedGrant: null,
    delayNextActiveDocumentIdCheck: false,
    activeDocumentIdPending: false,
    releaseDelayedActiveDocumentIdCheck: null,
    delayNextDocumentCheck() {
      this.delayNextActiveDocumentIdCheck = true;
    },
    releaseDelayedDocumentCheck() {
      this.releaseDelayedActiveDocumentIdCheck?.();
    },
    setMalformedGrant(kind) {
      this.malformedGrant = kind;
    },
    advanceContext() {
      currentContext = {
        ...currentContext,
        revisionId: 'document-revision-16',
        principalRevision: 'principal-revision-5',
        evaluationId: 'evaluation-token-28',
      };
      currentGrantId = 'a2'.repeat(16);
      currentRows = fullRows();
      currentCoverage = true;
    },
    denyCurrentGrant() {
      currentGrantId = 'b2'.repeat(16);
      currentRows = deniedRows();
      currentCoverage = false;
    },
    advanceGrantSameContext() {
      currentGrantId = 'c3'.repeat(16);
      currentRows = fullRows();
      currentCoverage = true;
    },
  };
  window.publicReversalSmoke = state;
  window.Office = {
    HostType: { Word: 'Word' },
    EventType: { DocumentSelectionChanged: 'selection' },
    context: { document: { addHandlerAsync() {} }, requirements: { isSetSupported: () => false } },
    onReady: async (callback) => {
      try {
        await callback({ host: 'Word' });
      } catch (error) {
        state.error = String(error);
      } finally {
        state.bootComplete = true;
      }
    },
  };
  window.Word = {
    run: async () => {
      calls.wordRun++;
      throw new Error('restricted viewer unexpectedly touched the Word document APIs');
    },
  };
  window.marqueOfficeWorkspace = {
    nativeMaxBytes: 4096,
    provider: {
      async openWord() {
        calls.providerOpenWord++;
        if (scenario === 'provider-open-error') throw new Error('synthetic provider open failure');
        return {
          kind: 'native_semantic_results',
          documentId: initialContext.documentId,
          viewerId: initialContext.viewerId,
          nativeSemanticResults: snapshotFor(initialContext),
          ...(['stale-session-retry', 'same-context-grant-change', 'overlapping-refresh', 'malformed-grant'].includes(scenario)
            ? {
                async readNativeSemanticResults() {
                  calls.semanticRefresh++;
                  if (scenario === 'stale-session-retry') {
                    if (calls.semanticRefresh === 1) return snapshotFor(initialContext);
                    return snapshotFor(currentContext, currentGrantId);
                  }
                  if (scenario === 'overlapping-refresh' || scenario === 'malformed-grant')
                    return snapshotFor(currentContext, currentGrantId);
                  if (calls.semanticRefresh === 1) return snapshotFor(currentContext, currentGrantId, true);
                  if (calls.semanticRefresh === 2) return snapshotFor(currentContext, 'b2'.repeat(16), true);
                  return snapshotFor(currentContext, currentGrantId);
                },
              }
            : {}),
        };
      },
    },
    wordHost: {
      async activeDocumentId() {
        calls.activeDocumentId++;
        if (scenario === 'overlapping-refresh' && state.delayNextActiveDocumentIdCheck) {
          state.delayNextActiveDocumentIdCheck = false;
          state.activeDocumentIdPending = true;
          return new Promise((resolve) => {
            state.releaseDelayedActiveDocumentIdCheck = () => {
              state.activeDocumentIdPending = false;
              state.releaseDelayedActiveDocumentIdCheck = null;
              resolve(initialContext.documentId);
            };
          });
        }
        if (scenario === 'cross-document-decline' && calls.activeDocumentId === 1) return 'other-document';
        if (scenario === 'navigation-before-results-read' && calls.activeDocumentId > 1) return 'other-document';
        return initialContext.documentId;
      },
      async readNativeSemanticResultsRequest() {
        calls.currentSemanticRequest++;
        const current = requestFor(currentContext);
        if (state.malformedGrant === 'rows')
          return { ...current, grant: { ...current.grant, rows: null } };
        if (state.malformedGrant === 'coverage')
          return { ...current, grant: { ...current.grant, coverage: 'true' } };
        return current;
      },
      watchNativeSemanticResultsInvalidation(_documentId, _viewerId, invalidate) {
        calls.semanticInvalidationWatch++;
        let active = true;
        const notify = () => {
          if (active) invalidate();
        };
        state.invalidateSemantic = notify;
        return () => {
          if (!active) return;
          active = false;
          calls.semanticInvalidationUnwatch++;
          if (state.invalidateSemantic === notify) state.invalidateSemantic = null;
        };
      },
      async readNativeCabScope() {
        calls.cabScopeRead++;
        return { canary: canaries.cab };
      },
      watchNativeCabInvalidation() {
        calls.cabInvalidationWatch++;
        return () => {};
      },
      async applyCommitted() {
        calls.applyCommitted++;
        return { canary: canaries.write };
      },
    },
  };
  // The restricted branch must return before consulting this separately installed
  // privileged source-marking provider, even when the global capability exists.
  window.marqueOfficeSourceMarking = {
    maxBytes: 4096,
    async activeDocumentId() {
      calls.sourceActiveDocumentId++;
      return initialContext.documentId;
    },
    async open() {
      calls.sourceOpen++;
      return {
        documentId: initialContext.documentId,
        binding: {
          chain_id: 'secret-chain',
          source_id: 'secret-source',
          revision_id: 'secret-revision',
          contribution_id: 'secret-contribution',
          scope_id: 'secret-scope',
          viewer_id: initialContext.viewerId,
        },
        async currentBinding() {
          calls.sourceCurrentBinding++;
          return null;
        },
        isCurrent: () => true,
        watchInvalidation() {
          calls.sourceInvalidationWatch++;
          return () => {};
        },
        async read() {
          calls.sourceRead++;
          return JSON.stringify({ secret: canaries.source });
        },
      };
    },
  };
})();
