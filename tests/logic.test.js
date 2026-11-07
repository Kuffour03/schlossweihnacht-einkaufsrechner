'use strict';
// Tests der Rechenlogik (Fälligkeit, Bestand, Kosten, CSV-Rundlauf).
// Aufruf: node --test tests/logic.test.js   (kein Netz, keine Abhängigkeiten)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLogic } = require('./load.js');

const L = loadLogic();

function art(over) {
  return Object.assign({ id: 'a1', name: 'Test', unit: 'Stück', category: 'frisch', rhythm: 'daily', everyDays: null, minStock: null }, over);
}
function buy(articleId, date, qty, price, shop, id) {
  return { id: id || 'e' + Math.random().toString(36).slice(2), articleId, type: 'purchase', qty: qty || 1, date, shop: shop || '', price: price === undefined ? null : price };
}
function move(articleId, type, date, qty, id) {
  return { id: id || 'm' + Math.random().toString(36).slice(2), articleId, type, qty, date, shop: '', price: null };
}
function dueNames(articles, entries, day) {
  return L.dueList(articles, entries, day).map((i) => i.article.name);
}

/* ---------- Datum ---------- */

test('Datum: Gültigkeit und Tagesabstand', () => {
  assert.equal(L.isValidDate('2026-12-24'), true);
  assert.equal(L.isValidDate('2026-02-30'), false);
  assert.equal(L.isValidDate('24.12.2026'), false);
  assert.equal(L.isValidDate(''), false);
  assert.equal(L.daysBetween('2026-12-01', '2026-12-04'), 3);
  assert.equal(L.daysBetween('2026-11-29', '2026-12-02'), 3);
  assert.equal(L.daysBetween('2028-02-28', '2028-03-01'), 2); // Schaltjahr
  assert.equal(L.formatDate('2026-12-04'), '04.12.2026');
});

/* ---------- Fälligkeit je Rhythmus (SC04) ---------- */

test('Fälligkeit täglich: fällig, solange heute nicht gekauft', () => {
  const a = art({ rhythm: 'daily' });
  assert.equal(L.dueList([a], [], '2026-12-01').length, 1);
  assert.match(L.dueList([a], [], '2026-12-01')[0].reasons[0].text, /Täglich: noch nie gekauft/);
  assert.equal(L.dueList([a], [buy('a1', '2026-12-01')], '2026-12-01').length, 0);
  const due = L.dueList([a], [buy('a1', '2026-12-01')], '2026-12-02');
  assert.equal(due.length, 1);
  assert.match(due[0].reasons[0].text, /zuletzt gekauft am 01\.12\.2026 \(vor 1 Tag\)/);
});

test('Fälligkeit alle N Tage: genau ab dem N-ten Tag', () => {
  const a = art({ rhythm: 'every', everyDays: 3 });
  const e = [buy('a1', '2026-12-01')];
  assert.equal(L.dueList([a], e, '2026-12-02').length, 0);
  assert.equal(L.dueList([a], e, '2026-12-03').length, 0);
  const due = L.dueList([a], e, '2026-12-04');
  assert.equal(due.length, 1);
  assert.match(due[0].reasons[0].text, /Alle 3 Tage: zuletzt gekauft am 01\.12\.2026 \(vor 3 Tagen\)/);
});

test('Fälligkeit wöchentlich: nach 7 Tagen, nicht früher', () => {
  const a = art({ rhythm: 'weekly' });
  const e = [buy('a1', '2026-12-01')];
  assert.equal(L.dueList([a], e, '2026-12-07').length, 0);
  assert.equal(L.dueList([a], e, '2026-12-08').length, 1);
});

test('Fälligkeit einmalig: nur bis zum ersten Einkauf', () => {
  const a = art({ rhythm: 'once' });
  assert.equal(L.dueList([a], [], '2026-12-01').length, 1);
  assert.match(L.dueList([a], [], '2026-12-01')[0].reasons[0].text, /Einmalig zu Beginn: noch nicht gekauft/);
  assert.equal(L.dueList([a], [buy('a1', '2026-12-01')], '2026-12-20').length, 0);
});

test('Fälligkeit nach Bedarf: nie nach Rhythmus, nur über Mindestbestand', () => {
  const a = art({ rhythm: 'asneeded' });
  assert.equal(L.dueList([a], [], '2026-12-01').length, 0);
  const m = art({ rhythm: 'asneeded', minStock: 2 });
  const due = L.dueList([m], [buy('a1', '2026-12-01', 5)], '2026-12-02');
  assert.equal(due.length, 0);
  const low = L.dueList([m], [buy('a1', '2026-12-01', 5), move('a1', 'consume', '2026-12-02', 4)], '2026-12-02');
  assert.equal(low.length, 1);
  assert.equal(low[0].reasons[0].code, 'min');
  assert.match(low[0].reasons[0].text, /Bestand 1 Stück unter Mindestbestand 2 Stück/);
});

test('Fälligkeit: Rhythmus und Mindestbestand liefern beide einen Grund', () => {
  const a = art({ rhythm: 'daily', minStock: 10 });
  const due = L.dueList([a], [buy('a1', '2026-12-01', 3)], '2026-12-02');
  assert.deepEqual(due[0].reasons.map((r) => r.code), ['rhythm', 'min']);
});

test('Fälligkeit: Bestand genau auf Mindestbestand ist nicht fällig; Einkäufe nach dem Stichtag zählen nicht', () => {
  const a = art({ rhythm: 'asneeded', minStock: 2 });
  assert.equal(L.dueList([a], [buy('a1', '2026-12-01', 2)], '2026-12-01').length, 0);
  const d = art({ rhythm: 'daily' });
  assert.equal(L.dueList([d], [buy('a1', '2026-12-05')], '2026-12-02').length, 1);
});

/* ---------- Beispieldaten und Gegenprobe (SC07, AC01) ---------- */

function sample() {
  return L.mergeSample([]).articles;
}
function byName(articles, name) {
  return articles.find((a) => a.name === name);
}

test('Beispieldaten: 13 Artikel mit den Rhythmen aus SC07', () => {
  const s = sample();
  assert.equal(s.length, 13);
  assert.equal(new Set(s.map((a) => a.id)).size, 13);
  s.forEach((a) => assert.deepEqual(L.validateArticle(a), [], a.name));
  ['Brötchen', 'Handbrotteig'].forEach((n) => assert.equal(byName(s, n).rhythm, 'daily'));
  ['Lachs', 'Schnittlauch', 'Salat'].forEach((n) => {
    const a = byName(s, n);
    assert.equal(a.rhythm, 'every');
    assert.ok(a.everyDays === 2 || a.everyDays === 3, n);
  });
  ['Champignons', 'Lauch'].forEach((n) => assert.equal(byName(s, n).rhythm, 'weekly'));
  ['Schmand', 'Crème fraîche', 'Kartoffelsalat'].forEach((n) => assert.equal(byName(s, n).rhythm, 'once'));
  ['Servietten', 'Küchenrolle', 'Handschuhe'].forEach((n) => assert.equal(byName(s, n).rhythm, 'asneeded'));
});

test('Beispieldaten laden ergänzt nur fehlende Namen und vergibt neue IDs', () => {
  const first = L.mergeSample([]);
  assert.equal(first.added, 13);
  const again = L.mergeSample(first.articles);
  assert.equal(again.added, 0);
  assert.equal(again.articles.length, 13);
  const own = [art({ id: 'a7', name: 'brötchen' })];
  const m = L.mergeSample(own);
  assert.equal(m.added, 12);
  assert.equal(new Set(m.articles.map((a) => a.id)).size, 13);
});

test('Gegenprobe: Stichtag nach drei Tagen mit Beispieldaten', () => {
  const s = sample();
  const day0 = '2026-12-01';
  const all = s.map((a) => buy(a.id, day0));
  // Tag 3 nach dem Einkauf: täglich und alle 2-3 Tage fällig, wöchentlich/einmalig/nach Bedarf nicht
  assert.deepEqual(dueNames(s, all, '2026-12-04'), ['Brötchen', 'Handbrotteig', 'Lachs', 'Schnittlauch', 'Salat']);
  // Tag 1: nur die täglichen
  assert.deepEqual(dueNames(s, all, '2026-12-02'), ['Brötchen', 'Handbrotteig']);
  // Tag 2: zusätzlich die 2-Tage-Artikel, aber noch nicht Schnittlauch (alle 3 Tage)
  assert.deepEqual(dueNames(s, all, '2026-12-03'), ['Brötchen', 'Handbrotteig', 'Lachs', 'Salat']);
  // Tag 7: zusätzlich die wöchentlichen
  assert.deepEqual(dueNames(s, all, '2026-12-08'), ['Brötchen', 'Handbrotteig', 'Lachs', 'Schnittlauch', 'Salat', 'Champignons', 'Lauch']);
  // Vor dem ersten Einkauf: alles außer "nach Bedarf" ist fällig, jeder Eintrag hat einen Grund
  const none = L.dueList(s, [], day0);
  assert.equal(none.length, 10);
  none.forEach((i) => assert.ok(i.reasons.length >= 1 && i.reasons[0].text.length > 0));
});

/* ---------- Bestand (SC03) ---------- */

test('Bestand: Einkauf erhöht, Verbrauch verringert, Zählung setzt', () => {
  const e = [buy('a1', '2026-12-01', 10), move('a1', 'consume', '2026-12-02', 3)];
  assert.equal(L.stockOf('a1', e), 7);
  e.push(move('a1', 'count', '2026-12-03', 5));
  assert.equal(L.stockOf('a1', e), 5);
  e.push(buy('a1', '2026-12-04', 2.5));
  assert.equal(L.stockOf('a1', e), 7.5);
});

test('Bestand: Reihenfolge nach Datum, Verbrauch nie unter 0, Stichtag begrenzt', () => {
  const e = [move('a1', 'count', '2026-12-05', 4), buy('a1', '2026-12-01', 10), move('a1', 'consume', '2026-12-06', 99)];
  assert.equal(L.stockOf('a1', e), 0);
  assert.equal(L.stockOf('a1', e, '2026-12-05'), 4);
  assert.equal(L.stockOf('a1', e, '2026-12-02'), 10);
  assert.equal(L.stockOf('a1', e, '2026-11-30'), 0);
  assert.equal(L.stockOf('a2', e), 0);
});

test('Bestand: gleiche Tage in Erfassungsreihenfolge, keine Gleitkomma-Reste', () => {
  const e = [buy('a1', '2026-12-01', 0.1), buy('a1', '2026-12-01', 0.2)];
  assert.equal(L.stockOf('a1', e), 0.3);
  const same = [move('a1', 'count', '2026-12-01', 2), buy('a1', '2026-12-01', 3)];
  assert.equal(L.stockOf('a1', same), 5);
});

/* ---------- Übersicht und Kosten (SC05) ---------- */

test('Übersicht: letzte Einkäufe je Artikel, Kosten in Cent exakt', () => {
  const arts = [art({ id: 'a1', name: 'A' }), art({ id: 'a2', name: 'B' })];
  const e = [
    buy('a1', '2026-12-01', 1, 0.1), buy('a1', '2026-12-02', 1, 0.2), buy('a1', '2026-12-03', 1, 5),
    buy('a1', '2026-12-04', 1, null), buy('a2', '2026-12-02', 2, 3.5, 'Markt')
  ];
  const s = L.summary(arts, e, 3);
  assert.equal(s.totalCents, 10 + 20 + 500 + 350);
  assert.equal(s.rows[0].count, 4);
  assert.equal(s.rows[0].cents, 530);
  assert.deepEqual(s.rows[0].recent.map((x) => x.date), ['2026-12-04', '2026-12-03', '2026-12-02']);
  assert.equal(L.formatEuro(s.totalCents), '8,80 €');
  assert.equal(L.formatEuro(L.priceToCents(0.1) + L.priceToCents(0.2)), '0,30 €');
  assert.deepEqual(L.knownShops(e), ['Markt']);
});

test('Übersicht: Verbrauch und Zählung verursachen keine Kosten', () => {
  const arts = [art()];
  const e = [buy('a1', '2026-12-01', 1, 2), move('a1', 'consume', '2026-12-02', 1), move('a1', 'count', '2026-12-03', 0)];
  const s = L.summary(arts, e, 3);
  assert.equal(s.totalCents, 200);
  assert.equal(s.rows[0].count, 1);
});

/* ---------- Eingaben ---------- */

test('Zahlen: Komma und Punkt, ungültig wird NaN, leer wird null', () => {
  assert.equal(L.parseNumber('2,5'), 2.5);
  assert.equal(L.parseNumber(' 3 '), 3);
  assert.equal(L.parseNumber(''), null);
  assert.ok(Number.isNaN(L.parseNumber('abc')));
  assert.ok(Number.isNaN(L.parseNumber('-1')));
  assert.equal(L.fmtNumber(2.5), '2,5');
});

test('Validierung Artikel und Erfassung', () => {
  assert.deepEqual(L.validateArticle(art()), []);
  assert.ok(L.validateArticle(art({ name: '' })).length > 0);
  assert.ok(L.validateArticle(art({ unit: '' })).length > 0);
  assert.ok(L.validateArticle(art({ category: 'x' })).length > 0);
  assert.ok(L.validateArticle(art({ rhythm: 'x' })).length > 0);
  assert.ok(L.validateArticle(art({ rhythm: 'every', everyDays: null })).length > 0);
  assert.ok(L.validateArticle(art({ rhythm: 'every', everyDays: 1.5 })).length > 0);
  assert.ok(L.validateArticle(art({ minStock: NaN })).length > 0);
  const arts = [art()];
  const ok = L.makeEntry({ id: 'e1', articleId: 'a1', type: 'purchase', qty: '2,5', date: '2026-12-01', price: '3,20' });
  assert.deepEqual(L.validateEntry(ok, arts), []);
  assert.equal(ok.price, 3.2);
  assert.ok(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'zz', type: 'purchase', qty: 1, date: '2026-12-01' }), arts).length > 0);
  assert.ok(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'a1', type: 'purchase', qty: 0, date: '2026-12-01' }), arts).length > 0);
  assert.ok(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'a1', type: 'purchase', qty: '', date: '2026-12-01' }), arts).length > 0);
  assert.ok(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'a1', type: 'purchase', qty: 1, date: '2026-13-01' }), arts).length > 0);
  assert.ok(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'a1', type: 'purchase', qty: 1, date: '2026-12-01', price: 'x' }), arts).length > 0);
  assert.deepEqual(L.validateEntry(L.makeEntry({ id: 'e', articleId: 'a1', type: 'count', qty: 0, date: '2026-12-01' }), arts), []);
  assert.equal(L.makeEntry({ id: 'e', articleId: 'a1', type: 'consume', qty: 1, date: '2026-12-01', price: '9' }).price, null);
});

/* ---------- CSV (SC06, AC02) ---------- */

const TRICKY = 'Crème "frisch"; extra,\nZeile 2';

test('CSV-Rundlauf Artikelstamm ohne Datenverlust', () => {
  const arts = sample();
  arts.push(art({ id: 'a99', name: TRICKY, unit: ' kg ', rhythm: 'every', everyDays: 4, minStock: 1.5 }));
  arts[arts.length - 1] = L.makeArticle(arts[arts.length - 1]); // Eingabe wird getrimmt
  arts[0].minStock = 0;
  const csv = L.articlesToCsv(arts);
  const back = L.csvToArticles(csv);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.articles, arts);
});

test('CSV-Rundlauf Einkäufe ohne Datenverlust, auch mit Sonderzeichen', () => {
  const arts = [art({ id: 'a1' }), art({ id: 'a2', name: TRICKY })];
  const entries = [
    { id: 'e1', articleId: 'a1', type: 'purchase', qty: 2.5, date: '2026-12-01', shop: 'Markt; "Süd", Stand 3', price: 7.35 },
    { id: 'e2', articleId: 'a2', type: 'purchase', qty: 1, date: '2026-12-02', shop: '', price: null },
    { id: 'e3', articleId: 'a1', type: 'consume', qty: 1, date: '2026-12-03', shop: '', price: null },
    { id: 'e4', articleId: 'a1', type: 'count', qty: 0, date: '2026-12-04', shop: '', price: null },
    { id: 'e5', articleId: 'a2', type: 'purchase', qty: 0.1, date: '2026-12-05', shop: 'Zeile\r\nzwei', price: 0 }
  ];
  const back = L.csvToEntries(L.entriesToCsv(entries), arts);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.entries, entries);
  // Bestand und Kosten sind nach dem Rundlauf identisch
  assert.equal(L.stockOf('a1', back.entries), L.stockOf('a1', entries));
  assert.equal(L.summary(arts, back.entries, 3).totalCents, L.summary(arts, entries, 3).totalCents);
});

test('CSV: leere Listen laufen rund, BOM, CRLF, Komma-Trenner und beliebige Spaltenreihenfolge', () => {
  assert.deepEqual(L.csvToArticles(L.articlesToCsv([])), { articles: [], errors: [] });
  assert.deepEqual(L.csvToEntries(L.entriesToCsv([]), []), { entries: [], errors: [] });
  const withBom = '﻿' + L.articlesToCsv(sample());
  assert.equal(L.csvToArticles(withBom).articles.length, 13);
  const unix = L.articlesToCsv(sample()).replace(/\r\n/g, '\n');
  assert.equal(L.csvToArticles(unix).articles.length, 13);
  const comma = 'name,id,unit,category,rhythm,every_days,min_stock\nSalz,a1,kg,haltbar,asneeded,,2\n';
  const r = L.csvToArticles(comma);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.articles[0], { id: 'a1', name: 'Salz', unit: 'kg', category: 'haltbar', rhythm: 'asneeded', everyDays: null, minStock: 2 });
});

test('CSV: fehlerhafte Eingaben werden gemeldet statt still übernommen', () => {
  assert.match(L.csvToArticles('').errors[0], /leer/);
  assert.match(L.csvToArticles('id;name\na1;x\n').errors[0], /Spalte\(n\) fehlen/);
  assert.match(L.csvToArticles('id;name;unit;category;rhythm;every_days;min_stock\na1;"offen;kg;frisch;daily;;\n').errors[0], /Anführungszeichen/);
  const head = 'id;name;unit;category;rhythm;every_days;min_stock\n';
  assert.ok(L.csvToArticles(head + 'a1;X;kg;frisch;monatlich;;\n').errors.length > 0);
  assert.ok(L.csvToArticles(head + 'a1;X;kg;frisch;every;;\n').errors.length > 0);
  assert.ok(L.csvToArticles(head + 'a1;X;kg;frisch;daily;;\na1;Y;kg;frisch;daily;;\n').errors.some((m) => /doppelt/.test(m)));
  const arts = [art({ id: 'a1' })];
  const ehead = 'id;article_id;type;qty;date;shop;price\n';
  assert.ok(L.csvToEntries(ehead + 'e1;a9;purchase;1;2026-12-01;;\n', arts).errors.some((m) => /Artikel unbekannt/.test(m)));
  assert.ok(L.csvToEntries(ehead + 'e1;a1;purchase;1;01.12.2026;;\n', arts).errors.some((m) => /Datum/.test(m)));
  assert.ok(L.csvToEntries(ehead + 'e1;a1;kaufen;1;2026-12-01;;\n', arts).errors.length > 0);
});

test('Gespeicherte Daten: Ungültiges wird verworfen und gezählt', () => {
  const good = art({ id: 'a1' });
  const r = L.sanitizeData({
    articles: [good, { id: 'a2', name: '', unit: 'x', category: 'frisch', rhythm: 'daily' }, null],
    entries: [
      { id: 'e1', articleId: 'a1', type: 'purchase', qty: 1, date: '2026-12-01', shop: '', price: null },
      { id: 'e2', articleId: 'a2', type: 'purchase', qty: 1, date: '2026-12-01' }
    ]
  });
  assert.equal(r.articles.length, 1);
  assert.equal(r.entries.length, 1);
  assert.equal(r.dropped, 3);
  assert.deepEqual(L.sanitizeData(null), { articles: [], entries: [], dropped: 0 });
});

/* ---------- Darstellung ---------- */

test('Darstellung: Werte werden maskiert, Fälligkeit zeigt Grund je Eintrag', () => {
  const evil = art({ id: 'a1', name: '<img src=x onerror=alert(1)>', unit: '"&' });
  const html = L.renderDue(L.dueList([evil], [], '2026-12-01'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('noch nie gekauft'));
  assert.ok(L.renderDue([]).includes('nichts fällig'));
  assert.ok(!L.renderArticles([evil]).includes('<img'));
  assert.ok(!L.renderEntries([buy('a1', '2026-12-01', 1, 1, '<b>x</b>')], [evil], 5).includes('<b>'));
  assert.ok(!L.renderSummary(L.summary([evil], [buy('a1', '2026-12-01', 1, 1, '<b>x</b>')], 3)).includes('<b>'));
});
