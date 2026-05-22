#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const [pluginVersion] = process.argv.slice(2);
if (!pluginVersion) { console.error('Usage: update-npx-pin.mjs <plugin-version>'); process.exit(1); }

const coreeVersion = pluginVersion.replace(/-\d+$/, '');

function replacePin(file) {
  const content = fs.readFileSync(file, 'utf8');
  const updated = content.replace(/@coree-ai\/coree@\d+\.\d+\.\d+/g, `@coree-ai/coree@${coreeVersion}`);
  if (content !== updated) { fs.writeFileSync(file, updated); console.log(`  updated ${path.relative(REPO_ROOT, file)}`); }
  else { console.warn(`  warning: no replacement in ${path.relative(REPO_ROOT, file)}`); }
}

console.log(`npx pin -> ${coreeVersion}\n`);
replacePin(path.join(REPO_ROOT, 'gemini-extension.json'));
replacePin(path.join(REPO_ROOT, 'hooks/hooks.json'));
