#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentScriptPath = path.join(
  __dirname,
  'browser-extension/tidal-quick-queue/content.js'
);
const source = fs.readFileSync(contentScriptPath, 'utf8');

assert.match(
  source,
  /document\.addEventListener\(\s*['"]click['"]\s*,\s*handleInlineButtonClick\s*,\s*true\s*\)/,
  'Content script should delegate inline button clicks from document capture phase'
);

assert.doesNotMatch(
  source,
  /button\.addEventListener\(\s*['"]click['"]/,
  'Inline buttons should not depend on per-node listeners that Amazon can discard'
);

console.log('Extension delegated click tests passed.');
