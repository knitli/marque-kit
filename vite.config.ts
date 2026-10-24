// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

import type { UserConfig } from 'vite';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vite-plus';

// The workspace root: format and lint for every package, and the demo's dev server.
// Each package's own vite.config.ts builds and tests it.
const config: UserConfig = defineConfig({
  // Workspace packages resolve to their TypeScript source (the "source" export condition), not dist/.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  fmt: {
    // memo.vocab.json and memo.manual.json are written by fixtures/extract.py, as it writes them.
    ignorePatterns: [
      '**/dist/**',
      'pnpm-lock.yaml',
      'fixtures/memo.vocab.json',
      'fixtures/memo.manual.json',
      // Prose: a list renumbered or a line rewrapped changes what the docs say (¶ numbers are the memo's).
      '**/*.md',
    ],
    singleQuote: true,
    printWidth: 120,
  },
  lint: {
    ignorePatterns: ['**/dist/**'],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // Core runs where there may be no page: Outlook's send handler. DOM types are fine; DOM values are not.
        files: ['packages/core/**'],
        rules: {
          'no-restricted-globals': [
            'error',
            'document',
            'window',
            'navigator',
            'getComputedStyle',
            'customElements',
            'ResizeObserver',
            'MutationObserver',
          ],
        },
      },
    ],
  },
});

export default config;
