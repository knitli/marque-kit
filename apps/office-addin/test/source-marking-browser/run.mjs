// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after the add-in build. Only this local test server injects the fake Office capability.
const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../dist');
const profile = await mkdtemp(join(tmpdir(), 'marque-browser-'));
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    if (path === '/trusted-fixture.js') {
      const fixture = await readFile(
        resolve(here, '../../../../packages/kit/test/fixtures/native-source-marking.fixture'),
        'utf8',
      );
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`window.marqueTestFixture = ${JSON.stringify(fixture)};`);
      return;
    }
    if (path === '/installation.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(await readFile(join(here, 'installation.js')));
      return;
    }
    const file = resolve(dist, `.${path}`);
    if (!file.startsWith(dist + '/')) throw new Error('outside build');
    const bytes = await readFile(file);
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[extname(file)] ?? 'application/octet-stream',
    );
    response.end(
      path === '/taskpane.html'
        ? bytes
            .toString()
            .replace(
              '<script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>',
              '<script src="/trusted-fixture.js"></script><script src="/installation.js"></script>',
            )
        : bytes,
    );
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(46881, '127.0.0.1', resolve));
const chrome = spawn(
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=46882', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
try {
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch('http://127.0.0.1:46882/json/list');
      break;
    } catch (error) {
      if (attempt === 99) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const driver = spawn(process.execPath, [join(here, 'driver.mjs')], { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    driver.once('error', reject);
    driver.once('exit', resolve);
  });
  if (code !== 0) process.exitCode = 1;
} finally {
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill();
    await exited;
  }
  server.close();
  await rm(profile, { recursive: true, force: true });
}
