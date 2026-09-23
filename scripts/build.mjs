#!/usr/bin/env node
// Validate every recipe, assemble v1/index.json, sign it, and lay out the site GitHub
// Pages publishes. `--check` stops after validation - what CI runs for pull requests.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const SOURCE = 'https://github.com/andyfo/wpl7-catalog';
const BASE_URL = 'https://andyfo.github.io/wpl7-catalog';
const SCHEMA_FILE = 'plugin-recipe.v1.schema.json';

const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema', SCHEMA_FILE), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// --- validate ---------------------------------------------------------------
const recipesDir = path.join(root, 'recipes');
const entries = [];
const seenIds = new Map();
const seenPlugins = new Map();
let problems = 0;
const fail = (file, msg) => {
  console.error(`✗ ${file}: ${msg}`);
  problems++;
};

for (const file of fs.readdirSync(recipesDir).filter((f) => f.endsWith('.json')).sort()) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(recipesDir, file), 'utf8'));
  } catch (err) {
    fail(file, `not valid JSON (${err.message})`);
    continue;
  }
  if (!validate(raw)) {
    fail(file, ajv.errorsText(validate.errors, { separator: '; ' }));
    continue;
  }
  if (path.basename(file, '.json') !== raw.id) {
    fail(file, `the file must be named after the recipe id ("${raw.id}.json")`);
    continue;
  }
  if (seenIds.has(raw.id)) {
    fail(file, `id "${raw.id}" is already used by ${seenIds.get(raw.id)}`);
    continue;
  }
  if (seenPlugins.has(raw.plugin)) {
    fail(file, `plugin "${raw.plugin}" already has a recipe in ${seenPlugins.get(raw.plugin)}`);
    continue;
  }
  seenIds.set(raw.id, file);
  seenPlugins.set(raw.plugin, file);
  entries.push(raw);
  console.log(`✓ ${file}`);
}
if (problems > 0) {
  console.error(`${problems} problem(s) found`);
  process.exit(1);
}
console.log(`${entries.length} recipe(s) valid`);
if (check) process.exit(0);

// --- build ------------------------------------------------------------------
const index = {
  format: 'wpl7-catalog',
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  commit: process.env.GITHUB_SHA ?? null,
  entries,
};
const bytes = Buffer.from(JSON.stringify(index, null, 2) + '\n');

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'v1'), { recursive: true });
fs.writeFileSync(path.join(dist, 'v1', 'index.json'), bytes);

// --- sign -------------------------------------------------------------------
// The signature is over the exact bytes of index.json. Panels verify it with the public
// key baked into them (README), so a mirror or a compromised host cannot feed them content.
const pem = process.env.CATALOG_SIGNING_KEY;
if (pem) {
  const key = crypto.createPrivateKey(pem);
  const pub = crypto.createPublicKey(key);
  const keyId = crypto.createHash('sha256').update(pub.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
  const signature = crypto.sign(null, bytes, key).toString('base64');
  fs.writeFileSync(path.join(dist, 'v1', 'index.json.sig'), JSON.stringify({ alg: 'ed25519', keyId, signature }, null, 2) + '\n');
  console.log(`signed with key ${keyId}`);
} else if (process.env.CI) {
  console.error('CATALOG_SIGNING_KEY is not set; refusing to publish an unsigned index');
  process.exit(1);
} else {
  console.warn('CATALOG_SIGNING_KEY not set: index left unsigned (fine for a local build)');
}

// --- site -------------------------------------------------------------------
fs.mkdirSync(path.join(dist, 'schema'));
fs.copyFileSync(path.join(root, 'schema', SCHEMA_FILE), path.join(dist, 'schema', SCHEMA_FILE));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rows = entries
  .map((e) => `<li><strong>${esc(e.name)}</strong> <code>${esc(e.plugin)}</code>${e.description ? ` – ${esc(e.description)}` : ''}</li>`)
  .join('\n');
fs.writeFileSync(
  path.join(dist, 'index.html'),
  `<!doctype html>
<meta charset="utf-8">
<title>WPL7 catalog</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:48rem;margin:3rem auto;padding:0 1rem;color:#222}code{background:#f3f3f3;padding:0 .3em;border-radius:3px}</style>
<h1>WPL7 catalog</h1>
<p>Shared content for <a href="https://github.com/andyfo/wpl7">WPL7</a> panels. Panels fetch <a href="v1/index.json">v1/index.json</a>
and check it against <a href="v1/index.json.sig">its signature</a>; the format is in <a href="schema/${SCHEMA_FILE}">the schema</a>.
Generated ${esc(index.generatedAt)}${index.commit ? ` from <code>${esc(index.commit.slice(0, 7))}</code>` : ''}.</p>
<h2>Plugin recipes (${entries.length})</h2>
<ul>
${rows}
</ul>
<p>To add one, open a pull request at <a href="${SOURCE}">${SOURCE}</a>.</p>
`,
);
console.log(`built dist/ for ${BASE_URL} (${entries.length} entries)`);
