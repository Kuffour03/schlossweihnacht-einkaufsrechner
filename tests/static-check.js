'use strict';
// Statische Prüfung von index.html: Skripte lassen sich übersetzen, keine externen
// Abhängigkeiten, Element-IDs und Aktionen sind verdrahtet, keine Hostpfade.
// Aufruf: node tests/static-check.js   (Exit 0 = in Ordnung)
const { readHtml, scriptBlocks, scriptById } = require('./load.js');

const html = readHtml();
const errors = [];
function fail(msg) { errors.push(msg); }

// 1. Skripte: nur eingebettet, syntaktisch gültig
const blocks = scriptBlocks(html);
if (blocks.length !== 2) { fail('Erwartet genau 2 Skript-Blöcke (logic, ui), gefunden: ' + blocks.length); }
blocks.forEach((b, i) => {
  if (/\ssrc\s*=/.test(b.attrs)) { fail('Skript-Block ' + i + ' lädt eine externe Datei'); }
  try { new Function(b.code); } catch (e) { fail('Skript-Block ' + i + ' hat einen Syntaxfehler: ' + e.message); }
});

// 2. Keine Laufzeitabhängigkeiten
const external = [
  [/<link\b/i, '<link>-Element'],
  [/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i, 'externe src/href-Adresse'],
  [/@import/i, '@import'],
  [/url\(\s*["']?(?:https?:)?\/\//i, 'externe url()'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bimport\s*\(/, 'dynamischer import()'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\beval\s*\(/, 'eval()']
];
external.forEach(([re, name]) => { if (re.test(html)) { fail('Unzulässig: ' + name); } });

// 3. Keine Hostpfade
if (/\/(?:mnt|home|root|srv)\//.test(html)) { fail('Hostpfad in index.html'); }

// 4. Responsiv
if (!/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html)) { fail('Viewport-Meta fehlt'); }

// 5. IDs eindeutig, vom UI-Skript benutzte IDs und label-Ziele vorhanden
const ids = [...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]).filter((id) => id !== 'logic' && id !== 'ui');
const seen = new Set();
ids.forEach((id) => { if (seen.has(id)) { fail('ID doppelt: ' + id); } seen.add(id); });
const ui = scriptById(html, 'ui');
const used = new Set([...ui.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
used.forEach((id) => { if (!seen.has(id)) { fail('UI-Skript nutzt unbekannte ID: ' + id); } });
[...html.matchAll(/<label for="([\w-]+)"/g)].forEach((m) => { if (!seen.has(m[1])) { fail('label-Ziel fehlt: ' + m[1]); } });

// 6. Jede data-act im HTML oder in erzeugtem HTML hat einen Handler
const acts = new Set([...html.matchAll(/data-act="([\w-]+)"/g)].map((m) => m[1]));
const handled = new Set([...ui.matchAll(/act === '([\w-]+)'/g)].map((m) => m[1]));
acts.forEach((a) => { if (!handled.has(a)) { fail('Aktion ohne Handler: ' + a); } });
handled.forEach((a) => { if (!acts.has(a)) { fail('Handler ohne Auslöser: ' + a); } });

// 7. Rechenlogik darf das DOM nicht anfassen (bleibt unter Node testbar)
const logic = scriptById(html, 'logic');
if (/\b(?:document|window|localStorage)\b/.test(logic)) { fail('Logik-Block greift auf document/window/localStorage zu'); }

if (errors.length) {
  console.error('static-check: ' + errors.length + ' Fehler');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log('static-check: ok (' + ids.length + ' IDs, ' + acts.size + ' Aktionen, ' + used.size + ' UI-Zugriffe)');
