// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

import type { UserConfig } from 'vite';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vite-plus';

const config: UserConfig = defineConfig({
  // @marque/kit-core resolves to its source under test, as it does under node --conditions=source.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // DOM tests only (test/dom/); the rest run in node as written (node --test).
  test: {
    include: ['test/dom/**/*.test.ts'],
    environment: 'happy-dom',
  },
  pack: {
    entry: ['src/render.ts', 'src/marking.ts', 'src/help.ts', 'src/theme.ts'],
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
