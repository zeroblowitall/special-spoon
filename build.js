#!/usr/bin/env node
/* Driftgarden build script.
 * Usage: node build.js
 * Requires only Node.js — no packages. Assembles engine/ into a single
 * self-contained dist/driftgarden.html with an empty (null) world, ready
 * to come alive the first time someone opens it.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENGINE = path.join(ROOT, 'engine');
const DIST = path.join(ROOT, 'dist');

function fail(message) {
  console.error('BUILD FAILED: ' + message);
  process.exit(1);
}

const shell = fs.readFileSync(path.join(ENGINE, 'shell.html'), 'utf8');
const style = fs.readFileSync(path.join(ENGINE, 'style.css'), 'utf8');
const world = fs.readFileSync(path.join(ENGINE, 'world.js'), 'utf8');
const app = fs.readFileSync(path.join(ENGINE, 'app.js'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;

// The engine must be able to rebuild the file from inside a browser
// (the Preserve button), which forbids nested '</script>' sequences.
for (const [name, src] of [['world.js', world], ['app.js', app]]) {
  if (/<\/script>/i.test(src.replace(/<\\\/script>/g, ''))) {
    fail(`engine/${name} contains a literal </script>, which would break the self-writing file`);
  }
}

let html = shell;
html = html.replace('/*__STYLE__*/', () => style);
html = html.replace('/*__STATE__*/', () => 'null /* driftgarden v' + version + ' */');
html = html.replace('/*__WORLD__*/', () => world);
html = html.replace('/*__APP__*/', () => app);
if (html.includes('/*__')) fail('an unfilled placeholder remains in the shell');

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'driftgarden.html');
fs.writeFileSync(out, html, 'utf8');

// A hosted copy for phones: GitHub Pages serves docs/ — the same file,
// just reachable by URL. A world born there lives in the visitor's browser.
const DOCS = path.join(ROOT, 'docs');
fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, 'index.html'), html, 'utf8');

const bytes = fs.statSync(out).size;
const kb = (bytes / 1024).toFixed(1);
console.log(`Built dist/driftgarden.html + docs/index.html (v${version}) — ${kb} KB`);
if (bytes > 20 * 1024 * 1024) {
  fail('the file has grown past 20 MB — it can no longer travel by plain email (MISSION principle 1)');
}
