// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

import type { UserConfig } from 'vite';
import { defineConfig } from 'vite-plus';

const config: UserConfig = defineConfig({
  fmt: {
    // memo.vocab.json and memo.manual.json are written by fixtures/extract.py, as it writes them.
    ignorePatterns: [
      'dist/**',
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
    ignorePatterns: ['dist/**'],
    options: { typeAware: true, typeCheck: true },
  },
  // DOM tests only (test/dom/); the rest run in node as written (node --test).
  test: {
    include: ['test/dom/**/*.test.ts'],
    environment: 'happy-dom',
  },
  pack: {
    entry: ['src/render.ts', 'src/marking.ts', 'src/state.ts', 'src/help.ts', 'src/theme.ts', 'src/types.ts'],
    format: ['esm'],
    platform: 'browser',
    target: 'es2023',
    dts: true,
    sourcemap: true,
    // The stylesheets ship as written, beside the modules.
    copy: ['src/theme.css', 'src/kit.css'],
  },
});

export default config;
