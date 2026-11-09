// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { UserConfig } from 'vite';
import { defineConfig } from 'vite-plus';

const config: UserConfig = defineConfig({
  pack: {
    entry: ['src/attention.ts', 'src/marking.ts', 'src/state.ts', 'src/types.ts'],
    format: ['esm'],
    // No DOM: core runs in a page, in node, and in Outlook's send handler.
    platform: 'neutral',
    target: 'es2023',
    dts: true,
    sourcemap: true,
  },
});

export default config;
