// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

import type { UserConfig } from 'vite';
import { defineConfig } from 'vite-plus';

const config: UserConfig = defineConfig({
  pack: {
    entry: ['src/state.ts', 'src/types.ts'],
    format: ['esm'],
    // No DOM: core runs in a page, in node, and in Outlook's send handler.
    platform: 'neutral',
    target: 'es2023',
    dts: true,
    sourcemap: true,
  },
});

export default config;
