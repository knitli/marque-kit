// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

const targets = await (await fetch('http://127.0.0.1:46882/json/list')).json();
const ws = new WebSocket(targets.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const v = JSON.parse(e.data);
  if (v.id && pending.has(v.id)) {
    const [r, j] = pending.get(v.id);
    pending.delete(v.id);
    if (v.error) j(Error(v.error.message));
    else r(v.result);
  }
};
const call = (method, params = {}) =>
  new Promise((r, j) => {
    const k = ++id;
    pending.set(k, [r, j]);
    ws.send(JSON.stringify({ id: k, method, params }));
  });
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function wait(condition) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(condition)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('timeout ' + condition + ' ' + (await evaluate('document.body.innerText')));
}
const nav = async (suffix) => {
  await call('Page.navigate', { url: 'http://127.0.0.1:46881/taskpane.html' + suffix });
  await wait('!!window.smoke');
};
await call('Page.enable');
await nav('');
await wait('!!document.querySelector("body > section .mq-mark")');
let initial = await evaluate(
  '({text:document.querySelector("body > section").innerText,html:document.querySelector("body > section").outerHTML})',
);
if (
  !initial.html.includes('mq-conceal') ||
  !initial.html.includes('mq-mask') ||
  initial.html.includes('doc-source-17') ||
  initial.html.includes('authorized-reviewer')
)
  throw Error('bad projection ' + JSON.stringify(initial));
await evaluate(
  '(()=>{let w=JSON.parse(window.smoke.baseWire);w.marking={text:"FORGED_SAME_BINDING",layers:[{tokens:[{t:"FORGED_SAME_BINDING"}]}],masks:[]};window.dispatchEvent(new CustomEvent("marque-source-marking",{detail:JSON.stringify(w)}))})()',
);
if (await evaluate('document.querySelector("body > section").innerText.includes("FORGED_SAME_BINDING")'))
  throw Error('untrusted same-binding payload rendered');
await evaluate('window.smoke.active=false;window.smoke.watch()');
if (await evaluate('!!document.querySelector("body > section .mq-mark")'))
  throw Error('view remained after invalidation');
await evaluate(
  'window.smoke.active=true;window.smoke.delay=true;document.querySelector("body > section button").click()',
);
await wait('!!window.smoke.resolve');
await evaluate('window.smoke.active=false;window.smoke.watch();window.smoke.resolve()');
await new Promise((r) => setTimeout(r, 200));
if (await evaluate('!!document.querySelector("body > section .mq-mark")')) throw Error('stale response restored');
await evaluate(
  'window.smoke.active=true;window.smoke.delay=false;window.smoke.binding.revision_id="rev-stale";document.querySelector("body > section button").click()',
);
await new Promise((r) => setTimeout(r, 200));
if (await evaluate('!!document.querySelector("body > section .mq-mark")')) throw Error('mismatched revision visible');
await evaluate(
  'window.smoke.binding.revision_id="rev-4";window.smoke.documentId="other-document";document.querySelector("body > section button").click()',
);
await new Promise((r) => setTimeout(r, 200));
if (await evaluate('!!document.querySelector("body > section .mq-mark")')) throw Error('wrong document visible');
for (const key of ['chain_id', 'source_id', 'contribution_id', 'scope_id', 'viewer_id']) {
  await evaluate(
    `window.smoke.documentId="doc-1";window.smoke.binding[${JSON.stringify(key)}]="wrong";document.querySelector("body > section button").click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (await evaluate('!!document.querySelector("body > section .mq-mark")'))
    throw Error('mismatched ' + key + ' visible');
  await evaluate(
    `window.smoke.binding[${JSON.stringify(key)}]=JSON.parse(window.smoke.wire).binding[${JSON.stringify(key)}]`,
  );
}
await evaluate(
  '(()=>{let w=JSON.parse(window.smoke.wire);w.secret="HIDDEN_CANARY_945";window.smoke.wire=JSON.stringify(w);document.querySelector("body > section button").click()})()',
);
await new Promise((r) => setTimeout(r, 100));
if (
  await evaluate(
    '!!document.querySelector("body > section .mq-mark") || document.documentElement.outerHTML.includes("HIDDEN_CANARY_945")',
  )
)
  throw Error('forged raw output visible');
await evaluate(
  '(()=>{let w=JSON.parse(window.smoke.baseWire);w.schema="knitli.native-source-marking.v1";w.authorization="synthetic_test_adapter";window.smoke.wire=JSON.stringify(w);document.querySelector("body > section button").click()})()',
);
await new Promise((r) => setTimeout(r, 100));
if (await evaluate('!!document.querySelector("body > section .mq-mark")'))
  throw Error('synthetic replay accepted on live path');
await nav('?absent');
await new Promise((r) => setTimeout(r, 200));
if (await evaluate('!!document.querySelector("body > section .mq-mark")')) throw Error('missing capability rendered');
console.log(
  JSON.stringify(
    {
      result: 'pass',
      initial,
      untrusted_same_binding: 'pass',
      invalidation: 'pass',
      stale_reply: 'pass',
      revision_mismatch: 'pass',
      document_mismatch: 'pass',
      all_binding_mismatches: 'pass',
      forged_wire_canary: 'pass',
      synthetic_v1_rejected: 'pass',
      missing_capability: 'pass',
    },
    null,
    2,
  ),
);
ws.close();
