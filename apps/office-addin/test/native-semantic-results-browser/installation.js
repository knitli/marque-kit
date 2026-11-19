// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

(() => {
  const wire = window.marqueTestFixture;
  const context = {
    documentId: 'word-doc-restricted-7',
    revisionId: 'document-revision-15',
    viewerId: 'restricted-viewer-9',
    principalRevision: 'principal-revision-4',
    evaluationId: 'evaluation-token-27',
  };
  const request = {
    current: { ...context },
    grant: {
      ...context,
      grantId: 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1',
      rows: Array.from({ length: 4 }, () => ({ meaning: true, supportKinds: true, dependencies: true })),
      coverage: true,
    },
  };
  const calls = {
    activeDocumentId: 0,
    providerOpenWord: 0,
    currentSemanticContext: 0,
    semanticInvalidationWatch: 0,
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
    context,
    bootComplete: false,
    error: null,
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
        return {
          kind: 'native_semantic_results',
          documentId: context.documentId,
          viewerId: context.viewerId,
          nativeSemanticResults: { documentId: context.documentId, wire, request },
        };
      },
    },
    wordHost: {
      async activeDocumentId() {
        calls.activeDocumentId++;
        return context.documentId;
      },
      async readNativeSemanticResultsContext() {
        calls.currentSemanticContext++;
        return { ...context };
      },
      watchNativeSemanticResultsInvalidation() {
        calls.semanticInvalidationWatch++;
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
      return context.documentId;
    },
    async open() {
      calls.sourceOpen++;
      return {
        documentId: context.documentId,
        binding: {
          chain_id: 'secret-chain',
          source_id: 'secret-source',
          revision_id: 'secret-revision',
          contribution_id: 'secret-contribution',
          scope_id: 'secret-scope',
          viewer_id: context.viewerId,
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
