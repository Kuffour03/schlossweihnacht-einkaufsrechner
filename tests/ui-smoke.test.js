'use strict';
// Rauchtest der Oberfläche ohne Browser: das UI-Skript aus index.html läuft gegen
// eine einfache Attrappe von document/localStorage. Geprüft wird der Pfad
// Laden -> Rechenlogik -> Darstellung sowie die Bedienaktionen.
// Das ersetzt keinen Blick in einen echten Browser (siehe README).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readHtml, scriptById } = require('./load.js');

const html = readHtml();
const knownIds = new Set([...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));

function makeEl(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', className: '', hidden: false, files: null,
    attrs: {}, listeners: {}, href: '', download: '',
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    click() { this.clicked = true; }
  };
}

function startPage(stored) {
  const els = new Map();
  const store = new Map();
  if (stored) { store.set('schlossweihnacht-vorrat-v1', JSON.stringify(stored)); }
  const downloads = [];
  const doc = {
    getElementById(id) {
      if (!knownIds.has(id)) { throw new Error('Unbekannte Element-ID im UI-Skript: ' + id); }
      if (!els.has(id)) { els.set(id, makeEl(id)); }
      return els.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { const e = makeEl('a'); downloads.push(e); return e; },
    body: { appendChild() {}, removeChild() {} },
    addEventListener(type, fn) { doc.listeners[type] = fn; },
    listeners: {}
  };
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); }
  };
  class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
  const urls = { createObjectURL: (b) => { downloads.blobs = (downloads.blobs || []).concat(b.text); return 'blob:test'; }, revokeObjectURL() {} };
  class FakeReader { readAsText(f) { this.result = f.text; setTimeout(() => this.onload(), 0); } }
  const code = scriptById(html, 'logic') + '\n' + scriptById(html, 'ui');
  new Function('document', 'localStorage', 'confirm', 'Blob', 'URL', 'FileReader', code)(doc, storage, () => true, FakeBlob, urls, FakeReader);
  function click(act, id) {
    const btn = { getAttribute: (n) => (n === 'data-act' ? act : n === 'data-id' ? id : null) };
    doc.listeners.click({ target: { closest: () => btn } });
  }
  return { els, store, downloads, click, el: (id) => doc.getElementById(id) };
}

test('Start ohne Daten: leere Zustände, Auswahllisten gefüllt', () => {
  const p = startPage();
  assert.match(p.el('dueList').innerHTML, /nichts fällig/);
  assert.match(p.el('entryType').innerHTML, /Einkauf/);
  assert.match(p.el('articleRhythm').innerHTML, /täglich/);
  assert.match(p.el('articleCategory').innerHTML, /Verbrauchsartikel/);
  assert.match(p.el('today').value, /^\d{4}-\d{2}-\d{2}$/);
});

test('Beispielartikel laden, Einkauf erfassen, Nachkaufliste, Export und Import', async () => {
  const p = startPage();
  p.click('sample');
  assert.match(p.el('msg').textContent, /13 Beispielartikel/);
  assert.match(p.el('dueList').innerHTML, /Brötchen/);
  assert.match(p.el('dueList').innerHTML, /noch nie gekauft/);
  assert.match(p.el('articleList').innerHTML, /Handschuhe/);
  assert.ok(JSON.parse(p.store.get('schlossweihnacht-vorrat-v1')).articles.length === 13);

  // Einkauf für Brötchen am Stichtag erfassen: danach nicht mehr fällig
  p.el('today').value = '2026-12-01';
  p.el('today').listeners.change();
  p.click('buy', 'a1');
  assert.equal(p.el('entryArticle').value, 'a1');
  p.el('entryQty').value = '20';
  p.el('entryShop').value = 'Bäcker';
  p.el('entryPrice').value = '12,40';
  p.el('entryForm').listeners.submit({ preventDefault() {} });
  assert.match(p.el('msg').textContent, /Gespeichert/);
  assert.doesNotMatch(p.el('dueList').innerHTML, /Brötchen/);
  assert.match(p.el('stockList').innerHTML, /20 Stück/);
  assert.match(p.el('summary').innerHTML, /12,40 €/);

  // drei Tage später ist es wieder fällig
  p.el('today').value = '2026-12-04';
  p.el('today').listeners.change();
  assert.match(p.el('dueList').innerHTML, /Brötchen/);
  assert.match(p.el('dueList').innerHTML, /vor 3 Tagen/);

  // Ungültige Eingabe wird abgelehnt und nicht gespeichert
  const before = p.store.get('schlossweihnacht-vorrat-v1');
  p.el('entryQty').value = 'abc';
  p.el('entryForm').listeners.submit({ preventDefault() {} });
  assert.equal(p.el('msg').className, 'err');
  assert.equal(p.store.get('schlossweihnacht-vorrat-v1'), before);

  // Export und Re-Import in eine zweite, leere Seite
  p.click('export-articles');
  p.click('export-entries');
  const [articlesCsv, entriesCsv] = p.downloads.blobs.map((t) => t.replace(/^﻿/, ''));
  assert.match(articlesCsv, /Crème fraîche/);
  assert.match(entriesCsv, /Bäcker/);
  const q = startPage();
  q.el('importArticles').files = [{ text: articlesCsv }];
  q.el('importArticles').listeners.change();
  await new Promise((r) => setTimeout(r, 5));
  q.el('importEntries').files = [{ text: entriesCsv }];
  q.el('importEntries').listeners.change();
  await new Promise((r) => setTimeout(r, 5));
  assert.match(q.el('msg').textContent, /1 Erfassungen importiert/);
  assert.match(q.el('summary').innerHTML, /12,40 €/);
  assert.deepEqual(JSON.parse(q.store.get('schlossweihnacht-vorrat-v1')), JSON.parse(p.store.get('schlossweihnacht-vorrat-v1')));
});

test('Artikel anlegen, bearbeiten und löschen', () => {
  const p = startPage();
  p.el('articleName').value = 'Salz';
  p.el('articleUnit').value = 'kg';
  p.el('articleCategory').value = 'haltbar';
  p.el('articleRhythm').value = 'asneeded';
  p.el('articleMin').value = '2';
  p.el('articleForm').listeners.submit({ preventDefault() {} });
  assert.match(p.el('articleList').innerHTML, /Salz/);
  assert.match(p.el('articleList').innerHTML, /Mindestbestand 2/);
  p.click('edit-article', 'a1');
  assert.equal(p.el('articleName').value, 'Salz');
  p.el('articleName').value = 'Meersalz';
  p.el('articleForm').listeners.submit({ preventDefault() {} });
  assert.match(p.el('articleList').innerHTML, /Meersalz/);
  assert.doesNotMatch(p.el('articleList').innerHTML, />Salz</);
  // Mindestbestand 2 bei Bestand 0 -> Nachkauf mit Grund
  assert.match(p.el('dueList').innerHTML, /unter Mindestbestand 2 kg/);
  p.click('del-article', 'a1');
  assert.match(p.el('articleList').innerHTML, /Noch keine Artikel/);
});

test('Beschädigte gespeicherte Daten werden verworfen statt die Seite zu brechen', () => {
  const p = startPage({ articles: [{ id: 'a1', name: '', unit: 'x', category: 'frisch', rhythm: 'daily' }], entries: 'kaputt' });
  assert.match(p.el('msg').textContent, /verworfen/);
  assert.match(p.el('dueList').innerHTML, /nichts fällig/);
});
