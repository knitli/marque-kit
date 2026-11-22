// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

const pages = await (await fetch('http://127.0.0.1:46882/json/list')).json();
const ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const [resolve, reject] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(Error(message.error.message));
  else resolve(message.result);
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, [resolve, reject]);
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(`Timed out waiting for ${expression}: ${await evaluate('document.body.innerText')}`);
}
const expectedZero = [
  'cabScopeRead',
  'cabInvalidationWatch',
  'applyCommitted',
  'wordRun',
  'sourceActiveDocumentId',
  'sourceOpen',
  'sourceCurrentBinding',
  'sourceInvalidationWatch',
  'sourceRead',
];
async function navigate(scenario) {
  await call('Page.navigate', { url: `http://127.0.0.1:46881/taskpane.html?scenario=${scenario}` });
  await waitFor(
    `window.publicReversalSmoke?.scenario === ${JSON.stringify(scenario)} && window.publicReversalSmoke.bootComplete`,
  );
}
async function snapshot() {
  return evaluate(`(() => {
    const pane = document.querySelector('#pane');
    const smoke = window.publicReversalSmoke;
    const html = document.documentElement.outerHTML;
    const text = pane?.innerText ?? '';
    const calls = { ...smoke.calls };
    const bad = Object.entries(smoke.canaries).filter(([, value]) => html.includes(value) || text.includes(value));
    return {
      text,
      calls,
      badCanaries: bad.map(([name]) => name),
      sourceMarkingGlobalInstalled: !!window.marqueOfficeSourceMarking,
      bootError: smoke.error,
      controls: pane?.querySelectorAll('button, input, form').length ?? -1,
    };
  })()`);
}
function assertNoPrivilegedCalls(result, scenario) {
  if (result.badCanaries.length) throw Error(`${scenario}: canaries appeared in DOM: ${result.badCanaries.join(', ')}`);
  if (!result.sourceMarkingGlobalInstalled)
    throw Error(`${scenario}: source-marking global was not installed for the test`);
  for (const name of expectedZero) {
    if (result.calls[name] !== 0) throw Error(`${scenario}: expected zero ${name}, observed ${result.calls[name]}`);
  }
}
function assertUnavailable(result, scenario) {
  if (!result.text.includes('This Word workspace is unavailable for the current document.'))
    throw Error(`${scenario}: provider failure did not stay unavailable: ${result.text}`);
}

await call('Page.enable');
const outcomes = [];

await navigate('restricted-current');
await waitFor('document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
let current = await snapshot();
assertNoPrivilegedCalls(current, 'restricted-current');
if (current.bootError || !current.text.includes('CLASSIFIED BY') || current.controls !== 0)
  throw Error(`restricted-current: sanitized view failed: ${JSON.stringify(current)}`);
if (
  current.calls.providerOpenWord !== 1 ||
  current.calls.currentSemanticRequest !== 1 ||
  current.calls.semanticInvalidationWatch !== 1
)
  throw Error(`restricted-current: expected only the sanitized provider path: ${JSON.stringify(current.calls)}`);
outcomes.push({ scenario: 'restricted-current', result: 'pass', calls: current.calls, rows: 4, canaries: 'clear' });

for (const scenario of ['provider-open-error', 'cross-document-decline']) {
  await navigate(scenario);
  current = await snapshot();
  assertNoPrivilegedCalls(current, scenario);
  assertUnavailable(current, scenario);
  if (current.calls.providerOpenWord !== 1)
    throw Error(`${scenario}: provider open count was ${current.calls.providerOpenWord}`);
  if (current.calls.currentSemanticRequest !== 0) throw Error(`${scenario}: stale/unbound session read current grant`);
  outcomes.push({ scenario, result: 'pass', calls: current.calls, pane: 'unavailable', canaries: 'clear' });
}

await navigate('navigation-before-results-read');
await waitFor('document.querySelector("#pane")?.innerText.includes("current result disclosure is unavailable")');
current = await snapshot();
assertNoPrivilegedCalls(current, 'navigation-before-results-read');
if (
  current.calls.activeDocumentId !== 2 ||
  current.calls.currentSemanticRequest !== 0 ||
  current.calls.semanticInvalidationWatch !== 0
)
  throw Error(
    `navigation-before-results-read: a stale navigation reached the semantic provider: ${JSON.stringify(current.calls)}`,
  );
if (current.text.includes('CLASSIFIED BY'))
  throw Error('navigation-before-results-read: stale result rows remained visible');
outcomes.push({
  scenario: 'navigation-before-results-read',
  result: 'pass',
  calls: current.calls,
  rows: 0,
  canaries: 'clear',
});

await navigate('same-context-grant-change');
await waitFor('document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
const contextBeforeGrantChange = await evaluate('window.publicReversalSmoke.context');
await evaluate('window.publicReversalSmoke.denyCurrentGrant(); document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 1 && document.querySelector("#pane")?.innerText.includes("4 selected result rows")',
);
current = await snapshot();
assertNoPrivilegedCalls(current, 'same-context-denied-grant');
if (current.text.includes('CLASSIFIED BY')) throw Error('same-context-denied-grant: denied meaning remained visible');
if (current.text.includes('Classification authority evidence'))
  throw Error('same-context-denied-grant: denied support kinds remained visible');
if (current.text.includes('complete')) throw Error('same-context-denied-grant: denied coverage remained visible');
if (JSON.stringify(await evaluate('window.publicReversalSmoke.context')) !== JSON.stringify(contextBeforeGrantChange))
  throw Error('same-context-denied-grant: context unexpectedly changed');
await evaluate('window.publicReversalSmoke.advanceGrantSameContext(); document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 2 && document.querySelector("#pane")?.innerText.includes("current result disclosure is unavailable")',
);
current = await snapshot();
assertNoPrivilegedCalls(current, 'same-context-stale-grant-token');
if (current.text.includes('CLASSIFIED BY'))
  throw Error('same-context-stale-grant-token: stale-token rows remained visible');
if (JSON.stringify(await evaluate('window.publicReversalSmoke.context')) !== JSON.stringify(contextBeforeGrantChange))
  throw Error('same-context-stale-grant-token: context unexpectedly changed');
await evaluate('document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 3 && document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")',
);
current = await snapshot();
assertNoPrivilegedCalls(current, 'same-context-current-grant');
if (current.calls.currentSemanticRequest !== 4 || current.controls !== 1)
  throw Error(`same-context-current-grant: grant binding mismatch: ${JSON.stringify(current.calls)}`);
outcomes.push({
  scenario: 'same-context-grant-change',
  result: 'pass',
  calls: current.calls,
  deniedGrantHidden: true,
  staleGrantRejected: true,
  currentGrantRestored: true,
  canaries: 'clear',
});

await navigate('stale-session-retry');
await waitFor('document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
await evaluate('window.publicReversalSmoke.advanceContext(); window.publicReversalSmoke.invalidateSemantic()');
await waitFor('!document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
await evaluate('document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 1 && window.publicReversalSmoke.calls.currentSemanticRequest === 2',
);
current = await snapshot();
assertNoPrivilegedCalls(current, 'stale-session-retry-first');
if (current.text.includes('CLASSIFIED BY')) throw Error('stale-session-retry-first: stale rows were restored');
await evaluate('document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 2 && document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")',
);
current = await snapshot();
assertNoPrivilegedCalls(current, 'stale-session-retry-second');
if (current.calls.currentSemanticRequest !== 3 || current.controls !== 1)
  throw Error(`stale-session-retry-second: retry binding mismatch: ${JSON.stringify(current.calls)}`);
outcomes.push({
  scenario: 'stale-session-retry',
  result: 'pass',
  calls: current.calls,
  rows: 4,
  staleRowsCleared: true,
  canaries: 'clear',
});

await navigate('overlapping-refresh');
await waitFor('document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
await evaluate('window.publicReversalSmoke.delayNextDocumentCheck(); document.querySelector("#pane button")?.click()');
await waitFor('window.publicReversalSmoke.activeDocumentIdPending');
await evaluate('document.querySelector("#pane button")?.click()');
await waitFor(
  'window.publicReversalSmoke.calls.semanticRefresh === 1 && document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")',
);
await evaluate('window.publicReversalSmoke.releaseDelayedDocumentCheck()');
await waitFor('!window.publicReversalSmoke.activeDocumentIdPending');
current = await snapshot();
assertNoPrivilegedCalls(current, 'overlapping-refresh-before-invalidation');
if (current.calls.semanticInvalidationUnwatch !== 0)
  throw Error(`overlapping-refresh: stale refresh removed B's watcher: ${JSON.stringify(current.calls)}`);
await evaluate('window.publicReversalSmoke.invalidateSemantic?.()');
await waitFor('!document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
current = await snapshot();
assertNoPrivilegedCalls(current, 'overlapping-refresh-invalidated');
if (current.calls.semanticRefresh !== 1 || current.calls.currentSemanticRequest !== 2)
  throw Error(`overlapping-refresh: invalidation caused a provider read: ${JSON.stringify(current.calls)}`);
outcomes.push({
  scenario: 'overlapping-refresh',
  result: 'pass',
  calls: current.calls,
  newerWatcherSurvivedStaleAttempt: true,
  invalidationClearedRows: true,
  canaries: 'clear',
});

await navigate('malformed-grant');
await waitFor('document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
for (const kind of ['rows', 'coverage']) {
  await evaluate(
    `window.publicReversalSmoke.setMalformedGrant(${JSON.stringify(kind)}); document.querySelector("#pane button")?.click()`,
  );
  await waitFor(
    `window.publicReversalSmoke.calls.semanticRefresh === ${kind === 'rows' ? 1 : 2} && window.publicReversalSmoke.calls.currentSemanticRequest === ${kind === 'rows' ? 2 : 3}`,
  );
  await waitFor('!document.querySelector("#pane")?.innerText.includes("CLASSIFIED BY")');
  current = await snapshot();
  assertNoPrivilegedCalls(current, `malformed-grant-${kind}`);
  if (current.calls.semanticInvalidationUnwatch !== 0)
    throw Error(`malformed-grant-${kind}: malformed response changed watcher state`);
}
outcomes.push({
  scenario: 'malformed-grant',
  result: 'pass',
  calls: current.calls,
  malformedRowsRejected: true,
  malformedCoverageRejected: true,
  staleRowsCleared: true,
  canaries: 'clear',
});

console.log(JSON.stringify({ result: 'pass', route: 'built Word taskpane', scenarios: outcomes }, null, 2));
ws.close();
