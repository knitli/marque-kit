// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UserConfig } from 'vite';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vite-plus';

// Office loads a task pane over HTTPS only. office-addin-dev-certs puts a trusted localhost
// certificate here; installing it is the developer's step (README), since it changes the keychain.
const certs = join(homedir(), '.office-addin-dev-certs');
const https = existsSync(join(certs, 'localhost.crt'))
  ? { cert: readFileSync(join(certs, 'localhost.crt')), key: readFileSync(join(certs, 'localhost.key')) }
  : undefined;

const config: UserConfig = defineConfig({
  // The kit and core resolve to their source, as in the demo and the tests.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // manifest.xml names this origin; Word won't load the pane from another.
  server: { port: 3000, strictPort: true, ...(https && { https }) },
  build: { rollupOptions: { input: 'taskpane.html' } },
});

export default config;
