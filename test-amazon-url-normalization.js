#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

function extractFunction(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Could not find ${functionName}`);
  }

  const bodyStart = source.indexOf('{', start);
  if (bodyStart === -1) {
    throw new Error(`Could not find ${functionName} body`);
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not parse ${functionName}`);
}

function loadFunction(filePath, functionName, prefix = '') {
  const source = fs.readFileSync(filePath, 'utf8');
  const functionSource = extractFunction(source, functionName);
  const sandbox = {
    URL,
    URLSearchParams,
    window: {
      location: {
        origin: 'https://music.amazon.com'
      }
    }
  };

  vm.runInNewContext(`
${prefix}
${functionSource}
this.${functionName} = ${functionName};
`, sandbox);

  return sandbox[functionName];
}

function loadExtensionNormalizeAmazonUrl() {
  const filePath = path.join(repoRoot, 'browser-extension/tidal-quick-queue/content.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const amazonConstants = source
    .split('\n')
    .filter((line) => /^\s*const AMAZON_/.test(line))
    .map((line) => line.trim())
    .join('\n');

  return loadFunction(filePath, 'normalizeAmazonUrl', amazonConstants);
}

const electronMainPaths = [
  path.join(repoRoot, 'tidal-electron-app/electron/main.js'),
  path.join(repoRoot, 'tidal-electron-app/build/electron.js')
].filter((filePath) => fs.existsSync(filePath));

const cleanAmazonUrlFunctions = electronMainPaths.map((filePath) => ({
  filePath,
  cleanAmazonUrl: loadFunction(filePath, 'cleanAmazonUrl')
}));
const normalizeAmazonUrl = loadExtensionNormalizeAmazonUrl();

const albumTrackUrl = 'https://music.amazon.com/albums/B0CR5RZ35F?marketplaceId=ATVPDKIKX0DER&musicTerritory=US&trackAsin=B0CR5P7D5G&ref=dm_sh_example';
const expectedTrackUrl = 'https://music.amazon.com/tracks/B0CR5P7D5G?marketplaceId=ATVPDKIKX0DER&musicTerritory=US';

for (const { filePath, cleanAmazonUrl } of cleanAmazonUrlFunctions) {
  assert.strictEqual(
    cleanAmazonUrl(albumTrackUrl),
    expectedTrackUrl,
    `${path.relative(repoRoot, filePath)} should canonicalize Amazon album row URLs with trackAsin into track share URLs`
  );
}

assert.strictEqual(
  normalizeAmazonUrl(albumTrackUrl),
  expectedTrackUrl,
  'Extension should send Amazon trackAsin rows as track share URLs'
);

assert.strictEqual(
  normalizeAmazonUrl('https://music.amazon.com/tracks/B0CR5P7D5G?ref=dm_sh_example'),
  'https://music.amazon.com/tracks/B0CR5P7D5G',
  'Extension should accept direct Amazon track share URLs'
);

console.log('Amazon URL normalization tests passed.');
