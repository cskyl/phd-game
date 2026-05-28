#!/usr/bin/env node
/**
 * Ruleset validator for the AI PhD Simulator.
 *
 * Static checks that catch the mistakes the game engine would only surface at
 * runtime (in the browser), where they are painful to debug:
 *
 *   1. Every YAML file parses.
 *   2. Translation-key parity: every key referenced by events/gui/items/status
 *      exists in BOTH language files (lang.en.yaml and lang.zh.yaml).
 *   3. Every itemId / statusId referenced in events is actually defined.
 *   4. Every expression (condition / probability / requirement / value /
 *      weight / variable update) compiles as JS and only calls functions the
 *      engine's expression evaluator provides.
 *
 * Usage:
 *   node scripts/validate-ruleset.js [rulesetDir]
 *   npm run validate
 *
 * Exits non-zero if any hard error is found (so it is CI-friendly).
 * "Unused translation keys" are reported as warnings only.
 */
'use strict';
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const RULESET_DIR = process.argv[2] ||
  path.join(__dirname, '..', 'static', 'rulesets', 'default');
const LANGS = ['en', 'zh'];

// Functions exposed by EventExpressionEngine (see src/event/expression.ts).
const ALLOWED_FNS = new Set([
  'random', 'randi', 'max', 'min', 'floor', 'round', 'ceil', 'clip',
  'setVarLimits', 'upperBound', 'lowerBound', 'eventOccurred', 'itemCount',
  'totalMonths', 'hasStatus', 'getAttributeValue',
]);

// Literal (non-localized) strings allowed to appear where a key is expected,
// e.g. the language-switch button labels in gui.yaml.
const LITERAL_OK = new Set(['English', '中文']);

const errors = [];
const warnings = [];
const load = (f) => yaml.load(fs.readFileSync(path.join(RULESET_DIR, f), 'utf8'));

// ---- 1. Parse every YAML file -------------------------------------------
let ev, items, status, gui;
try {
  ev = load('events.yaml');
  items = load('items.yaml');
  status = load('status.yaml');
  gui = load('gui.yaml');
  load('attributes.yaml');
  LANGS.forEach((l) => load(`lang.${l}.yaml`));
} catch (e) {
  console.error('YAML PARSE ERROR:', e.message);
  process.exit(1);
}

// ---- 2. Collect required translation keys -------------------------------
// Fields whose string values are translation keys.
const KEY_FIELDS = ['message', 'confirm', 'messageTitle', 'confirmText',
  'text', 'title', 'preamble'];
const required = new Set();
function collectKeys(node) {
  if (Array.isArray(node)) return node.forEach(collectKeys);
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (k === 'messages' && Array.isArray(v)) {
        v.forEach((s) => typeof s === 'string' && required.add(s));
      } else if (KEY_FIELDS.includes(k) && typeof v === 'string') {
        required.add(v);
      } else {
        collectKeys(v);
      }
    }
  }
}
collectKeys(ev);
collectKeys(gui);
items.items.forEach((i) => {
  required.add(`item.${i.id}`);
  required.add(`item.${i.id}.description`);
});
status.status.forEach((s) => {
  required.add(`status.${s.id}`);
  required.add(`status.${s.id}.description`);
});

for (const lang of LANGS) {
  const dict = load(`lang.${lang}.yaml`);
  const have = new Set(Object.keys(dict));
  const missing = [...required].filter((k) => !have.has(k) && !LITERAL_OK.has(k)).sort();
  const unused = [...have].filter((k) => !required.has(k)).sort();
  if (missing.length) {
    errors.push(`lang.${lang}.yaml is MISSING ${missing.length} key(s):\n    ` +
      missing.join('\n    '));
  }
  if (unused.length) {
    warnings.push(`lang.${lang}.yaml has ${unused.length} unused key(s): ` +
      unused.join(', '));
  }
}

// ---- 3. Item / status reference integrity -------------------------------
const itemIds = new Set(items.items.map((i) => i.id));
const statusIds = new Set(status.status.map((s) => s.id));
const badItems = new Set();
const badStatus = new Set();
function checkRefs(node) {
  if (Array.isArray(node)) return node.forEach(checkRefs);
  if (node && typeof node === 'object') {
    if (node.itemId && !itemIds.has(node.itemId)) badItems.add(node.itemId);
    if (node.statusId && !statusIds.has(node.statusId)) badStatus.add(node.statusId);
    // UpdateItemAmounts uses item ids as the keys of its `updates` map.
    if (node.id === 'UpdateItemAmounts' && node.updates) {
      for (const k of Object.keys(node.updates)) {
        if (!itemIds.has(k)) badItems.add(k);
      }
    }
    Object.values(node).forEach(checkRefs);
  }
}
checkRefs(ev);
if (badItems.size) errors.push(`Unknown itemId references: ${[...badItems].join(', ')}`);
if (badStatus.size) errors.push(`Unknown statusId references: ${[...badStatus].join(', ')}`);

// ---- 4. Expression compile check ----------------------------------------
// Mirror the engine's compile step well enough to catch JS syntax errors and
// calls to functions the evaluator does not provide. Variable references are
// replaced with `1`; only function-call identifiers are kept and checked.
const EXPR_FIELDS = ['condition', 'expression', 'requirement', 'probability',
  'value', 'weight'];
const exprs = [];
function collectExprs(node) {
  if (Array.isArray(node)) return node.forEach(collectExprs);
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (EXPR_FIELDS.includes(k) && typeof v === 'string') {
        exprs.push({ field: k, src: v });
      } else if (k === 'updates' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const vk of Object.keys(v)) {
          if (typeof v[vk] === 'string') exprs.push({ field: `updates.${vk}`, src: v[vk] });
        }
      } else {
        collectExprs(v);
      }
    }
  }
}
collectExprs(ev);

const STUB = '"use strict";const random=()=>0.5,randi=()=>1,max=Math.max,min=Math.min,' +
  'floor=Math.floor,round=Math.round,ceil=Math.ceil,clip=(x,a,b)=>x,setVarLimits=()=>0,' +
  'upperBound=()=>1,lowerBound=()=>0,eventOccurred=()=>true,itemCount=()=>1,' +
  'totalMonths=()=>1,hasStatus=()=>1,getAttributeValue=()=>0.1;';
const IDRE = /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/g;
function transform(src) {
  let out = '', last = 0, m; const bad = [];
  IDRE.lastIndex = 0;
  while ((m = IDRE.exec(src))) {
    out += src.slice(last, m.index);
    const tok = m[0];
    let a = m.index + tok.length;
    while (src[a] === ' ') a++;
    const isCall = src[a] === '(';
    if (isCall) {
      out += tok;
      if (!ALLOWED_FNS.has(tok) && tok !== 'true' && tok !== 'false') bad.push(tok);
    } else {
      out += (tok === 'true' || tok === 'false') ? tok : '1';
    }
    last = m.index + tok.length;
  }
  out += src.slice(last);
  return { out, bad };
}
const seen = new Set();
for (const { field, src } of exprs) {
  const key = field + '||' + src;
  if (seen.has(key)) continue;
  seen.add(key);
  const { out, bad } = transform(src);
  let err = null;
  try { new Function(STUB + 'return (' + out + ');')(); } catch (e) { err = e.message; }
  if (bad.length) errors.push(`Expression [${field}] uses unknown fn ${[...new Set(bad)].join(',')}: ${src}`);
  if (err) errors.push(`Expression [${field}] failed to compile (${err}): ${src}`);
}

// ---- Report -------------------------------------------------------------
console.log(`Ruleset: ${RULESET_DIR}`);
console.log(`events=${ev.length}  items=${items.items.length}  status=${status.status.length}  ` +
  `required keys=${required.size}  expressions checked=${seen.size}`);
warnings.forEach((w) => console.log('WARN: ' + w));
if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log('OK: all checks passed.');
