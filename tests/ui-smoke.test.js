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

// opts.store: vorhandener Speicher (erneutes Laden); opts.failSet: setItem wirft, solange true
function startPage(stored, opts) {
  opts = opts || {};
  const els = new Map();
  const store = opts.store || new Map();
  const control = { failSet: !!opts.failSet };
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
    setItem: (k, v) => {
      if (control.failSet) { throw new Error('QuotaExceededError'); }
      store.set(k, v);
    }
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
  return { els, store, control, downloads, click, change: ev => doc.listeners.change(ev), el: (id) => doc.getElementById(id) };
}

const KEY = 'schlossweihnacht-vorrat-v1';
const submit = (p, form) => p.el(form).listeners.submit({ preventDefault() {} });
// Fehlermeldung des Speicherns: sichtbar, mit CSV-Hinweis, und keine Erfolgsmeldung
function assertSaveFailureShown(p) {
  assert.equal(p.el('saveError').hidden, false);
  assert.match(p.el('saveError').textContent, /Nicht gespeichert/);
  assert.match(p.el('saveError').textContent, /CSV/);
  assert.notEqual(p.el('msg').className, 'ok');
  assert.doesNotMatch(p.el('msg').textContent, /Gespeichert|gelöscht|importiert|ergänzt/);
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

// Regression IR02 (OPS-T-0301): ein werfendes localStorage.setItem darf nie als Erfolg erscheinen
test('Speicherfehler beim Einkauf: dauerhafte Fehlermeldung, kein „Gespeichert.“, nach Neuladen kein Bestand', () => {
  const seed = startPage();
  seed.click('sample');
  assert.equal(JSON.parse(seed.store.get(KEY)).articles.length, 13);

  const p = startPage(null, { store: seed.store, failSet: true });
  p.el('today').value = '2026-12-01';
  p.el('today').listeners.change();
  p.click('buy', 'a1');
  p.el('entryQty').value = '20';
  p.el('entryPrice').value = '12,40';
  submit(p, 'entryForm');
  assertSaveFailureShown(p);
  assert.equal(p.el('msg').className, 'err');
  // im Speicher steht der Einkauf nicht
  assert.equal(JSON.parse(p.store.get(KEY)).entries.length, 0);

  // die Meldung bleibt auch nach einer späteren, anderen Meldung stehen
  p.el('entryQty').value = 'abc';
  submit(p, 'entryForm');
  assert.equal(p.el('saveError').hidden, false);

  // erneutes Laden aus dem Speicher: der Einkauf ist nicht vorgetäuscht gespeichert
  const q = startPage(null, { store: p.store });
  assert.doesNotMatch(q.el('stockList').innerHTML, /20 Stück/);
  assert.match(q.el('entryList').innerHTML, /Noch nichts erfasst/);
  assert.equal(q.el('saveError').textContent, '');
});

test('Speicherfehler verschwindet erst, wenn ein späteres Speichern gelingt', () => {
  const p = startPage(null, { failSet: true });
  p.click('sample');
  assertSaveFailureShown(p);
  p.control.failSet = false;
  p.click('sample');
  assert.equal(p.el('saveError').hidden, true);
  assert.equal(p.el('saveError').textContent, '');
  assert.match(p.el('msg').textContent, /ergänzt/);
  assert.equal(p.el('msg').className, 'ok');
  assert.equal(JSON.parse(p.store.get(KEY)).articles.length, 13);
});

test('Speicherfehler auf allen schreibenden Bedienpfaden meldet nie Erfolg', async () => {
  const seed = startPage();
  seed.click('sample');
  seed.el('entryArticle').value = 'a1';
  seed.el('entryQty').value = '5';
  submit(seed, 'entryForm');
  seed.click('export-articles');
  seed.click('export-entries');
  const [articlesCsv, entriesCsv] = seed.downloads.blobs.map((t) => t.replace(/^﻿/, ''));
  const stored = JSON.parse(seed.store.get(KEY));
  const fresh = () => startPage(stored, { failSet: true });

  let p = fresh();
  p.click('sample');
  assertSaveFailureShown(p);

  p = fresh();
  p.el('articleName').value = 'Salz';
  p.el('articleUnit').value = 'kg';
  p.el('articleCategory').value = 'haltbar';
  p.el('articleRhythm').value = 'asneeded';
  submit(p, 'articleForm');
  assertSaveFailureShown(p);

  p = fresh();
  p.click('del-entry', 'e1');
  assertSaveFailureShown(p);

  p = fresh();
  p.click('del-article', 'a1');
  assertSaveFailureShown(p);

  p = fresh();
  p.click('clear-all');
  assertSaveFailureShown(p);

  p = fresh();
  p.el('importArticles').files = [{ text: articlesCsv }];
  p.el('importArticles').listeners.change();
  await new Promise((r) => setTimeout(r, 5));
  assertSaveFailureShown(p);

  p = fresh();
  p.el('importEntries').files = [{ text: entriesCsv }];
  p.el('importEntries').listeners.change();
  await new Promise((r) => setTimeout(r, 5));
  assertSaveFailureShown(p);

  // der persistente Stand blieb in allen Fällen unverändert
  assert.deepEqual(JSON.parse(seed.store.get(KEY)), stored);
});

// OPS-T-0303: die neuen Bedienpfade laufen gegen dieselben Skripte wie die Webseite.
const planFixture = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'bestellplan.csv'), 'utf8');
function quantity(p, article, day, value) {
  const target = { value, getAttribute: n => n === 'data-quantity-article' ? article : n === 'data-quantity-day' ? day : null };
  p.el('planMatrix');
  // delegierter change-Handler am Dokument
  p.change({ target });
}

test('AC02: Lieferant, Artikel mit Gebinde, Tag mit Notiz, Menge, Handyansichten und erneutes Laden', () => {
  const p = startPage();
  p.el('supplierName').value = 'Bäcker'; p.el('supplierLead').value = '0';
  submit(p, 'supplierForm');
  const supplierId = p.el('supplierId').value;
  assert.ok(supplierId);
  p.el('supplierName').value = 'Bäcker Süd'; submit(p, 'supplierForm');
  assert.equal(JSON.parse(p.store.get(KEY)).order.suppliers.length, 2);
  p.el('articleName').value = 'Brot'; p.el('articleUnit').value = 'kg';
  p.el('articleCategory').value = 'frisch'; p.el('articleRhythm').value = 'asneeded';
  p.el('articleSupplier').value = supplierId; p.el('articlePack').value = '10-kg-Kiste';
  submit(p, 'articleForm');
  p.el('dayName').value = 'Tag 1'; p.el('dayDate').value = '2026-12-04'; p.el('dayNote').value = 'Regen';
  submit(p, 'dayForm');
  const dayId = p.el('dayId').value;
  p.el('dayNote').value = 'Sonne'; submit(p, 'dayForm');
  assert.equal(JSON.parse(p.store.get(KEY)).order.days.length, 1);
  quantity(p, 'a1', dayId, '100+100');
  p.el('today').value = '2026-12-04'; p.el('today').listeners.change();
  assert.match(p.el('orderDue').innerHTML, /Bäcker Süd/);
  assert.match(p.el('orderDue').innerHTML, /200 kg/);
  assert.match(p.el('orderDue').innerHTML, /10-kg-Kiste/);
  assert.match(p.el('orderDue').innerHTML, /Sonne/);
  const before = p.store.get(KEY);
  quantity(p, 'a1', dayId, 'oops');
  assert.equal(p.store.get(KEY), before);
  assert.equal(p.el('msg').className, 'err');
  p.el('planMode').value = 'article'; p.el('planMode').listeners.change();
  assert.match(p.el('planMatrix').innerHTML, /200/);
  p.el('planMode').value = 'all'; p.el('planMode').listeners.change();
  assert.equal(p.el('planFocus').hidden, true);
  p.el('shiftStart').value = '2027-12-04'; submit(p, 'shiftForm');
  assert.equal(JSON.parse(p.store.get(KEY)).order.days[0].date, '2027-12-04');
  assert.equal(JSON.parse(p.store.get(KEY)).order.quantities[0].qty, 200);
  const q = startPage(null, { store: p.store });
  assert.match(q.el('planMatrix').innerHTML, /200/);
  q.click('edit-article', 'a1');
  assert.equal(q.el('articlePack').value, '10-kg-Kiste');
  assert.equal(q.el('articleSupplier').value, supplierId);
});

test('AC01/AC03: Import, Heute bestellen plus Verbrauchsartikel, Export/Re-Import; v1 bleibt erhalten', async () => {
  const p = startPage(); p.click('sample');
  p.el('importPlan').files = [{ text: planFixture }]; p.el('importPlan').listeners.change();
  await new Promise(r => setTimeout(r, 5));
  assert.match(p.el('msg').textContent, /Bestellplan importiert/);
  p.el('today').value = '2026-12-03'; p.el('today').listeners.change();
  assert.match(p.el('orderDue').innerHTML, /Lachs 10kg: 50/);
  assert.doesNotMatch(p.el('dueList').innerHTML, /Brötchen/);
  assert.match(p.el('articleList').innerHTML, /Küchenrolle/);
  p.click('edit-article', 'a13'); // Handschuhe nach Bedarf auf täglich setzen
  p.el('articleRhythm').value = 'daily'; submit(p, 'articleForm');
  assert.match(p.el('dueList').innerHTML, /Handschuhe/);
  p.click('export-plan');
  const csv = p.downloads.blobs[0];
  const q = startPage();
  q.el('importPlan').files = [{ text: csv }]; q.el('importPlan').listeners.change();
  await new Promise(r => setTimeout(r, 5));
  const a = JSON.parse(p.store.get(KEY)), b = JSON.parse(q.store.get(KEY));
  const normalize = state => {
    state.articles.sort((a, b) => a.id.localeCompare(b.id));
    state.order.assignments.sort((a, b) => a.articleId.localeCompare(b.articleId));
    state.order.quantities.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return state;
  };
  assert.deepEqual(normalize(b), normalize(a));
  const before = q.store.get(KEY);
  q.el('importPlan').files = [{ text: planFixture.replace('100+100', 'kaputt') }]; q.el('importPlan').listeners.change();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(q.store.get(KEY), before);
  assert.match(q.el('msg').textContent, /Import abgebrochen/);
});

test('AC03: v1 localStorage migriert ohne Änderung von Bestand und Kosten', () => {
  const a = { id: 'a1', name: 'Servietten', unit: 'Packung', category: 'verbrauch', rhythm: 'daily', everyDays: null, minStock: 2 };
  const e = { id: 'e1', articleId: 'a1', type: 'purchase', qty: 3, date: '2026-01-01', shop: 'Metro', price: 12.5 };
  const p = startPage({ version: 1, articles: [a], entries: [e] });
  assert.match(p.el('stockList').innerHTML, /3 Packung/);
  assert.match(p.el('summary').innerHTML, /12,50 €/);
  p.click('edit-article', 'a1'); submit(p, 'articleForm');
  const data = JSON.parse(p.store.get(KEY));
  assert.equal(data.version, 2); assert.deepEqual(data.articles, [a]); assert.deepEqual(data.entries, [e]);
  assert.equal(data.order.assignments[0].pack, 'Packung');
});

test('Neue Bestellplan-Pfade melden Speicherfehler dauerhaft und nie als Erfolg', async () => {
  const p = startPage(null, { failSet: true });
  p.el('supplierName').value = 'Metro'; p.el('supplierLead').value = '1'; submit(p, 'supplierForm'); assertSaveFailureShown(p);
  p.el('dayDate').value = '2026-12-04'; p.el('dayName').value = 'Tag 1'; submit(p, 'dayForm'); assertSaveFailureShown(p);
  p.el('importPlan').files = [{ text: planFixture }]; p.el('importPlan').listeners.change();
  await new Promise(r => setTimeout(r, 5)); assertSaveFailureShown(p);
  const data = JSON.parse(p.store.get(KEY) || 'null'); assert.equal(data, null);
  p.el('shiftStart').value = '2027-12-01'; submit(p, 'shiftForm'); assertSaveFailureShown(p);
  quantity(p, 'a1', 'd1', '2'); assertSaveFailureShown(p);
  p.click('delete-day', 'd1'); assertSaveFailureShown(p);
});
