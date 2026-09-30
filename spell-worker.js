'use strict';
/*
 * English spelling for Auto correct: British and American English dictionaries (Hunspell, offline),
 * run apart from the window so a long text never makes it wait. For each word: null when it is
 * right in either dictionary, else a few suggestions.
 */
const fs = require('fs');
const path = require('path');

let spellers = null;
function load() {
  if (spellers) return spellers;
  let nspell;
  try {
    nspell = require('nspell');
    spellers = ['dictionary-en-gb', 'dictionary-en'].map(name => {
      const dir = path.dirname(require.resolve(name));
      return nspell(fs.readFileSync(path.join(dir, 'index.aff')), fs.readFileSync(path.join(dir, 'index.dic')));
    });
  } catch (e) {
    // (after an update without "npm install" the dictionary is not there yet)
    if (e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error('The English dictionary is not installed: run "npm install" in the DotSense folder once. Common misspellings and the other checks still work.');
    }
    throw e;
  }
  return spellers;
}

const MAX_SUGGESTED = 300;   // words that get suggestions in one go (the rest are still marked)

function check(words) {
  const list = load();
  const out = {};
  let suggested = 0;
  for (const w of words) {
    const word = String(w).replace(/’/g, "'");
    if (list.some(s => s.correct(word))) { out[w] = null; continue; }
    const seen = new Set(), sugg = [];
    if (suggested++ < MAX_SUGGESTED) {
      for (const s of list) for (const x of s.suggest(word)) if (!seen.has(x)) { seen.add(x); sugg.push(x); }
    }
    out[w] = sugg.slice(0, 8);
  }
  return out;
}

process.parentPort.on('message', e => {
  const m = e.data || {};
  if (m.type !== 'check') return;
  try {
    const words = (Array.isArray(m.words) ? m.words : []).filter(w => typeof w === 'string' && w.length <= 60).slice(0, 5000);
    process.parentPort.postMessage({ id: m.id, results: check(words) });
  } catch (err) {
    process.parentPort.postMessage({ id: m.id, error: err.message });
  }
});
