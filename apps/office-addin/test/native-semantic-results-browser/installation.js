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
  const requestFor = (context, grantId = initialToken) => ({
    current: { ...context },
    grant: {
      ...context,
      grantId,
      rows: Array.from({ length: 4 }, () => ({ meaning: true, supportKinds: true, dependencies: true })),
      coverage: true,
    },
  });
  const snapshotFor = (context, grantId = initialToken) => ({
    documentId: initialContext.documentId,
    wire: grantId === initialToken ? wire : wire.replace(initialToken, grantId),
    request: requestFor(context, grantId),
  });
  const calls = {
    activeDocumentId: 0,
    providerOpenWord: 0,
    currentSemanticContext: 0,
    semanticInvalidationWatch: 0,
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
    advanceContext() {
      currentContext = {
        ...currentContext,
        revisionId: 'document-revision-16',
        principalRevision: 'principal-revision-5',
        evaluationId: 'evaluation-token-28',
      };
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
          ...(scenario === 'stale-session-retry'
            ? {
                async readNativeSemanticResults() {
                  calls.semanticRefresh++;
                  if (calls.semanticRefresh === 1) return snapshotFor(initialContext);
                  return snapshotFor(currentContext, 'a2'.repeat(16));
                },
              }
            : {}),
        };
      },
    },
    wordHost: {
      async activeDocumentId() {
        calls.activeDocumentId++;
        if (scenario === 'cross-document-decline' && calls.activeDocumentId === 1) return 'other-document';
        if (scenario === 'navigation-before-results-read' && calls.activeDocumentId > 1) return 'other-document';
        return initialContext.documentId;
      },
      async readNativeSemanticResultsContext() {
        calls.currentSemanticContext++;
        return { ...currentContext };
      },
      watchNativeSemanticResultsInvalidation(_documentId, _viewerId, invalidate) {
        calls.semanticInvalidationWatch++;
        state.invalidateSemantic = invalidate;
        return () => {};
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
