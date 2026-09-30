/*
 * DotSense OCR text: from the OCR engine's words (tesseract.js "blocks") to clean text, for Bangla and
 * English alike.
 *  - Bangla and English are read together (ben+eng). In a Bangla line, a Latin "word" the engine is
 *    unsure of is almost always a Bangla word it could not read (TR), SHEE, FER...): it is read again
 *    with the Bangla model alone (the `bangla` lines) and replaced by what that sees in the same place.
 *    Likewise a stray Bangla digit or a doubted number in an English line (a Bangla 7 for "a", 9310 for
 *    "said") is read again with the English model alone.
 *  - Junk from the edges of a photo (the table, the page border, shadows: long dashes, one letter over
 *    and over, bars) goes.
 *  - Lines of one paragraph are joined (the braille makes its own lines); more room between two lines,
 *    a new block, a short line ending a sentence or a list sign starts a new paragraph. keepLines keeps
 *    the picture's line breaks.
 *  - Small repairs: | or a Bangla number sign read for the danda, no space before the danda , ? !, a
 *    vowel sign that lost its letter, spaces inside quotes.
 * Runs in the main process (main.js) and in Node for tests.
 */
(function (root) {
  'use strict';

  const BN_LETTER = /[অ-হৎড়-ৡ]/;       // Bangla vowels and consonants
  const LATIN = /[A-Za-z]/;
  const SIGN = '\\u0981-\\u0983\\u09BC\\u09BE-\\u09CD\\u09D7\\u09E2\\u09E3';   // vowel signs, hasant, nukta...
  const DANDA = '\\u0964';
  const JUNK_CHARS = /[|\\/<>°©®_=~^*#•·¦¬§¤`]/g;

  const scriptOf = w => (BN_LETTER.test(w) ? 'bn' : LATIN.test(w) ? 'en' : '');
  const center = b => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

  // The engine's result as lines of words: [{ bbox, baseline, block, words: [{ text, conf, bbox }] }]
  function linesOf(data) {
    const out = [];
    ((data && data.blocks) || []).forEach((block, bi) => {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const words = (line.words || []).map(w => ({ text: String(w.text || '').normalize('NFC'), conf: Number(w.confidence) || 0, bbox: w.bbox }))
            .filter(w => w.text.trim());
          if (words.length) out.push({ bbox: line.bbox, baseline: line.baseline, block: bi, words });
        }
      }
    });
    return out;
  }

  // Bangla or English line: which script has more words
  function scripts(line) {
    let bn = 0, en = 0;
    for (const w of line.words) { const s = scriptOf(w.text); if (s === 'bn') bn++; else if (s === 'en') en++; }
    return { bn, en };
  }
  const banglaLine = line => { const c = scripts(line); return c.bn > 0 && c.bn >= c.en; };
  const englishLine = line => { const c = scripts(line); return c.en > c.bn; };
  // A word the engine doubts, to be read again with the line's own script:
  //  - in a Bangla line, a Latin word (real English words there come out at 89 and more, misread Bangla
  //    at 80 and less)
  //  - in an English line, a Bangla digit or sign alone, or a number the engine doubts
  const DOUBT = 86;
  const bare = t => t.replace(/[^\p{L}\p{N}]/gu, '');
  function doubtful(line, w) {
    if (w.conf >= DOUBT) return false;
    const s = scriptOf(w.text);
    if (s === 'en') return banglaLine(line);
    if (!englishLine(line)) return false;
    const b = bare(w.text);
    return (s === 'bn' && [...b].length <= 2) || /^[\d০-৯]+$/.test(b);
  }
  const needs = (lines, isLine) => lines.some(line => isLine(line) && line.words.some(w => doubtful(line, w)));
  const needsBanglaLook = lines => needs(lines, banglaLine);
  const needsEnglishLook = lines => needs(lines, englishLine);

  // what another reading has in this word's place (words whose middle is inside it)
  function wordsAt(bbox, others) {
    const pad = (bbox.y1 - bbox.y0) * 0.3;
    return others.filter(b => {
      const c = center(b.bbox);
      return c.x >= bbox.x0 - pad && c.x <= bbox.x1 + pad && c.y >= bbox.y0 - pad && c.y <= bbox.y1 + pad;
    }).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  // junk: odd signs alone, a long run of one sign, or mostly odd signs (punctuation marks stay)
  const MARKS = new RegExp('^[-\\u2013\\u2014&' + DANDA + '\\u0965\\u09F7,.;:!?"\'\\u201C\\u201D\\u2018\\u2019()]+$');
  function junkWord(w) {
    const t = w.text;
    if (/(.)\1{4,}/u.test(t) || /(..)\1{2,}/u.test(t)) return true;         // one sign (or two) over and over
    if (!/[\p{L}\p{N}]/u.test(t)) return !MARKS.test(t);
    const odd = (t.match(JUNK_CHARS) || []).length;
    return odd > 0 && odd / [...t].length > 0.25;
  }
  // a junk line: the engine hardly believed any of it, or no real word is left (two letters or more,
  // read with some confidence), or one doubted word with a sign or two (a real line hard to read stays)
  function junkLine(words, readConf) {
    if (!words.length || readConf < 30) return true;
    const real = words.filter(w => [...w.text].filter(c => /\p{L}/u.test(c)).length >= 2 && w.conf >= 50);
    if (!real.length) return true;
    const mean = words.reduce((s, w) => s + w.conf, 0) / words.length;
    return real.length === 1 && words.length <= 2 && mean < 50;
  }

  // Text from the lines: doubtful words read again in the line's own script, junk out, paragraphs joined.
  // opts: { bangla: lines of a Bangla-only reading, english: lines of an English-only reading, keepLines }
  function buildText(lines, opts) {
    opts = opts || {};
    const flat = ls => (ls ? [].concat(...ls.map(l => l.words)) : null);
    const bnWords = flat(opts.bangla), enWords = flat(opts.english);
    const kept = [];
    for (const line of lines) {
      const bnLine = banglaLine(line);
      const words = [];
      line.words.forEach((w, k) => {
        // far from the rest of its line, at its start or end, and doubted: the page edge, a shadow
        const prev = line.words[k - 1], next = line.words[k + 1], near = prev || next || w;
        const h = Math.max(1, near.bbox.y1 - near.bbox.y0);
        const gapBefore = prev ? w.bbox.x0 - prev.bbox.x1 : Infinity, gapAfter = next ? next.bbox.x0 - w.bbox.x1 : Infinity;
        const end = k === 0 || k === line.words.length - 1;
        if (end && line.words.length > 1 && Math.min(gapBefore, gapAfter) > 2.5 * h && w.conf < 75) return;
        // a danda read as | I l or a Bangla number sign, alone in a Bangla line: right after a word (else
        // it is an edge), and not before a Latin word (| SB is USB)
        if (bnLine && /^[|Il।৷]$/.test(w.text)) {
          if (!prev || gapBefore > 1.0 * h) return;
          if (next && scriptOf(next.text) === 'en' && w.text !== '।') return;
          w = Object.assign({}, w, { text: '।', conf: 99 });
        }
        const other = doubtful(line, w) ? (bnLine ? bnWords : enWords) : null;
        if (other) {
          for (const a of wordsAt(w.bbox, other)) if (!words.includes(a)) words.push(a);   // (one word there may cover two here)
        } else words.push(w);
      });
      const clean = words.filter(w => !junkWord(w));
      const readConf = line.words.reduce((s, w) => s + w.conf, 0) / line.words.length;   // (as first read)
      if (junkLine(clean, readConf)) continue;
      kept.push({ bbox: line.bbox, baseline: line.baseline, block: line.block, text: clean.map(w => w.text).join(' ') });
    }
    if (!kept.length) return '';
    // Paragraphs: a new block, or more room above a line than above its neighbours (compared nearby:
    // in a photo the lines lower down are further apart), or a short line ending a sentence before it.
    // Where a line is: its baseline, carried to one place across the page along the page's slant (a
    // tilted photo makes long lines' boxes tall and moves their middles).
    const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
    const base = l => (l.baseline && l.baseline.x1 > l.baseline.x0 ? l.baseline : null);
    const maxW = Math.max(...kept.map(l => l.bbox.x1 - l.bbox.x0));
    const slope = median(kept.filter(l => base(l) && l.bbox.x1 - l.bbox.x0 > 0.3 * maxW)
      .map(l => (l.baseline.y1 - l.baseline.y0) / (l.baseline.x1 - l.baseline.x0))) || 0;
    const X = median(kept.map(l => l.bbox.x0));
    const mid = l => (base(l) ? l.baseline.y0 + slope * (X - l.baseline.x0) : (l.bbox.y0 + l.bbox.y1) / 2);
    const step = kept.map((l, i) => (i && l.block === kept[i - 1].block ? mid(l) - mid(kept[i - 1]) : NaN));
    const right = kept.map(l => l.bbox.x1), width = kept.map(l => l.bbox.x1 - l.bbox.x0);
    const sentenceEnd = new RegExp('[.!?' + DANDA + '"\\u201D\\u2019)]$');
    function newPara(i) {
      const a = kept[i - 1], b = kept[i];
      if (b.block !== a.block || !(step[i] > 0)) return true;
      const near = [];
      for (let k = i - 3; k <= i + 3; k++) if (k !== i && step[k] > 0 && kept[k].block === b.block) near.push(step[k]);
      if (near.length && step[i] > 1.3 * median(near)) return true;
      const around = [];
      for (let k = i - 4; k <= i + 3; k++) if (k !== i - 1 && kept[k] && kept[k].block === a.block) around.push(k);
      const typicalRight = median(around.map(k => right[k])), typicalWidth = median(around.map(k => width[k]));
      const short = around.length >= 2 && right[i - 1] < typicalRight - 0.2 * typicalWidth;
      return short && sentenceEnd.test(a.text);
    }
    let out = kept[0].text;
    for (let i = 1; i < kept.length; i++) {
      const b = kept[i];
      const para = newPara(i);
      const list = /^(?:[•*·‣◦-]|\(?[\d০-৯]{1,3}[.)])\s/.test(b.text);
      if (opts.keepLines) out += (para ? '\n\n' : '\n') + b.text;
      else if (para) out += '\n\n' + b.text;
      else if (list) out += '\n' + b.text;
      else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(b.text)) out = out.slice(0, -1) + b.text;   // infor- mation
      else out += ' ' + b.text;
    }
    return fixText(out);
  }

  // Small repairs on OCR text
  const REPAIRS = [
    [/[​﻿]/g, ''],
    // Bangla: | (or I l, or a Bangla number sign) right after a Bangla word is the danda
    [/([ঀ-৿])[^\S\n]*\|/g, '$1।'],
    [/([ঀ-৿])[৷Il](?=\s|$|["”’)])/g, '$1।'],
    // no space before the danda and the marks after a Bangla word
    [/([ঀ-৿])[^\S\n]+([।,;:!?])/g, '$1$2'],
    // a vowel sign (or hasant...) that lost its letter at the start of a word
    [new RegExp('(^|[\\s"\\u201C\\u2018(\\[])[' + SIGN + ']+', 'gm'), '$1'],
    // English: | alone before a word is I; no space before , . ; : ! ?
    [/(^|\s)\|(?=\s+[a-z])/gm, '$1I'],
    [/([A-Za-z0-9)])[^\S\n]+([,.;:!?])(?=\s|$)/g, '$1$2'],
    // quotes: no space inside them
    [/([\p{L}\p{N}।.!?,])[^\S\n]+([”’])(?=\s|$|[.,;:!?।])/gu, '$1$2'],
    [/([“‘])[^\S\n]+(?=[\p{L}\p{N}])/gu, '$1'],
    [/[^\S\n]{2,}/g, ' '], [/[^\S\n]+\n/g, '\n'], [/\n{3,}/g, '\n\n']
  ];
  function fixText(text) {
    let t = String(text || '').normalize('NFC');
    for (const [re, to] of REPAIRS) t = t.replace(re, to);
    return t.trim();
  }

  const api = { linesOf, needsBanglaLook, needsEnglishLook, buildText, fixText, junkWord, scriptOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DotSenseOcrText = api;
})(typeof window !== 'undefined' ? window : this);
