'use strict';
// Liest index.html und liefert die eingebetteten Skripte. Die Tests laufen damit
// gegen genau den Code, den auch die Seite ausführt.
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

function scriptBlocks(html) {
  const blocks = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push({ attrs: m[1], code: m[2] });
  }
  return blocks;
}

function scriptById(html, id) {
  const b = scriptBlocks(html).find((x) => x.attrs.includes('id="' + id + '"'));
  if (!b) { throw new Error('Skript-Block nicht gefunden: ' + id); }
  return b.code;
}

function loadLogic() {
  const code = scriptById(readHtml(), 'logic');
  return new Function(code + '\nreturn StockLogic;')();
}

module.exports = { readHtml, scriptBlocks, scriptById, loadLogic };
