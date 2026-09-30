/* DotSense window logic: live braille preview, OCR import, voice typing and live printing. */
const D = window.DotSense;
const desk = window.desktop || null;
const $ = id => document.getElementById(id);
const FIELDS = D.SETTING_KEYS;
const STORE_KEY = 'dotsense:v1';
const DEFAULT_TEXT = 'HELLO WORLD 123!';

const fmtNum = n => Number(n).toLocaleString('en-US');
const round = n => Math.round(n * 100) / 100;
function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
// A duration as a clock, for the timer: "00:03:12" (hours, minutes, seconds).
function fmtClock(sec) {
  if (!Number.isFinite(sec)) return '--:--:--';
  const s = Math.max(0, Math.round(sec));
  const two = n => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}
// A duration in words, for estimates: "< 1 min", "14 min", "1 h 5 min".
function fmtMin(sec) {
  if (!Number.isFinite(sec)) return '–';
  if (sec <= 0) return '0 min';
  if (sec < 60) return '< 1 min';
  const m = Math.round(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} h` + (m % 60 ? ` ${m % 60} min` : '') : `${m} min`;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = {
  result: null,
  error: '',
  page: 0,
  dotByKey: new Map(),  // reading-side "line:cell:dot" -> { dot, cell } elements
  progEls: [],          // punching order -> { dot, cell } (mirrored order when inverting)
  progEls2: [],         // machine side (Invert view), in punching order
  sideView: false,      // Invert view: show the machine side next to the reading side
  shownDone: 0,
  shownNow: -1,
  printing: null,
  printed: null,      // punched dots per page after a print, shown until the text changes
  pageError: '',
  scale: 100,         // braille size in % (page scaling, only with "Use paper size")
  sheet: null,        // with "Use paper size": the paper inside its margins; no dot may go outside it
  paper: null,        // with "Use paper size": { w, h, orientation, label } of the sheet, for the preview
  ocrBusy: false
};
const machine = { connected: false, busy: false, state: 'Disconnected', info: null, status: null };
const voice = { model: 'accurate', phase: 'off', ctx: null, stream: null, node: null, src: null };
const checkRun = { running: false, stopped: false };   // Tool Box › Check (auto calibrate)
const ocr = { sources: [], busy: false, stop: false, run: null, prefix: '', runs: 0, added: [] };   // runs: since the Scan dialog opened; added: text put in by this run
const invertOn = () => $('invertPrint').checked;
// Language for voice typing and scanning (OCR), and which Bangla braille Bangla text is punched in.
const inputLang = () => ((document.querySelector('input[name=inputLang]:checked') || {}).value === 'bn' ? 'bn' : 'en');
const brailleOpts = () => ({ bangla: 'bd' });   // Bangla braille: the Bangladesh standard
let invertWinOpen = false;

// ------------------------------------------------------------------ page (paper size)
const AREA_KEYS = ['originX', 'originY', 'width', 'height'];
const TYPICAL_REACH = { x: 300, y: 180 };   // a typical 3018 (used until the machine reports $130/$131)
let manualArea = null;                        // the user's own start/print area, restored when paper size is off
const pageOn = () => $('pageMode').checked;
const orientation = () => document.querySelector('input[name=orientation]:checked').value;
// The margin field shows cm or mm; the margin itself is always kept in mm.
const MM_PER = { cm: 10, mm: 1 };
const marginUnit = () => { const r = document.querySelector('input[name=marginUnit]:checked'); return r && r.value === 'cm' ? 'cm' : 'mm'; };
let shownUnit = 'mm';   // the unit the margin field shows right now
function marginMm() {
  return Math.round(Number.parseFloat($('paperMargin').value) * MM_PER[shownUnit] * 1000) / 1000;
}
function showMargin(mm) {
  shownUnit = marginUnit();
  $('paperMargin').step = shownUnit === 'cm' ? '0.1' : '1';
  if (Number.isFinite(mm)) $('paperMargin').value = String(Math.round(mm / MM_PER[shownUnit] * 1000) / 1000);
}
function paperSpec() {
  const id = $('paperSize').value;
  const p = D.PAPER_SIZES.find(x => x.id === id) || D.PAPER_SIZES[0];
  const custom = p.id === 'custom';
  return {
    id: p.id, label: p.label, orientation: orientation(), margin: marginMm(),
    w: custom ? Number.parseFloat($('paperW').value) : p.w, h: custom ? Number.parseFloat($('paperH').value) : p.h
  };
}
function readArea() { const a = {}; for (const k of AREA_KEYS) a[k] = $(k).value; return a; }
// Page scaling, like a print dialog: the braille size in % of the dot, cell and line pitch.
const SCALE_MODES = ['fit', 'reduce', 'custom'];   // Fit to printer margins is the standard
const scaleMode = () => { const r = document.querySelector('input[name=pageScale]:checked'); return r ? r.value : 'fit'; };
function customPct() {
  const n = Math.round(Number.parseFloat($('scalePct').value));
  return Math.min(D.SCALE_MAX, Math.max(D.SCALE_MIN, Number.isFinite(n) ? n : 100));
}
// Settings for the braille layout: the fields, with the pitches scaled when page scaling is on.
function layoutSettings() {
  const s = readSettings();
  return pageOn() && state.scale !== 100 ? D.scalePitches(s, state.scale) : s;
}
// text: the text the braille size fits (normally the text box)
function applyPage(text = $('sentence').value) {
  const on = pageOn();
  $('pageFields').hidden = !on;
  $('pageOffHint').hidden = on;
  $('customSize').hidden = !on || $('paperSize').value !== 'custom';
  $('autoNote1').hidden = $('autoNote2').hidden = !on;
  applyLock();
  state.pageError = '';
  state.scale = 100;
  state.sheet = null;
  state.paper = null;
  showPageWarn('');
  $('scaleWarn').hidden = true;
  $('scaleInfo').textContent = '';
  if (!on) return;
  try {
    const spec = paperSpec();
    const base = readSettings();
    const mode = scaleMode();
    let pct = 100, fit = null;
    if (mode === 'custom') pct = customPct();
    else if (mode === 'fit' || mode === 'reduce') { fit = D.fitScale(text, base, spec, mode, brailleOpts()); pct = fit.pct; }
    const scaled = D.scalePitches(base, pct);
    let a;
    try { a = D.paperArea(spec, scaled); } catch (e) {
      let fullSizeFits = false;
      if (pct > 100) try { D.paperArea(spec, base); fullSizeFits = true; } catch (_) { /* the paper itself is the problem */ }
      throw fullSizeFits ? new Error(`At ${pct} % the braille is too big for this paper. Use a smaller scale.`) : e;
    }
    if (AREA_KEYS.some(k => Number.parseFloat($(k).value) !== a[k])) $('confirmed').checked = false;   // the start position moved
    $('originX').value = a.originX;
    $('originY').value = a.originY;
    $('width').value = a.width;
    $('height').value = a.height;
    state.scale = pct;
    state.sheet = a.sheet;
    const nice = n => String(Math.round(n * 10) / 10);
    state.paper = {
      w: a.paperW, h: a.paperH, orientation: spec.orientation,
      label: spec.id === 'custom' ? `User-Defined ${nice(Math.min(a.paperW, a.paperH))} × ${nice(Math.max(a.paperW, a.paperH))} mm` : spec.label
    };
    const mm = n => String(Math.round(n * 100) / 100);
    let info = `Braille size: ${pct} % · dots ${mm(scaled.dotPitch)} · cells ${mm(scaled.cellPitch)} · lines ${mm(scaled.linePitch)} mm`;
    if (fit && text.trim()) {
      const several = D.PAGE_MARK.test(text) || text.includes('\f');
      info += fit.fits ? (several ? ' · each page fits on one sheet' : ' · the text fits on one sheet')
        : ` · too long for one sheet even at ${D.SCALE_MIN} %, so it goes on to the next sheets`;
    }
    $('scaleInfo').textContent = info;
    if (pct < 100 && scaled.dotPitch < D.STANDARD_DOT) {
      $('scaleWarn').textContent = `Dots are closer than standard braille (${D.STANDARD_DOT} mm). Check that your punch can make dots this close.`;
      $('scaleWarn').hidden = false;
    }
    const travel = machine.info && machine.info.travel;
    const reach = travel && travel[0] > 0 && travel[1] > 0 ? { x: travel[0], y: travel[1], who: 'your machine reaches' } : { x: TYPICAL_REACH.x, y: TYPICAL_REACH.y, who: 'a typical 3018 reaches about' };
    const needX = a.originX + a.width, needY = a.originY;
    if (needX > reach.x + 0.01 || needY > reach.y + 0.01) {
      const fixes = reachFixes(spec, reach);
      showPageWarn(`This sheet needs X up to ${round(needX)} mm and Y up to ${round(needY)} mm, but ${reach.who} ${reach.x} × ${reach.y} mm. ` +
        (fixes.length ? '' : spec.orientation === 'portrait' && a.paperW < a.paperH ? 'Try Landscape or a smaller size. ' : 'Try a smaller size. ') + 'Check with Go to start position before printing.', fixes);
    }
  } catch (e) {
    state.pageError = e.message;
    showPageWarn(e.message);
  }
}
function showPageWarn(text, fixes) {
  $('pageWarnText').textContent = text;
  $('pageWarn').hidden = !text;
  const list = text && fixes ? fixes : [];
  $('pageFix').replaceChildren(...list.map(f => {
    const b = el('button', 'btn small', f.label);
    b.type = 'button';
    b.onclick = () => applyFix(f);
    return b;
  }));
  $('pageFix').hidden = !list.length;
}
// The sheet is bigger than the machine reaches: the fixes that make it fit - Landscape, a bigger
// margin (at most MAX_FIX_MARGIN), or both. Checked for the smallest braille size the page can
// get, so a fix still holds after Fit or Reduce picks the new size.
const MAX_FIX_MARGIN = 40;   // mm
function reachFixes(spec, reach) {
  const base = readSettings();
  const scaled = D.scalePitches(base, scaleMode() === 'custom' ? customPct() : D.SCALE_MIN);
  const inset = D.EDGE_GAP + D.dotRadius(scaled);   // the least room the first dot keeps from the margin line
  const fits = sp => {
    let a;
    try { a = D.paperArea(sp, scaled); } catch (_) { return false; }
    return a.paperW - sp.margin - inset <= reach.x + 0.01 && a.paperH - sp.margin - inset <= reach.y + 0.01;
  };
  const smallestMargin = orientation => {
    for (let m = Math.floor(spec.margin + 1e-9) + 1; m <= MAX_FIX_MARGIN; m++) if (fits(Object.assign({}, spec, { orientation, margin: m }))) return m;
    return null;
  };
  const fixes = [];
  if (spec.orientation === 'portrait') {
    if (fits(Object.assign({}, spec, { orientation: 'landscape' }))) fixes.push({ label: 'Switch to Landscape', orientation: 'landscape' });
    else {
      const m = smallestMargin('landscape');
      if (m != null) fixes.push({ label: `Landscape with a ${marginText(m)} margin`, orientation: 'landscape', margin: m });
    }
  }
  const m = smallestMargin(spec.orientation);
  if (m != null) fixes.push({ label: `Use a ${marginText(m)} margin`, margin: m });
  return fixes;
}
// a margin in the unit the margin field shows: "2.7 cm" or "27 mm"
const marginText = mm => (marginUnit() === 'cm' ? `${Math.round(mm) / 10} cm` : `${Math.round(mm)} mm`);
function applyFix(f) {
  if (f.orientation) document.querySelector(`input[name=orientation][value=${f.orientation}]`).checked = true;
  if (f.margin != null) showMargin(f.margin);
  $('confirmed').checked = false;
  applyPage();
  rebuild(false);
  const what = [f.orientation ? 'Landscape' : '', f.margin != null ? `${marginText(f.margin)} margin` : ''].filter(Boolean).join(' with a ');
  flash(`${what} set. Check the start position again.`);
  (f.margin != null ? $('paperMargin') : document.querySelector('input[name=orientation]:checked')).focus();   // the button is gone
}
function autoSeconds() {
  if (!$('autoNext').checked) return null;
  const n = Math.round(Number.parseFloat($('autoNextSec').value));
  return Math.min(3600, Math.max(5, Number.isFinite(n) ? n : 30));
}

// ---- Lock these values (Machine setup › Machine values): read-only until the lock is off.
// With a paper size, start position and print area are always read-only (they follow the paper).
const locked = () => $('lockMachine').checked;
function applyLock() {
  const lock = locked();
  const on = pageOn();
  for (const k of FIELDS) $(k).readOnly = lock || (on && AREA_KEYS.includes(k));
  $('lockState').textContent = lock ? 'Locked' : 'Unlocked';
  $('lockNote').hidden = !lock;
  $('resetBtn').disabled = lock || !!state.printing;
}
$('lockMachine').addEventListener('change', () => { applyLock(); saveStore(); });

let beepCtx = null;
function beep(freq, seconds) {
  try {
    if (!beepCtx) beepCtx = new AudioContext();
    if (beepCtx.state === 'suspended') beepCtx.resume();
    const t = beepCtx.currentTime, o = beepCtx.createOscillator(), g = beepCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(beepCtx.destination);
    o.start(t);
    o.stop(t + seconds + 0.02);
  } catch (_) { /* no audio device */ }
}

// ------------------------------------------------------------------ storage
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (_) { return {}; }
}
const stored = loadStore();
// Auto correct: the dictionary's answers (word -> null right / [suggestions]), what was ignored this
// session, and the user's own words (Add to dictionary, kept)
const fixer = {
  open: false, text: '', issues: [], spell: new Map(), ignore: new Set(), asking: false, again: false, error: '', timer: 0, noDict: false,
  myWords: new Set((Array.isArray(stored.myWords) ? stored.myWords : []).filter(w => typeof w === 'string').map(w => w.toLowerCase()))
};
let storeTimer = 0;
function saveStore() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(writeStore, 400);
}
// a change made just before the window closes is still kept
window.addEventListener('beforeunload', () => { if (storeTimer) writeStore(); });
function writeStore() {
  clearTimeout(storeTimer);
  storeTimer = 0;
  try {
    const margin = marginMm();
    localStorage.setItem(STORE_KEY, JSON.stringify({
      text: $('sentence').value,
      settings: readSettings(),
      voiceModel: voice.model,
      inputLang: inputLang(),
      invert: invertOn(),
      page: {
        on: pageOn(), size: $('paperSize').value, orientation: orientation(), margin: Number.isFinite(margin) ? margin : '', marginUnit: marginUnit(), w: $('paperW').value, h: $('paperH').value,
        scale: scaleMode(), scalePct: $('scalePct').value, pdfPaper: $('pdfPaper').checked
      },
      manualArea,
      sheet: { auto: $('autoNext').checked, seconds: $('autoNextSec').value },
      showGcode: $('showGcode').checked,
      moreOpen: $('morePanel').open,
      zoom: zoomMode(),
      setupTab: setup.tab,
      lockMachine: locked(),
      sideView: state.sideView,
      jogUnit: jogUnit(),
      baud: $('baudSelect').value,
      port: $('portSelect').value || stored.port || '',
      ocr: { forceOcr: $('forceOcr').checked, sourceBreak: $('sourceBreak').checked, keepLines: $('keepLines').checked },
      wifi: { ssid: wifi.ssid, password: wifi.password },
      phone: { on: phone.on },
      myWords: [...fixer.myWords].slice(0, 5000),
      fixShow: $('fixShow').checked,
      fixOn: fixer.open
    }));
  } catch (_) { /* storage unavailable or full */ }
}

function readSettings() {
  const s = {};
  for (const k of FIELDS) s[k] = $(k).value;
  return s;
}
function writeSettings(s) {
  for (const k of FIELDS) $(k).value = s[k] != null && s[k] !== '' ? s[k] : D.DEFAULTS[k];
}

// ------------------------------------------------------------------ live layout
let rebuildTimer = 0, rebuildPending = false, pendingFollow = false, marksWanted = false;
// marks: also write the page numbers into the page breaks (see syncPageMarks)
function scheduleRebuild(followCaret, marks) {
  if (typeof fixerTextChanged === 'function') fixerTextChanged();   // (Auto correct follows the text)
  clearTimeout(rebuildTimer);
  if (marks) marksWanted = true;
  rebuildPending = true;
  pendingFollow = !!followCaret;
  const len = $('sentence').value.length;
  rebuildTimer = setTimeout(() => { rebuildPending = false; rebuild(followCaret); }, len > 15000 ? 200 : 0);
}

// ------------------------------------------------------------------ page breaks
// A page break shows the page it starts: [[New Page 3]] (after page 2). The numbers follow the
// layout. They are written when Next page is pressed, when text comes in (scan, voice, a project,
// a size change) and when the text box is left - never while typing. With the focus in the text box
// the change is one edit, like typing, so Undo takes it back.
const PAGE_MARKS = new RegExp(D.PAGE_MARK.source + '|\\f', 'gi');   // and form feeds

// The text with numbered page breaks, and move(): a position in the old text -> the new text
// (inside a changed break: just after it). null when nothing changes or the layout is of other text.
function numberedMarks(text, r) {
  if (!r || !r.breaks || !r.breaks.length) return null;
  const found = [...text.matchAll(PAGE_MARKS)];
  if (found.length !== r.breaks.length) return null;
  const edits = [];
  let grow = 0;
  found.forEach((m, k) => {
    if (m[0] === '\f') return;
    const mark = `[[New Page ${r.breaks[k] + 1}]]`;
    if (m[0] === mark) return;
    edits.push({ start: m.index, end: m.index + m[0].length, mark });
    grow += mark.length - m[0].length;
  });
  if (!edits.length || text.length + grow > D.MAX_CHARS) return null;
  let out = '', last = 0;
  for (const e of edits) { out += text.slice(last, e.start) + e.mark; last = e.end; }
  out += text.slice(last);
  const move = pos => {
    let shift = 0;
    for (const e of edits) {
      if (pos >= e.end) shift += e.mark.length - (e.end - e.start);
      else { if (pos > e.start) return e.start + shift + e.mark.length; break; }
    }
    return pos + shift;
  };
  return { text: out, move };
}

// Puts `next` in the text box and selects a..b. With the focus in the box only the changed part is
// replaced, as one edit that Undo takes back; otherwise the text is set.
let settingText = false;   // (its input events are not typing)
const letterSplitter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
// a..b widened to whole letters (grapheme clusters: কে, ক্ষ, é)
function wholeLetters(text, a, b) {
  if (!letterSplitter) return [a, b];
  const from = Math.max(0, a - 24), to = Math.min(text.length, b + 24);
  let start = a, end = b;
  for (const s of letterSplitter.segment(text.slice(from, to))) {
    const s0 = from + s.index, s1 = s0 + s.segment.length;
    if (s0 < a && a < s1) start = s0;
    if (s0 < b && b < s1) end = s1;
  }
  return [start, end];
}
function setText(t, next, a, b, dir, keepScroll) {
  const old = t.value, top = t.scrollTop;
  let done = false;
  if (document.activeElement === t) {
    const max = Math.min(old.length, next.length);
    let p = 0, q = 0;
    while (p < max && old.charCodeAt(p) === next.charCodeAt(p)) p++;
    while (q < max - p && old.charCodeAt(old.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++;
    // whole letters only: a Bangla vowel sign or a joined letter must not be cut (the editor would drop it)
    const [a, e] = wholeLetters(old, p, old.length - q);
    p = a;
    q = old.length - e;
    t.setSelectionRange(p, old.length - q);
    settingText = true;
    try { done = document.execCommand('insertText', false, next.slice(p, next.length - q)) && t.value === next; } catch (_) { /* not available */ }
    settingText = false;
  }
  if (!done) t.value = next;
  t.setSelectionRange(a, b, dir);
  if (keepScroll) t.scrollTop = top;
}

// Numbers the page breaks from layout r. True if the text changed.
function syncPageMarks(r) {
  const t = $('sentence');
  const n = numberedMarks(t.value, r);
  if (!n) return false;
  setText(t, n.text, n.move(t.selectionStart), n.move(t.selectionEnd), t.selectionDirection, true);
  return true;
}

// The layout of text that is not in the text box yet (the braille size can follow the text).
function layoutFor(text) {
  if (pageOn() && (scaleMode() === 'fit' || scaleMode() === 'reduce')) applyPage(text);
  const settings = layoutSettings();
  if (pageOn() && state.pageError) throw new Error(state.pageError);
  return D.layout(text, settings, brailleOpts());
}

// Next page (and the voice command): a page break at the cursor on a line of its own, numbered at
// once - [[New Page 3]] when it starts page 3 - and the later breaks count on. One edit.
function insertPageBreak(t) {
  const start = t.selectionStart, end = t.selectionEnd, text = t.value;
  const before = text.slice(0, start), after = text.slice(end);
  const tail = after.startsWith('\n');   // the text goes on at the next line: use its line break
  const piece = (before && !before.endsWith('\n') ? '\n' : '') + '[[New Page]]' + (tail ? '' : '\n');
  let next = before + piece + after, caret = start + piece.length + (tail ? 1 : 0);
  try {
    const n = numberedMarks(next, layoutFor(next));
    if (n) { caret = n.move(caret); next = n.text; }
  } catch (_) { /* numbered by the next layout that works */ }
  if (next.length > D.MAX_CHARS) return false;
  setText(t, next, caret, caret);
  return true;
}

// Leaving the text box: the breaks get their numbers (a layout still waiting is done now).
function numberMarksNow() {
  if (state.printing) return;
  if (rebuildPending) {
    clearTimeout(rebuildTimer);
    rebuildPending = false;
    rebuild(pendingFollow, true);
  } else if (syncPageMarks(state.result)) scheduleRebuild(false);
}

function rebuild(followCaret, marks) {
  if (state.printing) return;
  const text = $('sentence').value;
  if (pageOn() && (scaleMode() === 'fit' || scaleMode() === 'reduce')) applyPage();   // the braille size follows the text
  try {
    const settings = layoutSettings();
    if (pageOn() && state.pageError) throw new Error(state.pageError);
    const r = D.layout(text, settings, brailleOpts());
    r.sheet = pageOn() ? state.sheet : null;
    r.paper = pageOn() ? state.paper : null;
    checkOnSheet(r);
    state.result = r;
    state.error = '';
    const n = state.result.pages.length;
    if (followCaret && n > 1 && text.length <= 60000) {
      const upto = text.slice(0, $('sentence').selectionEnd);
      try { state.page = D.layout(upto + 'x', settings, brailleOpts()).pages.length - 1; } catch (_) { /* keep page */ }
    }
    state.page = Math.max(0, Math.min(state.page, n - 1));
    if (marks || marksWanted || document.activeElement !== $('sentence')) {   // not while typing
      marksWanted = false;
      syncPageMarks(r);   // the same layout: only the numbers change
    }
  } catch (e) {
    state.result = null;
    state.error = e.message;
  }
  render();
  saveStore();
}

// Never outside the page: with a paper size, the furthest dots the layout can place
// (first dot, and the last dot of a full line on a full page) must lie wholly inside the margins.
function checkOnSheet(r) {
  if (!r.sheet) return;
  const s = r.settings;
  const far = [
    { x: s.originX, y: s.originY },
    { x: s.originX + (r.cols - 1) * s.cellPitch + s.dotPitch, y: s.originY - (r.rows - 1) * s.linePitch - 2 * s.dotPitch }
  ];
  if (D.offSheet(far, r.sheet, D.dotRadius(s))) throw new Error('The braille would go outside the paper. Check the paper size and margin.');
}

function estimateAll(r) {
  const rates = machine.info && machine.info.rates;
  const limit = Math.min(r.pages.length, 40);
  let t = 0, dots = 0;
  for (let i = 0; i < limit; i++) {
    const pts = D.pagePoints(r.pages[i], r.settings, { invert: invertOn() });
    t += D.estimate(pts, r.settings, rates);
    dots += pts.length;
  }
  return limit < r.pages.length && dots ? t * r.stats.dots / dots : t;
}

function render() {
  const r = state.result;
  $('charCount').textContent = fmtNum($('sentence').value.length) + ' chars';
  $('error').hidden = !state.error;
  $('error').textContent = state.error ? 'Fix the settings: ' + state.error : '';
  if (r) {
    $('statLetters').textContent = fmtNum(r.stats.letters);
    $('statDots').textContent = fmtNum(r.stats.dots);
    $('statLines').textContent = fmtNum(r.stats.lines);
    $('statPages').textContent = fmtNum(r.stats.pages);
    $('fitInfo').textContent = `${r.cols} cells × ${r.rows} lines fit on each sheet`;
  } else {
    for (const id of ['statLetters', 'statDots', 'statLines', 'statPages']) $(id).textContent = '–';
    $('fitInfo').textContent = '';
  }
  $('statPagesLabel').textContent = r && r.stats.pages === 1 ? 'Page' : 'Pages';
  updateTimeStat();
  if (r && r.unsupported.length) {
    const list = r.unsupported.slice(0, 12).map(u => `${u.ch} ×${u.count}`).join('   ');
    $('warn').textContent = `Not in the braille table (left as blank cells): ${list}${r.unsupported.length > 12 ? '   …' : ''}. Edit or replace them.`;
    $('warn').hidden = false;
  } else $('warn').hidden = true;
  // one control: green "Invert view" when invert print is on, red "Invert off" when it is off
  $('invertViewBtn').hidden = !invertOn();
  $('invertViewBtn').setAttribute('aria-pressed', String(state.sideView));
  $('invertOffTag').hidden = invertOn();
  $('invertState').textContent = invertOn() ? 'On' : 'Off';
  renderPager();
  renderBrailleText();   // first: the preview takes the room left above it
  renderPreview();
  renderGcode();
  updateControls();
  sendInvertState();
  drawSetupPreviews();   // Machine setup: live previews (only while shown)
}

// The Print bar says how long the text takes; while printing, the progress line counts down the time
// left for the job (00:00:00, hours:minutes:seconds), second by second, and holds while paused.
let timeTicker = 0;
function updateTimeStat() {
  const P = state.printing, cd = P && P.countdown;
  if (cd) {
    const left = cd.running ? cd.left - (Date.now() - cd.at) / 1000 : cd.left;
    $('progressLeft').textContent = fmtClock(Math.max(0, left)) + ' left';
    return;
  }
  $('progressLeft').textContent = '';
  const r = P ? P.result : state.result;
  const est = !r ? 0 : r.stats.dots ? estimateAll(r) : 0;
  const n = r ? r.pages.length : 0;
  $('barInfo').textContent = !r ? '' : !n ? 'Nothing to print yet' : `${n} ${n === 1 ? 'page' : 'pages'} · about ${fmtMin(est)}`;
}
// Called on every progress report while printing: time left on this page (measured by the
// machine link) plus the estimate for the pages still to come, corrected by the real speed.
function updateCountdown(p) {
  const P = state.printing;
  if (!P || !P.pageEst) return;
  const est = P.pageEst[p.page] || 0;
  const measured = p.eta != null && p.dotsDone >= Math.max(5, Math.ceil(p.dots * 0.1));   // enough dots for a steady speed
  // real speed vs. the estimate, learned on this page and kept for the next ones
  if (measured && est > 0) P.speed = Math.min(4, Math.max(0.25, (p.elapsed + p.eta) / est));
  const speed = P.speed || 1;
  const pageLeft = measured ? p.eta : p.dotsDone >= p.dots ? 0 : Math.max(0, est * speed - p.elapsed);
  let rest = 0;
  for (let k = p.page + 1; k <= P.to; k++) rest += P.pageEst[k] || 0;
  const left = pageLeft + rest * speed;
  const running = p.state === 'running' && p.dotsDone < p.dots;
  const cd = P.countdown;
  if (cd && cd.running && running) {
    const shown = cd.left - (Date.now() - cd.at) / 1000;
    if (Math.abs(left - shown) < Math.max(3, shown * 0.03)) return;   // keep ticking smoothly
  }
  P.countdown = { left: Math.max(0, left), at: Date.now(), running };
  updateTimeStat();
}

function renderPager() {
  const n = state.result ? state.result.pages.length : 0;
  $('pageLabel').textContent = n ? `Page ${state.page + 1} of ${n}` : 'No pages';
  $('prevPage').disabled = !n || state.page === 0 || !!state.printing;
  $('nextPage').disabled = !n || state.page >= n - 1 || !!state.printing;
}

// ---- braille preview: the sheet at its real shape, every dot where it will be punched (mm)
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, cls) {
  const e = document.createElementNS(SVGNS, tag);
  if (cls) e.setAttribute('class', cls);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
const n3 = v => String(Math.round(v * 1000) / 1000);

// What the preview shows, in machine mm: the paper (with a paper size) or else the print area.
function previewSheet(r) {
  const s = r.settings;
  if (r.paper && r.sheet) return { x0: 0, y0: 0, w: r.paper.w, h: r.paper.h, area: r.sheet, paper: true };
  const pad = Math.max(3, s.dotPitch);
  return {
    x0: s.originX - pad, y0: s.originY - s.height - pad, w: s.width + 2 * pad, h: s.height + 2 * pad,
    area: { minX: s.originX, maxX: s.originX + s.width, minY: s.originY - s.height, maxY: s.originY }, paper: false
  };
}

// Zoom: Fit page (the whole sheet in the window, above the Print bar), or 100 % / 200 %
// (real size on the screen, 96 px per inch; the box then scrolls).
const ZOOMS = ['fit', '100', '200'];
const zoomMode = () => { const z = document.querySelector('input[name=zoom]:checked'); return z ? z.value : 'fit'; };
const PX_PER_MM = 96 / 25.4;
// The height the preview box may take so the sheet, the braille text under it and the
// Print bar all fit in the window.
function fitHeight() {
  const wrap = $('preview');
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const below = $('brailleBox').offsetHeight + 12 + ($('error').hidden ? 0 : $('error').offsetHeight + 10) + 16 + 18;   // box, error, panel and window padding
  const bar = $('printBar').offsetHeight;
  return Math.max(300, Math.min(1100, window.innerHeight - top - below - bar - 12));
}
// Sizes the sheets, keeping their exact proportions (two side by side when the machine side is shown too).
function sizeSheet() {
  const wrap = $('preview'), sheets = [...wrap.querySelectorAll('svg.sheet')].filter(sv => sv.sheetInfo);
  const zoom = zoomMode();
  wrap.classList.toggle('zoomed', zoom !== 'fit' && sheets.length > 0);
  if (!sheets.length) { wrap.style.height = ''; return; }
  const n = sheets.length, gapPx = 24, capPx = n > 1 ? 24 : 0;
  const boxH = fitHeight();
  const maxH = boxH - 28 - capPx;   // inside the box padding, under the captions
  const availW = Math.max(120, (wrap.clientWidth - 28 - gapPx * (n - 1)) / n);
  wrap.style.height = zoom === 'fit' ? '' : boxH + 'px';   // zoomed: a steady box that scrolls
  for (const sv of sheets) {
    const { w, h, fs } = sv.sheetInfo;
    const k = zoom === 'fit' ? Math.min(availW / w, maxH / h) : PX_PER_MM * Number(zoom) / 100;   // px per mm
    sv.style.width = Math.floor(w * k) + 'px';
    sv.style.height = Math.floor(h * k) + 'px';
    sv.classList.toggle('no-labels', fs * k < 6.5);   // letters only when they are readable
  }
}
document.querySelectorAll('input[name=zoom]').forEach(z => z.addEventListener('change', () => {
  const wrap = $('preview');
  sizeSheet();
  wrap.scrollTop = wrap.scrollLeft = 0;   // start where the braille starts: top left
  saveStore();
}));

// One sheet as SVG in machine mm. Returns the SVG, the dots by "line:cell:dot" and the dots in
// punching order (the order the machine punches this layout).
function buildSheet(page, r, sh, cls) {
  const s = r.settings;
  const rad = D.dotRadius(s);                                     // dot radius (the dots stay 2 mm inside the margin line)
  const gap = s.linePitch - 2 * s.dotPitch - 2 * rad;             // free space between lines
  const fs = Math.max(0.5, Math.min(4.2, gap * 0.8, s.cellPitch * 0.55));   // letter size (mm)
  const sv = svgEl('svg', { viewBox: `${n3(sh.x0)} ${n3(-(sh.y0 + sh.h))} ${n3(sh.w)} ${n3(sh.h)}`, 'aria-hidden': 'true' }, 'sheet' + (sh.paper ? ' is-paper' : ' is-area') + (cls ? ' ' + cls : ''));
  sv.sheetInfo = { w: sh.w, h: sh.h, fs };
  sv.append(svgEl('rect', { x: n3(sh.x0), y: n3(-(sh.y0 + sh.h)), width: n3(sh.w), height: n3(sh.h) }, 'paper'));
  const a = sh.area;
  sv.append(svgEl('rect', { x: n3(a.minX), y: n3(-a.maxY), width: n3(a.maxX - a.minX), height: n3(a.maxY - a.minY) }, 'margin-line'));
  const byKey = new Map(), order = [];
  const frag = document.createDocumentFragment();
  page.forEach((line, li) => line.forEach((cell, ci) => {
    if (cell.kind === 'space' || (!cell.dots.length && cell.kind !== 'unknown')) return;
    const x = s.originX + ci * s.cellPitch, y = s.originY - li * s.linePitch;   // dot 1 of this cell
    const g = svgEl('g', {}, 'bcell' + (cell.kind === 'sign' ? ' sign' : cell.kind === 'unknown' ? ' unknown' : ''));
    const tip = svgEl('title');
    const what = D.cellWhat(cell);   // “@” (at sign), number sign, first cell of É (e acute) ...
    tip.textContent = cell.kind === 'letter' || cell.kind === 'digit' ? (cell.name ? what : cell.ch) : what.charAt(0).toUpperCase() + what.slice(1);
    g.append(tip);
    const label = svgEl('text', { x: n3(x + s.dotPitch / 2), y: n3(-y - rad - 0.35), 'font-size': n3(cell.kind === 'sign' ? fs * 0.8 : fs) }, 'blabel');
    label.textContent = cell.ch;   // '#' number sign, 'ltr' letter sign, 'g1' grade 1 sign; a sign's first cells have none
    g.append(label);
    if (cell.kind === 'unknown') {
      g.append(svgEl('rect', { x: n3(x - rad - 0.5), y: n3(-y - rad - 0.5), width: n3(s.dotPitch + 2 * rad + 1), height: n3(2 * s.dotPitch + 2 * rad + 1), rx: 0.5 }, 'unknown-box'));
    }
    const dots = [];
    for (let d = 1; d <= 6; d++) {
      const c = svgEl('circle', { cx: n3(x + (d > 3 ? s.dotPitch : 0)), cy: n3(-(y - ((d - 1) % 3) * s.dotPitch)), r: n3(rad) }, cell.dots.includes(d) ? 'dot on' : 'dot');
      g.append(c);
      dots.push(c);
    }
    for (const d of cell.dots) {
      const ref = { dot: dots[d - 1], cell: g };
      byKey.set(li + ':' + ci + ':' + d, ref);
      order.push(ref);
    }
    frag.append(g);
  }));
  sv.append(frag);
  return { sv, byKey, order };
}

function renderPreview() {
  const wrap = $('preview');
  wrap.replaceChildren();
  state.dotByKey = new Map();
  state.progEls = [];
  state.progEls2 = [];
  state.shownDone = 0;
  state.shownNow = -1;
  const r = state.result;
  const printingHere = !!(state.printing && state.printing.page === state.page);
  const printedInfo = !printingHere && state.printed && state.printed.result === r ? state.printed.pages.get(state.page) : undefined;
  wrap.classList.toggle('printing', printingHere || !!printedInfo);
  if (!r || !r.pages.length) {
    wrap.classList.remove('sheet-mode', 'two-sheets', 'zoomed');
    wrap.style.height = '';
    wrap.append(el('p', 'empty', state.error ? 'Fix the settings to see the braille.' : 'Type, speak or scan some text to see the braille.'));
    $('bounds').textContent = '';
    return;
  }
  const page = r.pages[state.page];
  const sh = previewSheet(r);
  const invert = invertOn();
  const both = state.sideView && invert;   // Invert view: the machine side next to the reading side
  wrap.classList.add('sheet-mode');
  wrap.classList.toggle('two-sheets', both);
  const reading = buildSheet(page, r, sh, '');
  state.dotByKey = reading.byKey;
  const col = (title, sv, extra) => {
    const c = el('div', 'sheet-col');
    if (both) {
      const cap = el('div', 'sheet-cap', title);
      if (extra) cap.append(extra);
      c.append(cap);
    }
    c.append(sv);
    return c;
  };
  wrap.append(col('Reading side', reading.sv));
  if (both) {
    const machineSide = buildSheet(D.machinePage(page, r.settings, { invert: true }), r, sh, 'mirrored');
    state.progEls2 = machineSide.order;   // same order as the machine punches
    const win = el('button', 'cap-btn', '↗');
    win.type = 'button';
    win.title = 'Open the machine side in its own window';
    win.setAttribute('aria-label', win.title);
    win.onclick = () => { if (desk) desk.invert.open(); };
    win.disabled = !desk;
    wrap.append(col('Machine side · mirrored', machineSide.sv, win));
  }
  sizeSheet();
  wrap.setAttribute('aria-label', `Braille preview, page ${state.page + 1}${r.paper ? ' on ' + r.paper.label : ''}: ${D.pageText(page).replace(/\n/g, ' / ') || 'blank'}`);
  const pts = D.pagePoints(page, r.settings, { invert });
  const b = D.bounds(pts);
  $('bounds').textContent = b
    ? `This page punches ${fmtNum(pts.length)} dots` + (b.minX < 0 || b.minY < 0 ? '   ⚠ below zero - check the start position' : '')
    : 'This page has no dots.';
  const keys = printingHere ? state.printing.keys : printedInfo ? printedInfo.keys : null;
  if (keys) state.progEls = keys.map(k => state.dotByKey.get(k));
  // the machine side only shows progress for a job that was punched mirrored
  const jobInverted = printingHere ? state.printing.invert : printedInfo ? state.printed.invert : false;
  if (!jobInverted) state.progEls2 = [];
  if (printingHere && state.printing.last) applyProgress(state.printing.last);
  else if (printedInfo) applyProgress({ dotsDone: printedInfo.dotsDone, current: -1 });
}

// ---- Braille text: the page as Unicode braille (U+2800 + dots), line by line, as it reads.
// For proofreading, braille displays and screen readers; unknown characters are blank cells.
const brailleChar = cell => (cell.kind === 'space' ? ' ' : String.fromCharCode(0x2800 + cell.dots.reduce((b, d) => b | (1 << (d - 1)), 0)));
const brailleLines = page => page.map(line => line.map(brailleChar).join('').replace(/ +$/, ''));
function renderBrailleText() {
  const r = state.result;
  const page = r && r.pages.length ? r.pages[state.page] : null;
  $('brailleTitle').textContent = page ? `Braille text · page ${state.page + 1}` : 'Braille text';
  $('brailleText').value = page ? brailleLines(page).join('\n') : '';
  $('copyBrailleBtn').disabled = !page;
}
$('copyBrailleBtn').onclick = async () => {
  const r = state.result;
  if (!r || !r.pages.length) return;
  try {
    const text = brailleLines(r.pages[state.page]).join('\n');
    if (desk) await desk.copyText(text); else await navigator.clipboard.writeText(text);
    flash(`Braille text of page ${state.page + 1} copied`);
  } catch (_) { flash('Copy failed'); }
};

function currentGcode() {
  const r = state.result;
  if (!r || !r.pages.length) return '';
  return D.gcode(r.pages[state.page], r.settings, state.page, r.pages.length, { invert: invertOn() });
}

function renderGcode() {
  if ($('output').hidden || !$('morePanel').open) return;   // not shown: nothing to draw (Copy and Save make their own)
  const r = state.result;
  if (!r) { $('output').textContent = '; ' + (state.error || 'No output'); return; }
  if (!r.pages.length) { $('output').textContent = '; Type text to get G-code.'; return; }
  $('output').textContent = currentGcode();
}

// ---- show / hide the G-code output
function applyShowGcode() {
  const show = $('showGcode').checked;
  $('output').hidden = !show;
  if (show) renderGcode();
}
$('showGcode').addEventListener('change', () => { applyShowGcode(); saveStore(); });
$('morePanel').addEventListener('toggle', () => { renderGcode(); saveStore(); });

function updateControls() {
  const P = state.printing;
  const printing = !!P;
  const r = state.result;
  const hasPages = !!(r && r.pages.length);
  const idle = machine.connected && /^Idle/.test(machine.state);
  const checking = machine.connected && /^Check/.test(machine.state);   // nothing moves: no safety tick needed
  const ready = ((idle && $('confirmed').checked) || checking) && hasPages && !printing && !state.ocrBusy;
  $('checkBtn').disabled = !(idle && !printing && r) || checkRun.running;
  $('checkBtn').classList.toggle('running', checkRun.running);
  $('printPageBtn').disabled = !ready;
  $('printAllBtn').disabled = !ready || r.pages.length < 2;
  $('printPageBtn').textContent = hasPages ? `Print page ${state.page + 1}` : 'Print this page';
  $('printAllBtn').textContent = hasPages && r.pages.length > 1 ? `Print all ${r.pages.length} pages` : 'Print all pages';
  // why Print is greyed out (shown on hover)
  const why = printing ? '' : !hasPages ? 'Type, speak or scan some text first.' : state.ocrBusy ? 'Wait until the scan is done.'
    : !machine.connected ? 'Connect the machine first.' : !(idle || checking) ? `The machine must be Idle (now: ${stateLabel(machine.state)}).`
    : !$('confirmed').checked && !checking ? 'Tick “Position and paper checked” first.' : '';
  $('printPageBtn').title = why;
  $('printAllBtn').title = why || (hasPages && r.pages.length < 2 ? 'There is only one page.' : '');
  $('pauseBtn').disabled = !printing || !P.jobActive;
  $('pauseBtn').textContent = P && P.paused ? 'Resume' : 'Pause';
  $('pauseBtn').classList.toggle('primary', !!(P && P.paused));
  $('stopBtn').disabled = !printing;

  const lockText = printing || state.ocrBusy;
  $('sentence').disabled = lockText;
  for (const k of FIELDS) $(k).disabled = printing;
  $('invertPrint').disabled = printing;
  for (const id of ['pageMode', 'paperSize', 'paperMargin', 'paperW', 'paperH', 'pdfPaper']) $(id).disabled = printing;
  document.querySelectorAll('input[name=orientation], input[name=marginUnit], input[name=pageScale]').forEach(r => { r.disabled = printing; });
  $('scalePct').disabled = printing || scaleMode() !== 'custom';
  $('resetBtn').disabled = printing || locked();
  $('pageBreakBtn').disabled = lockText;
  $('clearBtn').disabled = lockText;
  $('fixBtn').disabled = lockText;
  $('fixAllBtn').disabled = lockText || !fixer.issues.some(i => i.sure && i.options.length);
  $('ocrBtn').disabled = printing || !desk;
  $('voiceBtn').disabled = !desk || (lockText && voice.phase === 'off');
  $('openProjectBtn').disabled = printing || state.ocrBusy || !desk;
  $('saveProjectBtn').disabled = !desk;
  $('copyBtn').disabled = !hasPages;
  $('saveBtn').disabled = !hasPages || !desk;
  $('saveAllBtn').disabled = !hasPages || !desk;

  $('connectBtn').textContent = machine.connected ? 'Disconnect' : 'Connect';
  $('connectBtn').classList.toggle('primary', !machine.connected);
  $('connectBtn').disabled = !desk || machine.busy || printing;
  // Print bar: Connect while not connected, the position once connected
  $('barConnectBtn').hidden = machine.connected;
  $('barConnectBtn').disabled = !desk || machine.busy || printing;
  $('barConnectBtn').textContent = machine.busy && !machine.connected ? 'Connecting…' : 'Connect';
  $('posReadout').hidden = !machine.connected;
  $('barInfo').hidden = printing;
  $('portSelect').disabled = machine.connected || machine.busy || !desk;
  $('baudSelect').disabled = machine.connected || machine.busy;
  $('refreshPorts').disabled = machine.connected || machine.busy || !desk;
  const canMove = machine.connected && !printing && !checkRun.running && /^(Idle|Jog)/.test(machine.state);
  document.querySelectorAll('[data-jog]').forEach(b => { b.disabled = !canMove; });
  $('jogStop').disabled = !machine.connected || printing;
  $('zeroXY').disabled = $('zeroZ').disabled = !(idle && !printing);
  $('gotoStart').disabled = !(idle && !printing && r);
  $('unlockBtn').disabled = !machine.connected || printing;
  $('resetMachineBtn').disabled = !machine.connected;   // also while printing: it aborts the job
  $('homeBtn').hidden = !(machine.info && machine.info.homing);
  $('homeBtn').disabled = !machine.connected || printing;
  $('cmdInput').disabled = !machine.connected || printing;
  document.querySelector('#cmdForm button').disabled = !machine.connected || printing;
}

// ------------------------------------------------------------------ text + settings events
$('sentence').addEventListener('input', () => {
  if (!settingText) scheduleRebuild(true);
  fixerTextChanged();   // Auto correct follows the typing
});
for (const k of FIELDS) {
  $(k).addEventListener('input', () => {
    $('confirmed').checked = false;
    if (pageOn() && (k === 'dotPitch' || k === 'cellPitch' || k === 'linePitch')) applyPage();
    scheduleRebuild(false);
  });
}
$('pageMode').addEventListener('change', () => {
  if (pageOn()) manualArea = readArea();
  else if (manualArea) { for (const k of AREA_KEYS) $(k).value = manualArea[k]; manualArea = null; }
  $('confirmed').checked = false;
  applyPage();
  rebuild(false);
});
for (const id of ['paperSize', 'paperMargin', 'paperW', 'paperH']) {
  $(id).addEventListener(id === 'paperSize' ? 'change' : 'input', () => { $('confirmed').checked = false; applyPage(); scheduleRebuild(false); });
}
document.querySelectorAll('input[name=orientation]').forEach(r => r.addEventListener('change', () => { $('confirmed').checked = false; applyPage(); rebuild(false); }));
// cm <-> mm only changes how the margin is shown, not the margin itself
document.querySelectorAll('input[name=marginUnit]').forEach(r => r.addEventListener('change', () => { showMargin(marginMm()); applyPage(); saveStore(); }));
document.querySelectorAll('input[name=pageScale]').forEach(r => r.addEventListener('change', () => {
  $('confirmed').checked = false;
  applyPage();
  rebuild(false);
  if (scaleMode() === 'custom') $('scalePct').focus();
}));
$('scalePct').addEventListener('input', () => { $('confirmed').checked = false; applyPage(); scheduleRebuild(false); });
$('scalePct').addEventListener('change', () => { $('scalePct').value = customPct(); applyPage(); rebuild(false); });
$('pdfPaper').addEventListener('change', saveStore);
for (const id of ['autoNext', 'autoNextSec']) $(id).addEventListener('change', () => {
  if (id === 'autoNextSec') $('autoNextSec').value = autoSeconds() || Math.min(3600, Math.max(5, Math.round(Number.parseFloat($('autoNextSec').value)) || 30));
  $('autoNextSec').disabled = !$('autoNext').checked;
  saveStore();
});
$('confirmed').addEventListener('change', updateControls);
$('invertPrint').addEventListener('change', () => { $('confirmed').checked = false; render(); saveStore(); });
// Reset defaults (Machine setup › Machine values): the machine values only; the paper stays.
$('resetBtn').onclick = async () => {
  if (locked() || state.printing) return;
  if (!(await confirmBox('Reset the machine values?', 'Start position, print area, dot, cell and line pitch, Z heights, feed and dwell go back to the standard values. Your own values are lost.', 'Reset'))) return;
  writeSettings(D.DEFAULTS);
  manualArea = pageOn() ? readArea() : null;   // the standard start and area, for when the paper size is switched off
  $('confirmed').checked = false;
  applyPage();
  rebuild(false);
  flash('Machine values reset to the standard values.');
};
$('pageBreakBtn').onclick = () => {
  const t = $('sentence');
  if (t.disabled) return;
  t.focus();   // (the cursor is where it was)
  if (!insertPageBreak(t)) { flash('1,000,000 character limit reached.'); return; }
  clearTimeout(rebuildTimer);
  rebuildPending = false;
  rebuild(true, true);
};
// Clear: the whole text goes, as one edit - Undo (Ctrl+Z / ⌘Z) brings it back.
$('clearBtn').onclick = async () => {
  const t = $('sentence');
  if (t.disabled || !t.value) { t.focus(); return; }
  if (!(await confirmBox('Clear all text?', 'The text box is emptied. Undo (Ctrl+Z, on a Mac ⌘Z) brings the text back.', 'Clear'))) return;
  t.focus();
  setText(t, '', 0, 0);
  state.page = 0;
  clearTimeout(rebuildTimer);
  rebuildPending = false;
  rebuild(false, true);
  flash('Text cleared. Undo (Ctrl+Z) brings it back.');
};
// leaving the text box: by clicking elsewhere or Tab the numbers are written while it still has the
// focus (so Undo can take them back); blur covers the rest
document.addEventListener('pointerdown', e => { if (document.activeElement === $('sentence') && e.target !== $('sentence')) numberMarksNow(); }, true);
$('sentence').addEventListener('keydown', e => { if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) numberMarksNow(); });
$('sentence').addEventListener('blur', numberMarksNow);
$('prevPage').onclick = () => { if (state.page > 0) { state.page--; render(); } };
$('nextPage').onclick = () => { if (state.result && state.page < state.result.pages.length - 1) { state.page++; render(); } };
new ResizeObserver(() => sizeSheet()).observe($('preview'));
window.addEventListener('resize', () => sizeSheet());
// the page keeps room for the Print bar at the bottom (it can take two rows in a narrow window),
// and jumps and focus stop below the top bar
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bar-h', $('printBar').offsetHeight + 'px');
  sizeSheet();
}).observe($('printBar'));
new ResizeObserver(() => document.documentElement.style.setProperty('--head-h', $('appHeader').offsetHeight + 'px')).observe($('appHeader'));

// ------------------------------------------------------------------ auto correct
// Auto correct finds mistakes as you type (English and Bangla: spelling, sentences, punctuation, capitals)
// and underlines them in the text box; click one for its fixes (or right-click it, or Ctrl+.). The panel
// under the buttons counts them, lists them (Show suggestions) and makes the sure fixes at once (Fix all).
// Each fix is one edit: Undo takes it back. On or off with the Auto correct button (kept for next time).
const DC = window.DotSenseCheck;
const FIX_SHOWN = 60;
const FIX_LIVE_MAX = 100000;   // longer texts are checked when Auto correct is switched on, not while typing
const sureFix = i => i.sure && i.options.length > 0;
const marksEl = $('sentenceMarks');
const card = { f: null, index: -1 };

// asks the English dictionary about the words it has not seen yet
async function askSpelling() {
  if (!fixer.open || !desk || !desk.spell || fixer.noDict) return;
  if (fixer.asking) { fixer.again = true; return; }
  const words = DC.englishWords($('sentence').value).filter(w => !fixer.spell.has(w) && !fixer.myWords.has(w.toLowerCase()));
  if (!words.length) return;
  fixer.asking = true;
  renderFixer();
  let r;
  try { r = await desk.spell(words); } catch (e) { r = { ok: false, error: e.message }; }
  fixer.asking = false;
  if (r && r.ok) { fixer.error = ''; for (const [w, s] of Object.entries(r.results)) fixer.spell.set(w, s); }
  else {
    fixer.error = (r && r.error) || 'The spelling check did not work.';
    if (/not installed/.test(fixer.error)) fixer.noDict = true;   // (no use asking again until a restart)
  }
  if (fixer.again) { fixer.again = false; askSpelling(); }
  renderFixer();
}
// ␣ for spaces in short signs, so ", " can be told from ","
const showSpaces = s => (/^[\s\p{P}।]*$/u.test(s) && s.length <= 4 ? s.replace(/ /g, '␣') : s);
function renderFixer() {
  if (!fixer.open) return;
  const t = $('sentence');
  fixer.text = t.value;
  fixer.issues = DC.findIssues(t.value, { spell: fixer.spell, ignore: fixer.ignore, myWords: fixer.myWords });
  const list = fixer.issues;
  const fixable = list.filter(sureFix).length;
  $('fixAllBtn').disabled = !fixable || t.disabled;
  $('fixAllBtn').textContent = fixable ? `Fix all (${fixable})` : 'Fix all';
  // Show suggestions off: only the count and Fix all
  const showList = $('fixShow').checked;
  const more = showList && list.length > FIX_SHOWN ? ` · the first ${FIX_SHOWN} are shown` : '';
  $('fixStatus').textContent = fixer.error || (list.length ? `${list.length} suggestion${list.length === 1 ? '' : 's'}${more}` : fixer.asking ? '' : 'No mistakes found ✓') + (fixer.asking ? (list.length ? ' · ' : '') + 'checking spelling…' : '');
  renderMarks();
  refreshCard();
  const box = $('fixList'), active = document.activeElement;
  box.hidden = !showList || !list.length;
  if (!showList) { box.replaceChildren(); return; }
  // (a new list keeps the focus where it was: the same suggestion and button, or the one now there)
  let keep = null;
  if (active && box.contains(active)) {
    const li = active.closest('.fix-item'), at = [...box.children].indexOf(li);
    keep = { at, button: [...li.querySelectorAll('button')].indexOf(active), start: li.dataset.start };
  }
  box.replaceChildren(...list.slice(0, FIX_SHOWN).map(fixItem));
  if (keep) {
    const items = [...box.children];
    const li = items.find(x => x.dataset.start === keep.start) || items[Math.min(keep.at, items.length - 1)];
    const buttons = li ? [...li.querySelectorAll('button')] : [];
    (buttons[keep.button] || buttons[1] || $('fixClose')).focus();
  }
}
// Ignore / Add to dictionary for one mistake
function ignoreFix(f) { fixer.ignore.add(f.key); renderFixer(); }
function addWord(f) { fixer.myWords.add(f.found.toLowerCase()); saveStore(); renderFixer(); }
function fixItem(f) {
  const text = $('sentence').value;
  const li = el('li', 'fix-item');
  li.dataset.kind = f.kind;
  li.dataset.start = f.start + ':' + f.found;
  const ctx = el('button', 'fix-ctx');
  ctx.type = 'button';
  ctx.title = 'Show it in the text';
  const a = Math.max(0, f.start - 28), b = Math.min(text.length, f.end + 28);
  const flat = s => s.replace(/\s+/g, ' ');
  ctx.append((a > 0 ? '…' : '') + flat(text.slice(a, f.start)), el('mark', null, f.found ? showSpaces(f.found) : '‸'), flat(text.slice(f.end, b)) + (b < text.length ? '…' : ''));
  ctx.onclick = () => showFixPlace(f);
  const opts = el('div', 'fix-opts');
  f.options.forEach((o, k) => {
    const btn = el('button', 'btn small' + (k === 0 ? ' primary' : ''), showSpaces(o));
    btn.type = 'button';
    btn.title = `Use “${o}”`;
    btn.onclick = () => useFix(f, o);
    opts.append(btn);
  });
  const ignore = el('button', 'btn small ghost', 'Ignore');
  ignore.type = 'button';
  ignore.onclick = () => { const k = fixer.issues.indexOf(f); ignoreFix(f); focusFix(k); };
  opts.append(ignore);
  if (f.kind === 'spelling') {
    const add = el('button', 'btn small ghost', 'Add to dictionary');
    add.type = 'button';
    add.title = `“${f.found}” is right: never mark it again`;
    add.onclick = () => { const k = fixer.issues.indexOf(f); addWord(f); focusFix(k); };
    opts.append(add);
  }
  li.append(ctx, el('span', 'fix-why', f.why), opts);
  return li;
}
// the fix's first button, or the next one; with none shown Fix all, or Close when nothing is left
function focusFix(k) {
  const items = $('fixList').querySelectorAll('.fix-item');
  const item = items[Math.min(k, items.length - 1)];
  (item ? item.querySelector('.fix-opts .btn') : !$('fixAllBtn').disabled ? $('fixAllBtn') : $('fixClose')).focus();
}
function showFixPlace(f) {
  const t = $('sentence');
  t.focus();
  t.setSelectionRange(f.start, f.end);
  t.blur();
  t.focus();   // (scrolls the text box to it)
}
// inline: from the text box (the caret stays there), else from the list (the focus goes to the next one)
function useFix(f, replacement, inline) {
  const t = $('sentence');
  if (t.disabled) return;
  if (t.value.slice(f.start, f.end) !== f.found) { renderFixer(); return; }   // the text has changed meanwhile
  const k = fixer.issues.indexOf(f);
  t.focus();
  const caret = f.start + replacement.length;
  setText(t, t.value.slice(0, f.start) + replacement + t.value.slice(f.end), caret, caret);
  scheduleRebuild(false, true);
  renderFixer();
  askSpelling();
  if (!inline) focusFix(k);
}

// ---- the marks in the text box: a copy of the text behind it, with the mistakes underlined
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderMarks() {
  // (off, or a very long text: no marks - the copy still gives the text box its background)
  if (!fixer.open || fixer.text.length > FIX_LIVE_MAX) { marksEl.textContent = ''; syncMarks(); return; }
  const text = fixer.text, out = [];
  let at = 0;
  fixer.issues.forEach((f, k) => {
    if (f.start < at) return;
    out.push(escapeHtml(text.slice(at, f.start)));
    const active = k === card.index ? ' data-active' : '';
    out.push(f.start === f.end
      ? `<mark class="at" data-i="${k}" data-kind="${f.kind}"${active}>​</mark>`
      : `<mark data-i="${k}" data-kind="${f.kind}"${active}>${escapeHtml(text.slice(f.start, f.end))}</mark>`);
    at = f.end;
  });
  out.push(escapeHtml(text.slice(at)) + '​');   // (a last empty line keeps its height)
  marksEl.innerHTML = out.join('');
  syncMarks();
}
// same box, font and scroll as the text box (a scroll bar there takes room from the text)
const MARK_STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariantLigatures', 'fontFeatureSettings',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'direction', 'textAlign',
  'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
function syncMarks() {
  const t = $('sentence'), cs = getComputedStyle(t), st = marksEl.style;
  for (const p of MARK_STYLE) st[p] = cs[p];
  const bar = t.offsetWidth - t.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
  st.paddingRight = (parseFloat(cs.paddingRight) + Math.max(0, bar)) + 'px';
  st.paddingBottom = (parseFloat(cs.paddingBottom) + 60) + 'px';   // (room to scroll as far as the text box can)
  st.width = t.offsetWidth + 'px';
  st.height = t.offsetHeight + 'px';
  st.left = t.offsetLeft + 'px';
  st.top = t.offsetTop + 'px';
  marksEl.scrollTop = t.scrollTop;
  marksEl.scrollLeft = t.scrollLeft;
}
// Typing: the marks move with the text at once (the ones at the change go), then the text is checked
// again half a second after the last key.
function fixerTextChanged() {
  if (!fixer.open) return;
  const next = $('sentence').value, old = fixer.text;
  if (next === old) return;
  const max = Math.min(old.length, next.length);
  let p = 0, q = 0;
  while (p < max && old.charCodeAt(p) === next.charCodeAt(p)) p++;
  while (q < max - p && old.charCodeAt(old.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++;
  const oldEnd = old.length - q, delta = next.length - old.length;
  fixer.issues = fixer.issues.filter(f => f.end < p || f.start > oldEnd)
    .map(f => (f.start > oldEnd ? Object.assign({}, f, { start: f.start + delta, end: f.end + delta }) : f));
  fixer.text = next;
  closeCard();
  renderMarks();
  clearTimeout(fixer.timer);
  if (next.length <= FIX_LIVE_MAX) fixer.timer = setTimeout(() => { renderFixer(); askSpelling(); }, 500);
}

// ---- one mistake's fixes, next to it (a click on it, or Ctrl+.)
function issueAt(pos) {
  if (!fixer.open || fixer.text !== $('sentence').value) return -1;
  return fixer.issues.findIndex(f => (f.start === f.end ? pos === f.start : f.start <= pos && pos <= f.end));
}
function cardButton(text, cls, title, onclick) {
  const b = el('button', 'btn small' + (cls ? ' ' + cls : ''), text);
  b.type = 'button';
  if (title) b.title = title;
  b.onclick = onclick;
  return b;
}
function openCard(k, focusFirst) {
  const f = fixer.issues[k];
  if (!f) { closeCard(); return; }
  card.f = f;
  card.index = k;
  for (const m of marksEl.querySelectorAll('mark[data-active]')) m.removeAttribute('data-active');
  const mk = marksEl.querySelector(`mark[data-i="${k}"]`);
  if (mk) mk.setAttribute('data-active', '');
  $('fixCardWhy').textContent = f.why + (f.found.trim() ? ` · “${f.found.length > 30 ? f.found.slice(0, 30) + '…' : f.found}”` : '');
  const buttons = f.options.map((o, i) => cardButton(showSpaces(o), i === 0 ? 'primary' : '', `Use “${o}”`, () => { closeCard(); useFix(f, o, true); }));
  buttons.push(cardButton('Ignore', 'ghost', 'Do not mark this again (until DotSense restarts)', () => { closeCard(true); ignoreFix(f); }));
  if (f.kind === 'spelling') buttons.push(cardButton('Add to dictionary', 'ghost', `“${f.found}” is right: never mark it again`, () => { closeCard(true); addWord(f); }));
  $('fixCardOpts').replaceChildren(...buttons);
  $('fixCard').hidden = false;
  placeCard();
  if (focusFirst) buttons[0].focus();
}
function placeCard() {
  const box = $('fixCard');
  if (box.hidden || !card.f) return;
  const mk = marksEl.querySelector(`mark[data-i="${card.index}"]`);
  if (!mk) { closeCard(); return; }
  const r = mk.getBoundingClientRect(), tr = $('sentence').getBoundingClientRect();
  if (r.bottom < tr.top || r.top > tr.bottom) { closeCard(); return; }   // scrolled out of sight
  const w = box.offsetWidth, h = box.offsetHeight;
  const left = Math.min(Math.max(8, r.left - 8), window.innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}
function closeCard(refocus) {
  if ($('fixCard').hidden) return;
  $('fixCard').hidden = true;
  card.f = null;
  card.index = -1;
  for (const m of marksEl.querySelectorAll('mark[data-active]')) m.removeAttribute('data-active');
  if (refocus) $('sentence').focus();
}
// after a new check: the same mistake's card again, or none
function refreshCard() {
  if (!card.f) return;
  const old = card.f, k = fixer.issues.findIndex(f => f.start === old.start && f.end === old.end && f.kind === old.kind);
  if (k < 0) closeCard(); else openCard(k, $('fixCard').contains(document.activeElement));
}
$('sentence').addEventListener('click', () => {
  const t = $('sentence');
  if (!fixer.open) return;
  const k = t.selectionStart === t.selectionEnd ? issueAt(t.selectionStart) : -1;
  if (k >= 0) openCard(k); else closeCard();
});
$('sentence').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '.') {
    e.preventDefault();
    const k = issueAt($('sentence').selectionStart);
    if (k >= 0) openCard(k, true);
  } else if (e.key === 'Escape' && !$('fixCard').hidden) {
    e.preventDefault();
    e.stopPropagation();
    closeCard();
  }
});
$('fixCard').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCard(true); }
});
document.addEventListener('mousedown', e => {
  if (!$('fixCard').hidden && !$('fixCard').contains(e.target) && e.target !== $('sentence')) closeCard();
}, true);
$('sentence').addEventListener('scroll', () => {
  marksEl.scrollTop = $('sentence').scrollTop;
  marksEl.scrollLeft = $('sentence').scrollLeft;
  placeCard();
});
window.addEventListener('scroll', () => placeCard(), true);
window.addEventListener('resize', () => { syncMarks(); placeCard(); });
new ResizeObserver(() => { syncMarks(); placeCard(); }).observe($('sentence'));
// right-click: this word's fixes, then Cut, Copy, Paste, Select all
$('sentence').addEventListener('contextmenu', async e => {
  if (!desk || !desk.textMenu) return;
  e.preventDefault();
  closeCard();
  const t = $('sentence');
  const k = issueAt(t.selectionStart), f = fixer.issues[k];
  const items = [];
  if (f) {
    items.push({ label: f.why, enabled: false });
    f.options.slice(0, 8).forEach((o, i) => items.push({ id: 'use:' + i, label: showSpaces(o) }));
    items.push({ id: 'ignore', label: 'Ignore' });
    if (f.kind === 'spelling') items.push({ id: 'add', label: 'Add to dictionary' });
    items.push({ type: 'separator' });
  }
  const sel = t.selectionStart !== t.selectionEnd;
  items.push({ role: 'cut', enabled: sel && !t.disabled }, { role: 'copy', enabled: sel }, { role: 'paste', enabled: !t.disabled },
    { type: 'separator' }, { role: 'selectAll' });
  const id = await desk.textMenu(items);
  if (!id || !f || fixer.issues[k] !== f) return;
  if (id === 'ignore') ignoreFix(f);
  else if (id === 'add') addWord(f);
  else if (id.startsWith('use:')) useFix(f, f.options[Number(id.slice(4))], true);
});

// ---- on / off
function openFixer(focus) {
  fixer.open = true;
  fixer.error = '';
  $('fixBar').hidden = false;
  $('fixBtn').setAttribute('aria-expanded', 'true');
  renderFixer();
  askSpelling();
  if (focus) focusFix(0);
  saveStore();
}
function closeFixer() {
  fixer.open = false;
  clearTimeout(fixer.timer);
  closeCard();
  renderMarks();
  $('fixBar').hidden = true;
  $('fixBtn').setAttribute('aria-expanded', 'false');
  $('fixBtn').focus();
  saveStore();
}
// Auto correct switches it on, and off when clicked again
$('fixBtn').onclick = () => (fixer.open ? closeFixer() : openFixer(true));
$('fixClose').onclick = closeFixer;
// Show suggestions: the list, or only the count and Fix all (kept for next time)
$('fixShow').checked = stored.fixShow !== false;
$('fixShow').addEventListener('change', () => {
  renderFixer();
  saveStore();
});
$('fixAllBtn').onclick = () => {
  const t = $('sentence');
  const items = fixer.issues.filter(sureFix);
  if (!items.length || t.disabled) return;
  const next = DC.applyAll(t.value, items);
  const caret = Math.min(t.selectionEnd, next.length);
  t.focus();
  setText(t, next, caret, caret);
  scheduleRebuild(false, true);
  renderFixer();
  askSpelling();
  flash(`${items.length} fix${items.length === 1 ? '' : 'es'} made. Undo (Ctrl+Z) takes them back.`);
  focusFix(0);
};

// ------------------------------------------------------------------ output buttons
let flashTimer = 0;
function flash(msg) {
  $('statusMsg').textContent = msg;
  $('statusMsg').title = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $('statusMsg').textContent = ''; }, 4000);
}
function baseName() {
  const words = $('sentence').value.replace(PAGE_MARKS, ' ').trim().toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.slice(0, 4).join('_') || 'dotsense';
}
$('copyBtn').onclick = async () => {
  try {
    const text = currentGcode();
    if (desk) await desk.copyText(text); else await navigator.clipboard.writeText(text);
    flash('Copied');
  } catch (_) { flash('Copy failed'); }
};
$('saveBtn').onclick = async () => {
  const r = state.result;
  if (!r || !desk) return;
  const suffix = (r.pages.length > 1 ? '_page-' + String(state.page + 1).padStart(2, '0') : '') + (invertOn() ? '_invert' : '');
  const res = await desk.save({ kind: 'gcode', name: baseName() + suffix, content: currentGcode() });
  flash(res.ok ? 'Saved: ' + res.filePath : res.canceled ? '' : res.error);
};
$('saveAllBtn').onclick = async () => {
  const r = state.result;
  if (!r || !desk) return;
  const invert = invertOn();
  const pages = r.pages.map((p, i) => ({ name: 'page-' + String(i + 1).padStart(3, '0') + '.gcode', content: D.gcode(p, r.settings, i, r.pages.length, { invert }) }));
  const res = await desk.save({ kind: 'zip', name: baseName() + (invert ? '_invert' : '') + '_pages', pages });
  flash(res.ok ? 'Saved: ' + res.filePath : res.canceled ? '' : res.error);
};

// ------------------------------------------------------------------ dialogs
function confirmBox(title, text, okLabel) {
  return new Promise(resolve => {
    const dlg = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel || 'OK';
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
    $('confirmCancel').focus();
  });
}

// ------------------------------------------------------------------ projects
function fromBrailleGcode2(s) {
  const m = Number(s.margin) || 0;
  return {
    originX: s.originX + m, originY: s.originY - m, width: s.width - 2 * m, height: s.height - 2 * m,
    dotPitch: s.dotPitch, cellPitch: s.cellPitch, linePitch: s.linePitch,
    clearZ: s.clearZ, punchZ: s.punchZ, feed: s.feed, dwell: s.dwell
  };
}
$('saveProjectBtn').onclick = async () => {
  if (!desk) return;
  let settings;
  try { settings = D.geometry(readSettings()).settings; } catch (e) { flash(e.message); return; }
  const page = {
    on: pageOn(), size: $('paperSize').value, orientation: orientation(), margin: marginMm(), marginUnit: marginUnit(), w: Number.parseFloat($('paperW').value), h: Number.parseFloat($('paperH').value),
    scale: scaleMode(), scalePct: customPct(), pdfPaper: $('pdfPaper').checked
  };
  const sheet = { auto: $('autoNext').checked, seconds: autoSeconds() || Number.parseFloat($('autoNextSec').value) };
  const content = JSON.stringify({ format: 'dotsense-project', version: 1, text: $('sentence').value, settings, invert: invertOn(), braille: brailleOpts(), page, sheet, sources: ocr.sources }, null, 2);
  const res = await desk.save({ kind: 'project', name: baseName(), content });
  flash(res.ok ? 'Project saved: ' + res.filePath : res.canceled ? '' : res.error);
};
$('openProjectBtn').onclick = async () => {
  if (!desk) return;
  const res = await desk.openProject();
  if (res.canceled) return;
  if (!res.ok) { flash(res.error); return; }
  const p = res.project || {};
  let settings;
  if (p.format === 'dotsense-project') settings = p.settings;
  else if (p.format === 'braille-project' && p.version === 2 && p.settings) settings = fromBrailleGcode2(p.settings);
  else { flash('This is not a DotSense or Braille Gcode project file.'); return; }
  if (typeof p.text !== 'string' || p.text.length > D.MAX_CHARS) { flash('The project text is missing or too long.'); return; }
  try { settings = D.geometry(settings).settings; } catch (e) { flash('Project settings: ' + e.message); return; }
  if ($('sentence').value.trim() && $('sentence').value !== p.text) {
    if (!(await confirmBox('Open project?', 'This replaces the current text and settings. Save them first if you need them.', 'Open project'))) return;
  }
  $('sentence').value = p.text;
  $('pageMode').checked = false;   // the project's own settings come first
  manualArea = null;
  writeSettings(settings);
  if (typeof p.invert === 'boolean') $('invertPrint').checked = p.invert;
  restorePage(p.page, p.sheet);
  ocr.sources = Array.isArray(p.sources) ? p.sources.filter(x => x && typeof x.label === 'string' && typeof x.status === 'string') : [];
  renderSources();
  $('confirmed').checked = false;
  state.page = 0;
  rebuild(false);
  flash('Project opened. Check the machine settings.');
};

// ------------------------------------------------------------------ OCR (images + PDF)
function renderSources() {
  $('sources').replaceChildren(...ocr.sources.map(s => el('li', null, s.label + ' - ' + s.status)));
}
function listFiles() {
  const files = [...$('files').files];
  const size = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  $('fileList').replaceChildren(...files.map(f => el('li', null, `${f.name} · ${size(f.size)}`)));
  $('ocrStatus').textContent = files.length ? `${files.length} file(s) selected. They are read in this order.` : '';
  $('ocrProgress').value = 0;
}
function showFiles(fileList) {
  try {
    const dt = new DataTransfer();
    for (const f of fileList) dt.items.add(f);
    $('files').files = dt.files;
  } catch (_) { /* keep previous selection */ }
  listFiles();
}
function setFiles(fileList) {
  document.querySelector('input[name=importMode][value=replace]').checked = true;
  showFiles(fileList);
}
function openOcr(files) {
  syncLang();
  const dlg = $('ocrDialog');
  if (!dlg.open) { ocr.runs = 0; dlg.showModal(); }
  if (files && files.length) setFiles(files);
  setTimeout(pumpPhone, 0);   // photos from the phone that came while it could not be shown
}
function ocrControls() {
  const busy = ocr.busy;
  $('extractBtn').disabled = busy;
  $('stopOcrBtn').disabled = !busy;
  $('ocrClose').disabled = busy;
  for (const id of ['files', 'pdfStart', 'pdfEnd', 'forceOcr', 'sourceBreak', 'keepLines']) $(id).disabled = busy;
  document.querySelectorAll('input[name=importMode]').forEach(i => { i.disabled = busy; });
  $('dropzone').style.pointerEvents = busy ? 'none' : '';
}
$('ocrBtn').onclick = () => openOcr();
$('ocrClose').onclick = () => { if (!ocr.busy) $('ocrDialog').close(); };
$('ocrDialog').addEventListener('cancel', e => { if (ocr.busy) e.preventDefault(); });
$('files').onchange = () => { document.querySelector('input[name=importMode][value=replace]').checked = true; listFiles(); };
const dz = $('dropzone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  e.stopPropagation();
  dz.classList.remove('over');
  if (!ocr.busy && e.dataTransfer && e.dataTransfer.files.length) setFiles(e.dataTransfer.files);
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => /\.(png|jpe?g|bmp|webp|pdf)$/i.test(f.name));
  if (files.length && !state.printing && !ocr.busy && desk) openOcr(files);
});
for (const id of ['forceOcr', 'sourceBreak', 'keepLines']) $(id).addEventListener('change', saveStore);

function addText(text, label, method) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (clean) {
    const run = ocr.run;
    const replacing = run && !run.received && run.mode === 'replace';
    const separator = $('sourceBreak').checked ? '\n[[New Page]]\n' : '\n\n';   // numbered by the layout
    const base = replacing ? '' : $('sentence').value;
    const next = base + (base.trim() ? separator : '') + clean;
    if (next.length > D.MAX_CHARS) throw new Error('1,000,000 character limit reached. Save this project and start a new one.');
    if (replacing) { ocr.sources = []; state.page = 0; }
    $('sentence').value = next;
    ocr.added.push({ label, text: clean });
    if (run) run.received = true;
    scheduleRebuild(false, true);
  }
  ocr.sources.push({ label, status: clean ? method : 'No text found - check this source' });
  renderSources();
}

// "Choose paper size by PDF page size": the listed size that matches the PDF page (within 2 mm),
// otherwise User-Defined with the page's own size; the orientation follows the page.
function paperFromPdf(size) {
  const r1 = n => Math.round(n * 10) / 10;
  const short = Math.min(size.w, size.h), long = Math.max(size.w, size.h);
  const landscape = size.w > size.h + 0.5;
  const match = D.PAPER_SIZES.find(p => p.id !== 'custom' && Math.abs(Math.min(p.w, p.h) - short) <= 2 && Math.abs(Math.max(p.w, p.h) - long) <= 2);
  if (match) $('paperSize').value = match.id;
  else { $('paperSize').value = 'custom'; $('paperW').value = r1(short); $('paperH').value = r1(long); }
  document.querySelector(`input[name=orientation][value=${landscape ? 'landscape' : 'portrait'}]`).checked = true;
  $('confirmed').checked = false;
  applyPage();
  return `Paper size from the PDF: ${match ? match.label : `User-Defined ${r1(short)} × ${r1(long)} mm`}, ${landscape ? 'landscape' : 'portrait'}.`;
}

// A picture made ready for OCR - the same for a chosen file, a photo from the phone and a scanned PDF
// page: upright (a camera photo's turn note applied), grey, and the paper made evenly white: shadows and
// uneven light are divided out (the paper's brightness, taken from a small copy where the ink is gone).
// Tiny pictures are doubled (small letters read badly), huge ones made smaller. Sent as a grey PGM:
// nothing packed, nothing lost.
const OCR_MAX_SIDE = 4200, OCR_SMALL_SIDE = 1400;
async function pictureForOcr(source) {
  let canvas = source, own = false;
  if (!(source instanceof HTMLCanvasElement)) {
    const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const long = Math.max(bmp.width, bmp.height);
    const k = long > OCR_MAX_SIDE ? OCR_MAX_SIDE / long : long < OCR_SMALL_SIDE ? Math.min(2, (2 * OCR_SMALL_SIDE) / long) : 1;
    canvas = document.createElement('canvas');
    own = true;
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#fff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.imageSmoothingQuality = 'high';
    c.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
  }
  const W = canvas.width, H = canvas.height;
  try {
    const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const grey = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < grey.length; i++, j += 4) grey[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    evenLight(grey, W, H);
    const head = new TextEncoder().encode(`P5\n${W} ${H}\n255\n`);
    const out = new Uint8Array(head.length + grey.length);
    out.set(head);
    out.set(grey, head.length);
    return out.buffer;
  } finally {
    if (own) canvas.width = canvas.height = 0;
  }
}
// grey / paper brightness: the paper white everywhere, the ink as dark as it was against it
function evenLight(g, W, H) {
  const F = 32, sw = Math.ceil(W / F), sh = Math.ceil(H / F);
  const sum = new Float64Array(sw * sh), cnt = new Uint32Array(sw * sh);
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / F) * sw;
    for (let x = 0, i = y * W; x < W; x++, i++) { const k = row + Math.floor(x / F); sum[k] += g[i]; cnt[k]++; }
  }
  let small = new Float32Array(sw * sh);
  for (let k = 0; k < small.length; k++) small[k] = sum[k] / cnt[k];
  const middle = Float32Array.from(small).sort()[small.length >> 1];
  if (middle < 100) return;   // light letters on a dark picture: left grey
  // the paper: the brightest nearby (the ink gone), smoothed
  const pass = (src, pick) => {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let acc = pick === 'max' ? 0 : 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= sh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= sw) continue;
            const v = src[yy * sw + xx];
            if (pick === 'max') { if (v > acc) acc = v; } else { acc += v; n++; }
          }
        }
        dst[y * sw + x] = pick === 'max' ? acc : acc / n;
      }
    }
    return dst;
  };
  small = pass(pass(pass(small, 'max'), 'mean'), 'mean');
  // divide, the paper's brightness taken between the small copy's points
  const x0s = new Int32Array(W), x1s = new Int32Array(W), txs = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = Math.min(Math.max((x + 0.5) / F - 0.5, 0), sw - 1);
    x0s[x] = Math.floor(fx); x1s[x] = Math.min(x0s[x] + 1, sw - 1); txs[x] = fx - x0s[x];
  }
  for (let y = 0; y < H; y++) {
    const fy = Math.min(Math.max((y + 0.5) / F - 0.5, 0), sh - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sh - 1), ty = fy - y0;
    const r0 = y0 * sw, r1 = y1 * sw;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const a0 = small[r0 + x0s[x]], a = a0 + (small[r0 + x1s[x]] - a0) * txs[x];
      const b0 = small[r1 + x0s[x]], b = b0 + (small[r1 + x1s[x]] - b0) * txs[x];
      const bg = a + (b - a) * ty;
      const v = bg > 1 ? (g[i] * 255) / bg : 255;
      g[i] = v > 255 ? 255 : v;
    }
  }
}

// OCR: Bangla and English together, whatever the language switch says (main.js, ocr-text.js)
async function ocrPicture(source) {
  let bytes = null;
  try { bytes = await pictureForOcr(source); } catch (_) { /* read the file as it is */ }
  if (!bytes && source instanceof Blob) bytes = await source.arrayBuffer();
  if (!bytes) throw new Error('This picture cannot be opened.');
  const r = await desk.ocr(bytes, { keepLines: $('keepLines').checked });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

let pdfjs = null;
async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('./node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
  }
  return pdfjs;
}

async function readPdf(file) {
  const lib = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let task;
  try {
    task = lib.getDocument({
      data: bytes, isEvalSupported: false,
      cMapUrl: new URL('./node_modules/pdfjs-dist/cmaps/', import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
      wasmUrl: new URL('./node_modules/pdfjs-dist/wasm/', import.meta.url).href
    });
    const doc = await task.promise;
    const start = Number($('pdfStart').value || 1);
    const end = $('pdfEnd').value ? Number($('pdfEnd').value) : doc.numPages;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || start > doc.numPages || end > doc.numPages) {
      throw new Error(`Page range ${start}-${end} is not valid: this PDF has ${doc.numPages} page(s).`);
    }
    for (let n = start; n <= end && !ocr.stop; n++) {
      const page = await doc.getPage(n);
      if (ocr.run && !ocr.run.pdfPage) {
        const v = page.getViewport({ scale: 1 });   // PDF points, page rotation included
        ocr.run.pdfPage = { w: v.width * 25.4 / 72, h: v.height * 25.4 / 72 };
      }
      ocr.prefix = `${file.name} · page ${n} of ${doc.numPages}`;
      $('ocrStatus').textContent = ocr.prefix;
      let text = '';
      let method = 'PDF text';
      // The text stored in Bangla PDFs comes out scrambled (vowel signs, conjuncts, old fonts),
      // so a page with Bangla in it is read with OCR.
      if (!$('forceOcr').checked) {
        const content = await page.getTextContent();
        text = content.items.map(i => (i.str || '') + (i.hasEOL ? '\n' : ' ')).join('');
        if (/[ঀ-৿]/.test(text)) text = '';
      }
      if (!text.trim()) {
        method = 'OCR';
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, Math.sqrt(16000000 / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        try { text = await ocrPicture(canvas); } finally { canvas.width = canvas.height = 0; }
      }
      addText(text, `${file.name} / page ${n}`, method);
      page.cleanup();
      $('ocrProgress').value = 100 * (n - start + 1) / (end - start + 1);
      await new Promise(res => setTimeout(res, 0));
    }
  } finally {
    if (task) await task.destroy();
  }
}

async function runExtract() {
  if (!desk || ocr.busy) return;
  const files = [...$('files').files];
  if (!files.length) { $('ocrStatus').textContent = 'Choose images or PDF files first.'; return; }
  if (voice.phase !== 'off') await stopVoice();
  const mode = document.querySelector('input[name=importMode]:checked').value;
  ocr.run = { mode, received: false, previousText: $('sentence').value };
  ocr.added = [];
  ocr.busy = true;
  ocr.stop = false;
  state.ocrBusy = true;
  $('ocrProgress').value = 0;
  ocrControls();
  updateControls();
  let errors = 0;
  try {
    for (const file of files) {
      if (ocr.stop) break;
      ocr.prefix = file.name;
      $('ocrStatus').textContent = file.name;
      try {
        const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
        if (file.size > (isPdf ? 100 : 20) * 1024 * 1024) throw new Error(`File is larger than ${isPdf ? 100 : 20} MB.`);
        if (isPdf) await readPdf(file);
        else addText(await ocrPicture(file), file.name, 'OCR');
      } catch (e) {
        errors++;
        ocr.sources.push({ label: file.name, status: 'FAILED: ' + e.message });
        renderSources();
      }
    }
    const outcome = ocr.run.received
      ? (mode === 'replace' ? 'The text box now has the scanned text (old text replaced).' : 'The scanned text was added at the end.')
      : 'No text was found. Your text was kept.';
    const paperNote = ocr.run.received && ocr.run.pdfPage && pageOn() && $('pdfPaper').checked ? ' ' + paperFromPdf(ocr.run.pdfPage) : '';
    $('ocrStatus').textContent = (ocr.stop ? 'Stopped. ' : 'Done. ') + outcome + (errors ? ` ${errors} file(s) failed - see the list.` : '') + paperNote;
    $('ocrProgress').value = 100;
    if (ocr.run.received) { const t = $('sentence'); t.scrollTop = mode === 'replace' ? 0 : t.scrollHeight; }
  } finally {
    if (ocr.run && !ocr.run.received) $('sentence').value = ocr.run.previousText;
    ocr.run = null;
    ocr.busy = false;
    ocr.runs++;
    state.ocrBusy = false;
    ocrControls();
    updateControls();
    scheduleRebuild(false);
    setTimeout(pumpPhone, 0);   // photos that came while this was reading
  }
}
$('extractBtn').onclick = () => runExtract();
$('stopOcrBtn').onclick = () => { ocr.stop = true; $('ocrStatus').textContent = 'Stopping after the current page. Finished text is kept.'; };
if (desk) desk.onOcrProgress(({ status, progress }) => {
  if (!ocr.busy) return;
  $('ocrStatus').textContent = ocr.prefix + ' · ' + status + (progress ? ' ' + Math.round(progress * 100) + '%' : '');
});

// ------------------------------------------------------------------ language (voice typing)
// Scanning reads Bangla and English by itself; this choice is for voice typing.
function syncLang() {}
function setLang(lang) {
  document.querySelector(`input[name=inputLang][value=${lang === 'bn' ? 'bn' : 'en'}]`).checked = true;
  syncLang();
}
async function onLangChange() {
  syncLang();
  saveStore();
  // voice typing on: carry on with the other language's model
  if (voice.phase === 'listening' || voice.phase === 'preparing') {
    closeMic();
    await desk.voice.cancel();
    startVoice();
  } else if (voice.phase === 'choose') startVoice();
}
document.querySelectorAll('input[name=inputLang]').forEach(r => r.addEventListener('change', onLangChange));

// ------------------------------------------------------------------ voice typing
function setVoice(phase, status) {
  voice.phase = phase;
  const bar = $('voiceBar');
  bar.hidden = phase === 'off';
  bar.dataset.state = phase;
  if (phase !== 'listening') bar.dataset.speech = '0';
  if (status != null) $('voiceStatus').textContent = status;
  $('voiceChoice').hidden = phase !== 'choose';
  if (phase === 'choose') {
    const bn = inputLang() === 'bn';
    $('voiceChoiceText').textContent = bn
      ? 'Bangla voice typing works offline. It needs a one-time download of the Bangla speech model:'
      : 'Voice typing works offline. It needs a one-time download of a speech model:';
    $('dlAccurate').hidden = $('dlFast').hidden = bn;
    $('dlBangla').hidden = !bn;
  }
  if (phase !== 'preparing') $('voiceProgress').hidden = true;
  if (phase !== 'listening') $('voicePartial').textContent = '';
  const on = phase === 'preparing' || phase === 'listening' || phase === 'finishing';
  $('voiceBtn').setAttribute('aria-pressed', String(on));
  $('voiceBtnText').textContent = on ? 'Stop voice' : 'Voice typing';
  updateControls();
}
function setVoiceProgress(f) {
  $('voiceProgress').hidden = false;
  $('voiceProgressFill').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
}
function voiceError(msg) {
  closeMic();
  setVoice('error', msg);
}

// The voice model for the chosen language: Bangla, or the English model the person picked.
const activeVoiceModel = () => (inputLang() === 'bn' ? 'bangla' : voice.model);
async function startVoice(model) {
  if (!desk) return;
  const chosen = !!model;
  model = model || activeVoiceModel();
  setVoice('preparing', 'Starting…');
  let models;
  try { models = await desk.voice.models(); } catch (e) { voiceError(e.message); return; }
  if (!chosen && !(models[model] && models[model].installed)) {
    const other = model === 'accurate' ? 'fast' : model === 'fast' ? 'accurate' : '';
    if (other && models[other] && models[other].installed) model = other;
    else { setVoice('choose', inputLang() === 'bn' ? 'বাংলা voice typing' : 'Voice typing'); return; }
  }
  if (model !== 'bangla') voice.model = model;
  $('voiceModel').value = model;
  saveStore();
  setVoice('preparing', models[model] && models[model].installed ? 'Loading voice model…' : 'Downloading voice model…');
  const r = await desk.voice.start(model);
  if (!r.ok) voiceError(r.error);
}

async function openMic() {
  try {
    voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    voice.ctx = new AudioContext({ sampleRate: 16000 });
    await voice.ctx.audioWorklet.addModule('capture-worklet.js');
    voice.src = voice.ctx.createMediaStreamSource(voice.stream);
    voice.node = new AudioWorkletNode(voice.ctx, 'dotsense-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = voice.ctx.createGain();
    mute.gain.value = 0;
    voice.src.connect(voice.node);
    voice.node.connect(mute);
    mute.connect(voice.ctx.destination);
    voice.node.port.onmessage = e => {
      if (voice.phase !== 'listening') return;
      const samples = e.data;
      desk.voice.audio(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 4) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / (samples.length / 4));
      $('voiceLevel').style.width = Math.min(100, Math.round(rms * 400)) + '%';
    };
    if (voice.ctx.state === 'suspended') await voice.ctx.resume();
    setVoice('listening', 'Listening… speak now');
  } catch (e) {
    const msg = e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow the microphone for DotSense in your system privacy settings.'
      : e && e.name === 'NotFoundError' ? 'No microphone found. Plug one in and try again.'
      : 'Microphone error: ' + ((e && e.message) || e);
    voiceError(msg);
    desk.voice.cancel();
  }
}

function closeMic() {
  try { if (voice.node) { voice.node.port.onmessage = null; voice.node.disconnect(); } } catch (_) { /* closed */ }
  try { if (voice.src) voice.src.disconnect(); } catch (_) { /* closed */ }
  if (voice.stream) voice.stream.getTracks().forEach(t => t.stop());
  if (voice.ctx) voice.ctx.close().catch(() => {});
  voice.ctx = voice.stream = voice.node = voice.src = null;
  $('voiceLevel').style.width = '0';
}

async function stopVoice() {
  if (voice.phase === 'listening') {
    closeMic();
    setVoice('finishing', 'Finishing the last words…');
    await desk.voice.stop();
    setTimeout(() => { if (voice.phase === 'finishing') setVoice('off'); }, 10000);
  } else {
    closeMic();
    if (desk && (voice.phase === 'preparing' || voice.phase === 'finishing')) desk.voice.cancel();
    setVoice('off');
  }
}

function insertVoiceText(raw) {
  const t = $('sentence');
  if (t.disabled) return;
  const text = String(raw || '').trim();
  if (!text) return;
  const cmd = text.toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();
  const start = t.selectionStart, end = t.selectionEnd;
  const before = t.value.slice(0, start);
  const atEnd = end >= t.value.length;
  const bn = text.replace(/[।,.!?]/g, '').replace(/\s+/g, ' ').trim();   // Bangla voice commands
  const BN_LINE = ['নতুন লাইন', 'নতুন লাইনে', 'পরের লাইন', 'নিউ লাইন'];
  const BN_PARAGRAPH = ['নতুন অনুচ্ছেদ', 'নতুন প্যারা', 'নতুন প্যারাগ্রাফ', 'নিউ প্যারাগ্রাফ'];
  const BN_PAGE = ['নতুন পাতা', 'নতুন পৃষ্ঠা', 'নতুন পেজ', 'পরের পাতা', 'নিউ পেজ'];
  const page = cmd === 'new page' || cmd === 'page break' || cmd === 'next page' || BN_PAGE.includes(bn);
  if (page) insertPageBreak(t);   // like Next page: [[New Page 3]]
  else {
    let insert;
    if (cmd === 'new line' || cmd === 'next line' || BN_LINE.includes(bn)) insert = '\n';
    else if (cmd === 'new paragraph' || BN_PARAGRAPH.includes(bn)) insert = '\n\n';
    else insert = (before && !/\s$/.test(before) ? ' ' : '') + text;
    t.setRangeText(insert, start, end, 'end');
  }
  if (atEnd) t.scrollTop = t.scrollHeight;
  scheduleRebuild(true, page);
}

$('voiceBtn').onclick = () => {
  if (voice.phase === 'off' || voice.phase === 'error') startVoice();
  else stopVoice();
};
$('dlAccurate').onclick = () => startVoice('accurate');
$('dlFast').onclick = () => startVoice('fast');
$('dlBangla').onclick = () => startVoice('bangla');
$('dlCancel').onclick = () => setVoice('off');
$('voiceModel').onchange = async () => {
  const m = $('voiceModel').value;
  if (m === 'bangla') setLang('bn');
  else { voice.model = m; setLang('en'); }
  saveStore();
  if (voice.phase === 'listening' || voice.phase === 'preparing') {
    closeMic();
    await desk.voice.cancel();
    startVoice(activeVoiceModel());
  }
};
if (desk) desk.voice.onEvent(ev => {
  const mb = x => (x / 1048576).toFixed(1);
  switch (ev.type) {
    case 'download':
      if (voice.phase !== 'preparing') break;
      if (ev.part === 'model') {
        $('voiceStatus').textContent = `Downloading ${ev.model === 'fast' ? 'Fast' : ev.model === 'bangla' ? 'Bangla' : 'Accurate'} voice model… ${mb(ev.received)} of ${mb(ev.total)} MB (one time only)`;
        setVoiceProgress(ev.total ? ev.received / ev.total : 0);
      } else $('voiceStatus').textContent = 'Downloading voice detector…';
      break;
    case 'unpacking': if (voice.phase === 'preparing') { $('voiceStatus').textContent = 'Unpacking voice model…'; setVoiceProgress(1); } break;
    case 'loading': if (voice.phase === 'preparing') { $('voiceStatus').textContent = 'Loading voice model…'; $('voiceProgress').hidden = true; } break;
    case 'ready': if (voice.phase === 'preparing') openMic(); break;
    case 'speech': if (voice.phase === 'listening') $('voiceBar').dataset.speech = ev.active ? '1' : '0'; break;
    case 'partial': if (voice.phase === 'listening') $('voicePartial').textContent = ev.text; break;
    case 'final': insertVoiceText(ev.text); $('voicePartial').textContent = ''; break;
    case 'flushed': if (voice.phase === 'finishing') setVoice('off'); break;
    case 'error': voiceError('Voice typing: ' + ev.message); break;
    case 'exit': if (voice.phase !== 'off' && voice.phase !== 'error') voiceError('The voice engine stopped. Press Voice typing to try again.'); break;
  }
});

// ------------------------------------------------------------------ machine
function stateLabel(s) {
  if (!machine.connected) return 'Not connected';
  if (/^Hold:0|^Hold$/.test(s)) return 'Paused (hold)';
  if (/^Hold/.test(s)) return 'Pausing…';
  if (/^Door/.test(s)) return 'Door open';
  if (/^Alarm/.test(s)) return 'ALARM';
  if (/^Run/.test(s)) return 'Running';
  if (/^Check/.test(s)) return 'Check mode';
  return s;
}
function stateTone(st) {
  return !machine.connected ? 'off' : /^(Alarm|Not responding)/.test(st) ? 'bad' : /^(Run|Jog|Home)/.test(st) ? 'busy' : /^(Hold|Door|Check)/.test(st) ? 'hold' : /^Idle/.test(st) ? 'ok' : 'off';
}
function setStateUi(text, tone) {
  $('stateText').textContent = text;
  $('stateBadge').dataset.tone = tone;
}
// The machine status at the top right: "DotSense connected", "Not connected", "Printing 42%"…
function updatePill() {
  const P = state.printing;
  let text, tone;
  if (P && P.last && P.jobActive) {
    text = P.paused ? 'Paused' : `Printing ${Math.floor(P.last.percent)}%`;
    tone = P.paused ? 'hold' : 'busy';
  } else if (P) { text = P.sheetText || 'Change sheet'; tone = 'hold'; }
  else if (!machine.connected) { text = machine.busy ? 'Connecting…' : 'Not connected'; tone = machine.busy ? 'busy' : 'off'; }
  else {
    const st = machine.state || '';
    text = /^Alarm/.test(st) ? 'DotSense connected · ALARM' : /^Check/.test(st) ? 'DotSense connected · Check mode' : 'DotSense connected';
    tone = stateTone(st);
  }
  $('machinePillText').textContent = text;
  $('machinePill').dataset.tone = tone;
  $('machinePill').setAttribute('aria-label', `Machine: ${text}. Opens Machine setup, Connection.`);
}
function applyStatus(s) {
  if (!s) return;
  machine.status = s;
  machine.state = s.state;
  const st = s.state || '';
  setStateUi(stateLabel(st), stateTone(st));
  if (machine.connected && s.wpos) $('posReadout').textContent = `X ${s.wpos[0].toFixed(2)}   Y ${s.wpos[1].toFixed(2)}   Z ${s.wpos[2].toFixed(2)}`;
  updatePill();
  updateControls();
  moveHead();
}
function setDisconnected() {
  machine.connected = false;
  machine.state = 'Disconnected';
  machine.info = null;
  applyPage();
  $('machineVersion').textContent = '';
  $('posReadout').textContent = 'X –   Y –   Z –';
  setStateUi('Not connected', 'off');
  updatePill();
  updateControls();
  drawToolbox();
  moveHead();
}
function showMachineMsg(text, tone, actions) {
  $('machineMsg').className = 'notice' + (tone ? ' ' + tone : '');
  $('machineMsgText').textContent = text;
  $('machineMsgActions').replaceChildren(...(actions || []).map(([label, fn, primary]) => {
    const b = el('button', 'btn small' + (primary ? ' primary' : ''), label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }));
  $('machineMsg').hidden = false;
}
function hideMachineMsg() { $('machineMsg').hidden = true; }
$('machineMsgClose').onclick = hideMachineMsg;

async function refreshPorts() {
  if (!desk) return;
  const sel = $('portSelect');
  const prev = sel.value || stored.port || '';
  const r = await desk.machine.list();
  sel.replaceChildren();
  if (!r.ports.length) sel.append(new Option('No USB serial port found - plug in the machine', ''));
  for (const p of r.ports) sel.append(new Option(p.label, p.path));
  if (prev && r.ports.some(p => p.path === prev)) sel.value = prev;
  updateControls();
}
$('refreshPorts').onclick = refreshPorts;
$('baudSelect').onchange = saveStore;
$('portSelect').onchange = saveStore;

$('connectBtn').onclick = async () => {
  if (!desk) return;
  if (machine.connected) {
    machine.busy = true;
    updateControls();
    await desk.machine.disconnect();
    machine.busy = false;
    setDisconnected();
    return;
  }
  const portPath = $('portSelect').value;
  if (!portPath) { showMachineMsg('Choose the machine port first: plug in the USB cable and press ⟳ in Machine setup › Connection.', 'bad'); return; }
  hideMachineMsg();
  machine.busy = true;
  setStateUi('Connecting…', 'busy');
  updatePill();
  updateControls();
  const r = await desk.machine.connect(portPath, Number($('baudSelect').value));
  machine.busy = false;
  if (!r.ok) { setDisconnected(); showMachineMsg(r.error, 'bad'); return; }
  machine.connected = true;
  machine.info = r.info;
  $('machineVersion').textContent = 'Grbl ' + r.info.version;
  applyPage();
  stored.port = portPath;
  saveStore();
  applyStatus(r.status);
  if (/^Alarm/.test(r.status.state)) {
    const actions = [['Unlock', unlock, true]];
    if (r.info.homing) actions.unshift(['Home ($H)', () => machineAction(desk.machine.home(), 'Homing done.'), true]);
    showMachineMsg(r.info.homing ? 'The machine is locked until it is homed. Home it, or Unlock if you know the position is right.' : 'The machine is locked (ALARM). Check it, then press Unlock.', 'bad', actions);
  }
  render();
};

const logLines = [];
function renderLog() {
  const box = $('log');
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
  box.textContent = logLines.join('\n');
  if (atBottom) box.scrollTop = box.scrollHeight;
}
function appendLog(entries) {
  for (const e of entries) logLines.push((e.dir === 'out' ? '› ' : e.dir === 'in' ? '‹ ' : '! ') + e.text);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  if ($('logDetails').open) renderLog();
}
$('logDetails').addEventListener('toggle', () => { if ($('logDetails').open) renderLog(); });
$('cmdForm').onsubmit = async e => {
  e.preventDefault();
  const text = $('cmdInput').value.trim();
  if (!text || !desk) return;
  const r = await desk.machine.command(text);
  if (r.ok) $('cmdInput').value = '';
  else appendLog([{ dir: 'err', text: r.error }]);
};

async function machineAction(promise, okText) {
  const r = await promise;
  if (!r.ok) showMachineMsg(r.error, 'bad');
  else if (okText) showMachineMsg(okText, 'good');
  return r;
}
async function unlock() { const r = await machineAction(desk.machine.unlock()); if (r.ok) hideMachineMsg(); }
// Jog step: 0.1 / 1 / 10 in mm or cm. Z moves at most 10 mm per click so the punch can't crash;
// X/Y never more than the machine's travel ($130/$131) when it is known.
const jogUnit = () => (document.querySelector('input[name=jogUnit]:checked') || {}).value === 'cm' ? 'cm' : 'mm';
function jogDistance(axis) {
  const step = Number(document.querySelector('input[name=jogStep]:checked').value);
  let mm = step * (jogUnit() === 'cm' ? 10 : 1);
  if (axis === 'Z') mm = Math.min(mm, 10);
  const travel = machine.info && machine.info.travel;
  const limit = travel && travel['XYZ'.indexOf(axis)];
  if (limit > 0) mm = Math.min(mm, limit);
  return mm;
}
document.querySelectorAll('[data-jog]').forEach(b => {
  b.onclick = () => {
    const axis = b.dataset.jog[0];
    const dir = b.dataset.jog[1] === '+' ? 1 : -1;
    machineAction(desk.machine.jog(axis, dir * jogDistance(axis), axis === 'Z' ? 300 : 1000));
  };
});
document.querySelectorAll('input[name=jogUnit]').forEach(r => r.addEventListener('change', saveStore));
$('jogStop').onclick = () => {
  if (checkRun.running) checkRun.stopped = true;
  desk.machine.jogCancel();
};
$('zeroXY').onclick = () => machineAction(desk.machine.zero('XY'), 'X/Y zero is now at the current position.');
$('zeroZ').onclick = () => machineAction(desk.machine.zero('Z'), 'Z zero is now at the current height. Punch depth and clearance are measured from here.');
$('gotoStart').onclick = () => {
  const r = state.result;
  if (r) machineAction(desk.machine.goto(r.settings.originX, r.settings.originY, r.settings.clearZ), 'Moved above the first dot at clearance height.');
};
$('unlockBtn').onclick = unlock;
$('homeBtn').onclick = () => machineAction(desk.machine.home(), 'Homing done.');
// Check (auto calibrate): the punch goes 5 mm up, once around the margin line (the paper inside its
// margins; without a paper size, the print area) and back to the start position at clearance height
// (like Go to start position), so the paper can be checked before punching. ■ stops it.
const CHECK_LIFT = 5, CHECK_FEED = 2000;   // mm, mm/min
function checkPath() {
  const r = state.result;
  if (!r) return null;
  const s = r.settings;
  const m = pageOn() && state.sheet ? state.sheet : { minX: s.originX, maxX: s.originX + s.width, minY: s.originY - s.height, maxY: s.originY };
  const rect = { minX: m.minX, maxX: m.maxX, minY: m.minY, maxY: m.maxY };
  // from the top-left corner round the 4 sides, then back to the start (the first dot)
  return { rect, points: [[rect.minX, rect.maxY], [rect.maxX, rect.maxY], [rect.maxX, rect.minY], [rect.minX, rect.minY], [rect.minX, rect.maxY], [s.originX, s.originY]] };
}
$('checkBtn').onclick = async () => {
  const p = checkPath();
  if (!p || checkRun.running) return;
  const reach = machineReach(), q = p.rect;
  if (q.minX < -0.01 || q.minY < -0.01 || (reach.real && (q.maxX > reach.x + 0.01 || q.maxY > reach.y + 0.01))) {
    showMachineMsg(`The margin line (${fmm(q.maxX - q.minX)} × ${fmm(q.maxY - q.minY)} mm) goes outside what the machine reaches (${reach.x} × ${reach.y} mm). Choose a smaller paper size or margin.`, 'bad');
    return;
  }
  checkRun.running = true;
  checkRun.stopped = false;
  updateControls();
  showMachineMsg(`Check: the punch goes ${CHECK_LIFT} mm up, once around the margin line and back to the start position. ■ stops it.`, '');
  const res = await desk.machine.frame(p.points, CHECK_LIFT, CHECK_FEED, state.result.settings.clearZ);
  checkRun.running = false;
  updateControls();
  if (!res.ok) showMachineMsg('Check: ' + res.error, 'bad');
  else if (checkRun.stopped) showMachineMsg('Check stopped.', '');
  else showMachineMsg(`Check done: the punch went round the margin line and is back above the start position at clearance height (Z ${fmm(state.result.settings.clearZ)} mm). The path should have stayed on the paper, just inside its edges.`, 'good');
};

// Soft Reset (Ctrl-X): resets GRBL without switching the machine off - when GRBL is stuck,
// to abort a job, or to reset the controller.
$('resetMachineBtn').onclick = async () => {
  const P = state.printing;
  if (P) {
    P.aborted = true;
    P.abortedBetween = !P.jobActive;
    if (!P.jobActive && P.sheetCancel) P.sheetCancel();   // waiting for the next sheet: end the print here
  }
  const r = await desk.machine.reset();
  if (!r.ok) showMachineMsg(r.error, 'bad');
  else if (!P) showMachineMsg('Soft reset done: GRBL was reset without switching the machine off.', 'good');
};

// ---- invert view window
function invertState() {
  const r = state.result;
  const P = state.printing;
  const base = { type: 'state', invert: invertOn(), error: state.error, printing: !!P };
  if (!r || !r.pages.length) return Object.assign(base, { page: null });
  const printedInfo = !P && state.printed && state.printed.result === r ? state.printed.pages.get(state.page) : null;
  let job = null;
  if (P && P.page === state.page && P.keys) {
    job = { keys: P.keys, dots: P.keys.length, dotsDone: P.last ? P.last.dotsDone : 0, current: P.last ? P.last.current : -1, active: P.jobActive };
  } else if (printedInfo) {
    job = { keys: printedInfo.keys, dots: printedInfo.keys.length, dotsDone: printedInfo.dotsDone, current: -1, active: false };
  }
  return Object.assign(base, {
    page: r.pages[state.page], pageIndex: state.page, pageCount: r.pages.length,
    cols: r.cols, rows: r.rows, settings: r.settings, job
  });
}
function sendInvertState() {
  if (desk && invertWinOpen) desk.invert.update(invertState());
}
// Invert view: the mirrored machine side next to the reading side, both live
$('invertViewBtn').onclick = () => {
  state.sideView = !state.sideView;
  $('invertViewBtn').setAttribute('aria-pressed', String(state.sideView));
  renderPreview();
  saveStore();
};
if (desk) desk.invert.onEvent(ev => {
  if (ev.type === 'opened') invertWinOpen = true;
  else if (ev.type === 'closed') invertWinOpen = false;
  else if (ev.type === 'request') { invertWinOpen = true; sendInvertState(); }
  else if (ev.type === 'goto') {
    if (!state.printing && state.result && ev.page >= 0 && ev.page < state.result.pages.length) { state.page = ev.page; render(); }
  } else if (ev.type === 'set') {
    if (!state.printing) { $('invertPrint').checked = ev.on; $('confirmed').checked = false; render(); saveStore(); }
  }
});

// ---- live printing
async function printPages(from, to) {
  const r = state.result;
  if (!r || !r.pages.length || state.printing) return;
  const rates = machine.info && machine.info.rates;
  const invert = invertOn();
  let dots = 0, est = 0;
  const pageEst = [];
  for (let i = from; i <= to; i++) {
    const pts = D.pagePoints(r.pages[i], r.settings, { invert });
    // last check before the machine moves: no dot outside the paper
    if (r.sheet && D.offSheet(pts, r.sheet, D.dotRadius(r.settings))) {
      showMachineMsg(`Page ${i + 1} has dots outside the paper, so nothing was printed. Check the paper size and margin.`, 'bad');
      return;
    }
    dots += pts.length;
    pageEst[i] = D.estimate(pts, r.settings, rates);
    est += pageEst[i];
  }
  const check = /^Check/.test(machine.state);   // GRBL check mode: the G-code is checked, nothing moves
  const what = from === to ? `page ${from + 1}` : check ? `pages ${from + 1} to ${to + 1}` : `pages ${from + 1} to ${to + 1} (${to - from + 1} sheets, you change the paper in between)`;
  const ok = check
    ? await confirmBox('Check the G-code?', `Check mode is ON: GRBL reads and checks every G-code line of ${what} (${fmtNum(dots)} dots), but the machine does not move and nothing is punched.`, 'Start check')
    : await confirmBox('Start punching?',
      `DotSense will punch ${what}: ${fmtNum(dots)} dots, about ${fmtMin(est)}. ` +
      (invert ? 'Invert print is ON: the page is punched mirrored (read it from the back). ' : 'Invert print is OFF: the page is punched as it reads. ') +
      'Check that the paper is clamped and work zero is set (X0 Y0 at your reference corner, Z0 on the paper surface). Keep a hand near the machine power switch.',
      'Start printing');
  if (!ok) return;
  if (voice.phase !== 'off' && voice.phase !== 'error') await stopVoice();
  hideMachineMsg();
  state.printed = { result: r, pages: new Map(), invert };
  state.printing = {
    result: r, from, to, page: from, invert, check, jobActive: false, paused: false, last: null, points: null, keys: null, resolve: null, sheetCancel: null, started: Date.now(),
    pageEst, countdown: { left: est, at: Date.now(), running: false }
  };
  clearInterval(timeTicker);
  timeTicker = setInterval(updateTimeStat, 250);
  updateTimeStat();
  $('progressBox').hidden = false;
  let outcome = 'done';
  let finished = 0;
  for (let p = from; p <= to; p++) {
    if (p > from && !check) {   // a check run needs no paper: no sheet change in between
      const go = await sheetPrompt(p);
      if (!go) { outcome = state.printing.aborted ? 'aborted' : 'cancelled'; break; }
    }
    const P = state.printing;
    P.page = p;
    P.last = null;
    P.lastJob = null;
    state.page = p;
    const job = D.jobLines(r.pages[p], r.settings, p, r.pages.length, { invert });
    P.points = job.points;
    P.keys = job.keys;
    renderPager();
    renderBrailleText();
    renderPreview();
    renderGcode();
    updateControls();
    sendInvertState();
    outcome = await runJob({
      lines: job.lines, clearZ: r.settings.clearZ, estimate: D.estimate(job.points, r.settings, rates),
      page: p, pages: r.pages.length, label: D.lineText(r.pages[p][0] || [])
    });
    const lastJob = state.printing.lastJob;
    if (lastJob) state.printed.pages.set(p, { dotsDone: lastJob.dotsDone, keys: P.keys });
    if (outcome !== 'done') break;
    finished++;
  }
  const P = state.printing;
  state.printing = null;
  clearInterval(timeTicker);
  if (check) state.printed = null;   // nothing was punched
  $('progressBox').hidden = true;    // the message above the Print bar tells how it went
  finishNotice(outcome, P, finished);
  render();
  updatePill();
}

function runJob(job) {
  return new Promise(resolve => {
    const P = state.printing;
    P.resolve = resolve;
    P.jobActive = true;
    P.paused = false;
    updateControls();
    sendInvertState();
    desk.machine.start(job).then(r => {
      if (!r.ok && P.resolve) {
        P.resolve = null;
        P.jobActive = false;
        showMachineMsg(r.error, 'bad');
        resolve('failed');
      }
    });
  });
}

function sheetPrompt(p) {
  return new Promise(resolve => {
    const P = state.printing;
    const total = autoSeconds();
    let left = total;
    let held = total == null;
    let timer = 0;
    const ready = () => machine.connected && /^Idle/.test(machine.state);
    const show = () => {
      $('sheetPromptText').textContent = held
        ? `Page ${p} is done. Put in sheet ${p + 1} at the same place (same work zero), clamp it, then press Continue.`
        : `Page ${p} is done. Put in sheet ${p + 1} at the same place (same work zero). Page ${p + 1} starts by itself in ${left} s.`;
      $('sheetContinue').textContent = held ? 'Continue' : 'Continue now';
      $('sheetWait').hidden = held;
      $('sheetBar').hidden = held;
      if (!held) $('sheetBarFill').style.width = (100 * left / total) + '%';
      P.sheetText = held ? 'Change sheet' : `Next sheet in ${left} s`;
      updatePill();
    };
    const done = go => {
      clearInterval(timer);
      $('sheetPrompt').hidden = true;
      $('sheetContinue').onclick = $('sheetCancel').onclick = $('sheetWait').onclick = null;
      P.sheetCancel = null;
      P.sheetText = null;
      resolve(go);
    };
    const hold = () => { held = true; clearInterval(timer); show(); };
    P.sheetCancel = () => done(false);
    $('sheetContinue').onclick = () => {
      if (!ready()) { showMachineMsg('The machine must be connected and Idle to continue.', 'bad'); return; }
      hideMachineMsg();
      done(true);
    };
    $('sheetWait').onclick = hold;
    $('sheetCancel').onclick = () => done(false);
    $('sheetPrompt').hidden = false;
    show();
    beep(880, 0.15);
    setTimeout(() => beep(880, 0.15), 220);
    if (!held) {
      timer = setInterval(() => {
        left--;
        if (left > 0) {
          if (left <= 5) beep(660, 0.12);
          show();
          return;
        }
        if (!ready()) {
          hold();
          showMachineMsg('The next page did not start: the machine is not connected or not Idle. Press Continue when it is ready.', 'bad');
          return;
        }
        beep(990, 0.4);
        hideMachineMsg();
        done(true);
      }, 1000);
    }
    $('sheetContinue').focus();
  });
}

function finishNotice(outcome, P, finished) {
  const last = P && P.lastJob;
  const pageNo = P ? P.page + 1 : 0;
  if (outcome === 'done' && P.check) {
    const total = P.to - P.from + 1;
    const errs = last && last.errors ? last.errors : 0;
    showMachineMsg(`Check mode: ${total > 1 ? `all ${total} pages` : `page ${pageNo}`} checked${errs ? ` with ${errs} G-code error(s) - see the machine log` : ': GRBL accepted every line'}. The machine did not move. Switch GRBL check mode off ($C in Machine setup › Connection) to print for real.`, errs ? 'bad' : 'good');
  } else if (outcome === 'done') {
    const total = P.to - P.from + 1;
    showMachineMsg(total > 1 ? `All ${total} pages punched in ${fmtTime((Date.now() - P.started) / 1000)}.` : `Page ${pageNo} punched: ${fmtNum(last ? last.dots : 0)} dots in ${fmtTime(last ? last.elapsed : 0)}.`, 'good');
  } else if (outcome === 'stopped') {
    showMachineMsg(`Stopped on page ${pageNo} after ${fmtNum(last ? last.dotsDone : 0)} of ${fmtNum(last ? last.dots : 0)} dots. The punch was lifted to clearance.`, '');
  } else if (outcome === 'aborted') {
    const text = P && P.abortedBetween
      ? `Print aborted with Soft Reset after page ${pageNo}. Page ${pageNo + 1} and later were not punched. GRBL was reset.`
      : `Print aborted with Soft Reset on page ${pageNo} after ${fmtNum(last ? last.dotsDone : 0)} of ${fmtNum(last ? last.dots : 0)} dots. GRBL was reset. Lift the punch with Z+ and check the position before printing again.`;
    // a reset while moving usually leaves GRBL in ALARM (position may be lost): offer Unlock
    showMachineMsg(text, 'bad', P && P.abortedBetween ? undefined : [['Unlock', unlock, true]]);
  } else if (outcome === 'cancelled') {
    showMachineMsg(`Stopped after ${finished} page(s). Page ${pageNo + 1} and later were not punched.`, '');
  } else if (outcome === 'alarm') {
    showMachineMsg(`ALARM on page ${pageNo}: ${(last && last.message) || ''} Check the machine, then press Unlock.`, 'bad', [['Unlock', unlock, true]]);
  } else if (outcome === 'reset' || outcome === 'disconnected') {
    showMachineMsg(((last && last.message) || 'Printing was interrupted.') + ` Page ${pageNo} is incomplete.`, 'bad');
  }
}

function keepVisible(child, box) {
  const b = box.getBoundingClientRect(), c = child.getBoundingClientRect();
  if (c.top < b.top + 6) box.scrollTop -= b.top - c.top + 12;
  else if (c.bottom > b.bottom - 6) box.scrollTop += c.bottom - b.bottom + 12;
  if (c.left < b.left + 6) box.scrollLeft -= b.left - c.left + 12;
  else if (c.right > b.right - 6) box.scrollLeft += c.right - b.right + 12;
}

function applyProgress(p) {
  const lists = [state.progEls, state.progEls2].filter(l => l && l.length);
  if (!p || !lists.length) return;
  const n = Math.max(...lists.map(l => l.length));
  const done = Math.min(p.dotsDone, n);
  const cur = p.current >= 0 && p.current < n ? p.current : -1;
  for (const els of lists) {
    for (let k = done; k < state.shownDone; k++) if (els[k]) els[k].dot.classList.remove('done');
    for (let k = state.shownDone; k < done; k++) if (els[k]) els[k].dot.classList.add('done');
    if (state.shownNow >= 0 && els[state.shownNow]) {
      els[state.shownNow].dot.classList.remove('now');
      els[state.shownNow].cell.classList.remove('now');
    }
    if (cur >= 0 && els[cur]) {
      els[cur].dot.classList.add('now');
      els[cur].cell.classList.add('now');
    }
  }
  const first = state.progEls[cur] || state.progEls2[cur];
  if (cur >= 0 && first && cur !== state.shownNow) keepVisible(first.cell, $('preview'));
  state.shownDone = done;
  state.shownNow = cur;
}

function onProgress(p) {
  const P = state.printing;
  if (!P || !p || p.page !== P.page) return;
  P.last = p;
  updateCountdown(p);
  $('progressBox').hidden = false;
  $('progressFill').style.width = p.percent + '%';
  $('progressBar').setAttribute('aria-valuenow', String(Math.round(p.percent)));
  const pageInfo = p.pages > 1 ? `Page ${p.page + 1} of ${p.pages} · ` : '';
  $('progressMain').textContent = `${pageInfo}${fmtNum(p.dotsDone)} of ${fmtNum(p.dots)} dots · ${p.percent < 10 ? p.percent.toFixed(1) : Math.floor(p.percent)}%`;
  const pt = P.points && p.current >= 0 ? P.points[p.current] : null;
  let sub;
  if (p.state === 'paused' || p.state === 'error') sub = 'Paused.';
  else if (p.state === 'stopping') sub = 'Stopping: feed hold, reset, lifting the punch…';
  else if (pt) sub = `${p.phase === 'punch' ? 'Punching' : 'Next'} ${pt.what || '“' + pt.ch + '”'} · line ${pt.line + 1}, cell ${pt.col + 1}, dot ${pt.dot}.`;
  else if (p.state === 'done') sub = 'Page finished.';
  else sub = p.dotsDone >= p.dots ? 'Last dot done, returning to X0 Y0.' : '';
  sub += ` ${fmtTime(p.elapsed)} ${p.state === 'done' ? 'total' : 'elapsed'}`;
  if (p.eta != null && p.dotsDone < p.dots) sub += ` · about ${fmtTime(p.eta)} left${p.approx ? ' (approx.)' : ''}`;
  $('progressSub').textContent = sub;
  $('progressText').title = $('progressMain').textContent + '\n' + sub;   // the bar may shorten it
  if (state.page === P.page) applyProgress(p);
  if (desk && invertWinOpen && state.page === P.page) desk.invert.update({ type: 'progress', pageIndex: P.page, dotsDone: p.dotsDone, current: p.current });
  updatePill();
}

function onJob(j) {
  const P = state.printing;
  if (j.type === 'start' || j.type === 'resumed') { if (P) P.paused = false; if (j.type === 'resumed') hideMachineMsg(); }
  if (j.type === 'paused' && P) P.paused = true;
  if (j.type === 'error' && P) {
    P.paused = true;
    showMachineMsg(`The machine rejected a line: ${j.line} (error ${j.code}: ${j.message}). The machine is on hold.`, 'bad', [
      ['Continue anyway', () => desk.machine.resume()], ['Stop', () => desk.machine.stop(), true]
    ]);
  }
  onProgress(j);
  if (['done', 'stopped', 'aborted', 'alarm', 'reset', 'disconnected'].includes(j.type) && P && P.resolve) {
    const res = P.resolve;
    P.resolve = null;
    P.jobActive = false;
    P.lastJob = j;
    res(j.type);
  }
  updateControls();
  updatePill();
}

$('printPageBtn').onclick = () => printPages(state.page, state.page);
$('printAllBtn').onclick = () => { if (state.result) printPages(0, state.result.pages.length - 1); };
$('pauseBtn').onclick = async () => {
  const P = state.printing;
  if (!P || !P.jobActive) return;
  const r = P.paused ? await desk.machine.resume() : await desk.machine.pause();
  if (!r.ok) showMachineMsg(r.error, 'bad');
};
$('stopBtn').onclick = async () => {
  const P = state.printing;
  if (!P) return;
  if (!P.jobActive && P.sheetCancel) { P.sheetCancel(); return; }
  $('stopBtn').disabled = true;
  const r = await desk.machine.stop();
  if (!r.ok) showMachineMsg(r.error, 'bad');
};

if (desk) desk.machine.onEvent(ev => {
  if (ev.type === 'status') applyStatus(ev.status);
  else if (ev.type === 'connection') { if (!ev.connection.connected) setDisconnected(); }
  else if (ev.type === 'progress') onProgress(ev.progress);
  else if (ev.type === 'job') onJob(ev.job);
  else if (ev.type === 'alarm') { if (!state.printing) showMachineMsg(`ALARM ${ev.alarm.code}: ${ev.alarm.message}`, 'bad', [['Unlock', unlock, true]]); }
  else if (ev.type === 'message') appendLog([{ dir: 'msg', text: ev.message }]);
  else if (ev.type === 'log') appendLog(ev.entries);
});

// ------------------------------------------------------------------ theme (dark / light)
// theme.js sets data-theme on <html> before the page is drawn; the app keeps the choice
// and tells every window when it changes.
const themeNow = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
function updateThemeBtn() {
  const label = themeNow() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  $('themeBtn').setAttribute('aria-label', label);
  $('themeBtn').title = label;
}
if (desk && desk.theme) {
  $('themeBtn').hidden = false;
  updateThemeBtn();
  desk.theme.onChange(() => requestAnimationFrame(updateThemeBtn));
  $('themeBtn').onclick = () => {
    const next = themeNow() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    updateThemeBtn();
    desk.theme.set(next);
  };
}

// ------------------------------------------------------------------ parts of the window (top left)
// Text · Page · Preview · Print: a click jumps there; the part in use lights up.
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setStep(id) {
  document.querySelectorAll('.step-link').forEach(b => {
    if (b.dataset.step === id) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
}
// where the keyboard goes: the text box, the heading, or the next thing to do in Print
function stepTarget(id) {
  if (id === 'textPanel') return $('sentence').disabled ? $('textTitle') : $('sentence');
  if (id === 'pagePanel') return $('pageTitle');
  if (id === 'previewPanel') return $('prevTitle');
  if (!machine.connected && !$('barConnectBtn').disabled) return $('barConnectBtn');
  if (!$('printPageBtn').disabled) return $('printPageBtn');
  if (!$('confirmed').disabled && machine.connected && !state.printing) return $('confirmed');
  return $('printTitle');
}
document.querySelectorAll('.step-link').forEach(b => b.addEventListener('click', () => {
  const id = b.dataset.step, sec = $(id);
  setStep(id);
  if (id !== 'printBar') sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  stepTarget(id).focus({ preventScroll: true });
  sec.classList.remove('step-flash');
  void sec.offsetWidth;   // restart the highlight
  if (!reduceMotion()) sec.classList.add('step-flash');
}));
const STEP_SEL = '#textPanel, #pagePanel, #previewPanel, #printBar';
for (const ev of ['focusin', 'pointerdown']) {
  document.addEventListener(ev, e => {
    const sec = e.target instanceof Element && e.target.closest(STEP_SEL);
    if (sec) setStep(sec.id);
  });
}
for (const id of ['textPanel', 'pagePanel', 'previewPanel', 'printBar']) $(id).addEventListener('animationend', () => $(id).classList.remove('step-flash'));

// ------------------------------------------------------------------ Machine setup and About
// They open over the window: the rest rests (inert) while one is open, but the Print bar stays
// in reach (Pause and Stop). Esc, ✕ or a click beside the panel closes it.
const overlay = { open: null, opener: null };
function showOverlay(name) {   // 'setup' or 'about'
  if (overlay.open === name) return;
  if (overlay.open) hideOverlay(true);
  overlay.opener = document.activeElement;
  openWifiPop(false);
  $(name + 'Backdrop').hidden = false;
  for (const id of ['appHeader', 'main']) $(id).inert = true;
  $(name + 'Btn').setAttribute('aria-expanded', 'true');
  overlay.open = name;
}
function hideOverlay(keepFocus) {
  const name = overlay.open;
  if (!name) return;
  $(name + 'Backdrop').hidden = true;
  $(name + 'Btn').setAttribute('aria-expanded', 'false');
  overlay.open = null;
  for (const id of ['appHeader', 'main']) $(id).inert = false;
  const back = overlay.opener;
  overlay.opener = null;
  if (!keepFocus) (back && back.isConnected && !back.disabled && back !== document.body ? back : $(name + 'Btn')).focus();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay.open && !document.querySelector('dialog[open]')) { e.preventDefault(); hideOverlay(); }
});
for (const name of ['setup', 'about']) {
  $(name + 'Backdrop').addEventListener('mousedown', e => { if (e.target === $(name + 'Backdrop')) hideOverlay(); });
}

// ---- Machine setup: Calibration guide · Machine values · Tool Box · Connection
const SETUP_TABS = ['guide', 'values', 'tools', 'conn'];
const setup = { tab: 'guide' };
const setupOpen = () => overlay.open === 'setup';
function showSetupTab(tab, focus) {
  if (!SETUP_TABS.includes(tab)) tab = 'guide';
  setup.tab = tab;
  document.querySelectorAll('#setupPanel [role=tab]').forEach(t => {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
    if (on && focus) t.focus();
  });
  if (tab === 'conn' && $('logDetails').open) renderLog();
  drawSetupPreviews();
  saveStore();
}
function openSetup(tab) {
  if (tab) showSetupTab(tab);
  showOverlay('setup');
  drawSetupPreviews();
  document.querySelector('#setupPanel [role=tab][aria-selected=true]').focus();
}
function closeSetup() { if (setupOpen()) hideOverlay(); }
$('setupBtn').onclick = () => openSetup();
$('machinePill').onclick = () => openSetup('conn');
$('setupClose').onclick = closeSetup;
document.querySelectorAll('#setupPanel [role=tab]').forEach(t => {
  t.addEventListener('click', () => showSetupTab(t.dataset.tab));
  t.addEventListener('keydown', e => {
    const i = SETUP_TABS.indexOf(t.dataset.tab);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? SETUP_TABS.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    showSetupTab(SETUP_TABS[(next + SETUP_TABS.length) % SETUP_TABS.length], true);
  });
});
// buttons that lead to a tab: in the guide, and "Machine setup › Machine values" in Page
document.querySelectorAll('[data-open-tab]').forEach(b => { b.onclick = () => showSetupTab(b.dataset.openTab, true); });
document.querySelectorAll('[data-open-setup]').forEach(b => { b.onclick = () => openSetup(b.dataset.openSetup); });
// Print: Connect in the bar uses the port chosen in Connection, or opens it to choose one
$('barConnectBtn').onclick = () => {
  if (!desk || machine.connected) return;
  if ($('portSelect').value) $('connectBtn').click();
  else openSetup('conn');
};

// ---- About: the developer
$('aboutBtn').onclick = () => { showOverlay('about'); $('aboutClose').focus(); };
$('aboutClose').onclick = () => hideOverlay();
if (desk && desk.appInfo) desk.appInfo().then(i => { if (i && i.version) $('aboutVersion').textContent = `Version ${i.version}.`; }).catch(() => {});

// ------------------------------------------------------------------ live previews in Machine setup
// Machine values: the sheet (paper, print area, start position, the dots of this page and the
// machine's reach), the braille spacing and the Z heights, redrawn with every change.
// Tool Box: the machine's reach, the paper and the punch where the machine reports it, live.
function machineReach() {
  const t = machine.info && machine.info.travel;
  return t && t[0] > 0 && t[1] > 0 ? { x: t[0], y: t[1], real: true } : { x: TYPICAL_REACH.x, y: TYPICAL_REACH.y, real: false };
}
const fmm = n => String(Math.round(n * 100) / 100);
const numOf = v => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : NaN; };
function fieldValues() { const raw = readSettings(), v = {}; for (const k of FIELDS) v[k] = numOf(raw[k]); return v; }
// mm (Y up) to px in a w × h box, keeping proportions
function fitMap(b, w, h, pad) {
  const bw = Math.max(1e-6, b.maxX - b.minX), bh = Math.max(1e-6, b.maxY - b.minY);
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * k) / 2, oy = (h - bh * k) / 2;
  return { k, x: v => ox + (v - b.minX) * k, y: v => h - oy - (v - b.minY) * k };
}
function growBox(b, x0, y0, x1, y1) {
  if (![x0, y0, x1, y1].every(Number.isFinite)) return;
  b.minX = Math.min(b.minX, x0, x1); b.maxX = Math.max(b.maxX, x0, x1);
  b.minY = Math.min(b.minY, y0, y1); b.maxY = Math.max(b.maxY, y0, y1);
}
function svgText(parent, x, y, text, cls, anchor) {
  const t = svgEl('text', { x: n3(x), y: n3(y), 'text-anchor': anchor || 'start' }, cls || 'pv-label');
  t.textContent = text;
  parent.append(t);
  return t;
}
function svgBox(svg) {
  const w = Math.max(40, Math.round(svg.clientWidth || svg.getBoundingClientRect().width || 300));
  const h = Math.max(40, Math.round(svg.clientHeight || svg.getBoundingClientRect().height || 180));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.replaceChildren();
  return { w, h };
}
// The top view in work coordinates (mm): X0 Y0 at the paper's front-left corner.
function drawTopView(svg, opts) {
  const { w, h } = svgBox(svg);
  const r = state.result, s = opts.s, reach = machineReach();
  const area = s && [s.originX, s.width, s.height, s.originY].every(Number.isFinite) ? { x0: s.originX, y0: s.originY - s.height, x1: s.originX + s.width, y1: s.originY } : null;
  const paper = pageOn() && state.paper ? { w: state.paper.w, h: state.paper.h, sheet: state.sheet } : null;
  const b = { minX: 0, minY: 0, maxX: reach.x, maxY: reach.y };
  if (paper) growBox(b, 0, 0, paper.w, paper.h);
  if (area) growBox(b, area.x0, area.y0, area.x1, area.y1);
  if (opts.head) growBox(b, opts.head[0], opts.head[1], opts.head[0], opts.head[1]);
  const m = fitMap(b, w, h, 14);
  const rect = (x0, y0, x1, y1, cls) => svg.append(svgEl('rect', { x: n3(m.x(Math.min(x0, x1))), y: n3(m.y(Math.max(y0, y1))), width: n3(Math.abs(x1 - x0) * m.k), height: n3(Math.abs(y1 - y0) * m.k) }, cls));
  const over = area && (area.x1 > reach.x + 0.01 || area.y1 > reach.y + 0.01 || area.x0 < -0.01 || area.y0 < -0.01);
  rect(0, 0, reach.x, reach.y, 'pv-reach' + (over ? ' over' : ''));
  if (paper) {
    rect(0, 0, paper.w, paper.h, 'pv-paper');
    if (paper.sheet) rect(paper.sheet.minX, paper.sheet.minY, paper.sheet.maxX, paper.sheet.maxY, 'pv-margin');
  }
  if (area) rect(area.x0, area.y0, area.x1, area.y1, 'pv-area');
  // the dots of the page shown in the preview, where they will be punched
  if (opts.dots && r && r.pages.length) {
    const rad = Math.max(0.7, D.dotRadius(r.settings) * m.k);
    const frag = document.createDocumentFragment();
    for (const p of D.pagePoints(r.pages[state.page], r.settings, { invert: false })) frag.append(svgEl('circle', { cx: n3(m.x(p.x)), cy: n3(m.y(p.y)), r: n3(rad) }, 'pv-dot'));
    svg.append(frag);
  }
  // X0 Y0 and the axes
  const ox = m.x(0), oy = m.y(0);
  svg.append(svgEl('path', { d: `M${n3(ox)} ${n3(oy)}h22M${n3(ox)} ${n3(oy)}v-22` }, 'pv-axis'));
  svgText(svg, ox + 24, oy + 3.5, 'X', 'pv-axis-label');
  svgText(svg, ox - 3.5, oy - 25, 'Y', 'pv-axis-label');
  svgText(svg, ox + 3, oy + 11, 'X0 Y0', 'pv-label');
  // the start position (first dot)
  if (area) {
    const sx = m.x(s.originX), sy = m.y(s.originY);
    svg.append(svgEl('path', { d: `M${n3(sx - 7)} ${n3(sy)}h14M${n3(sx)} ${n3(sy - 7)}v14` }, 'pv-start'));
    svg.append(svgEl('circle', { cx: n3(sx), cy: n3(sy), r: 3.2 }, 'pv-start-dot'));
    svgText(svg, Math.min(sx + 8, w - 4), Math.max(sy - 6, 10), 'start', 'pv-start-label', sx + 8 > w - 40 ? 'end' : 'start');
  }
  // under the reach, clear of the paper and of "X0 Y0": the longest wording that fits
  const room = m.x(reach.x) - (ox + 42), size = `${reach.x} × ${reach.y}`;
  const reachText = [`${reach.real ? 'machine reach' : 'typical reach'} ${size}`, `reach ${size}`, size].find(t => t.length * 6.1 <= room) || size;
  svgText(svg, m.x(reach.x), Math.min(h - 2, m.y(0) + 11), reachText, 'pv-label' + (over ? ' pv-bad' : ''), 'end');
  return { m, reach, over, area };
}
function drawSpacing(svg, s) {
  const { w, h } = svgBox(svg);
  const dp = s.dotPitch, cp = s.cellPitch, lp = s.linePitch;
  if (![dp, cp, lp].every(v => Number.isFinite(v) && v > 0)) { svgText(svg, w / 2, h / 2, 'Enter the dot, cell and line pitch', 'pv-label', 'middle'); return; }
  const padT = 26, padB = 10, side = 64;
  const k = Math.min((w - 2 * side) / (cp + dp), (h - padT - padB) / (lp + 2 * dp));
  const padL = (w - (cp + dp) * k) / 2;   // centred, with room for the labels at the sides
  const X = mm => padL + mm * k, Y = mm => padT + mm * k;
  const rad = Math.max(1.5, Math.min(D.dotRadius(dp) * k, 7));
  const cell = (cx, cy) => { for (let c = 0; c < 2; c++) for (let d = 0; d < 3; d++) svg.append(svgEl('circle', { cx: n3(X(cx + c * dp)), cy: n3(Y(cy + d * dp)), r: n3(rad) }, 'pv-dot')); };
  cell(0, 0); cell(cp, 0); cell(0, lp);
  // cell pitch (dot 1 to dot 1 of the next cell), above
  const dim = (x1, y1, x2, y2, label, lx, ly, anchor) => {
    svg.append(svgEl('path', { d: `M${n3(x1)} ${n3(y1)}L${n3(x2)} ${n3(y2)}` }, 'pv-dim'));
    const ends = x1 === x2 ? `M${n3(x1 - 4)} ${n3(y1)}h8M${n3(x2 - 4)} ${n3(y2)}h8` : `M${n3(x1)} ${n3(y1 - 4)}v8M${n3(x2)} ${n3(y2 - 4)}v8`;
    svg.append(svgEl('path', { d: ends }, 'pv-dim'));
    svgText(svg, lx, ly, label, 'pv-dim-label', anchor);
  };
  dim(X(0), padT - 12, X(cp), padT - 12, `cell ${fmm(cp)} mm`, (X(0) + X(cp)) / 2, padT - 16, 'middle');
  dim(X(0), Y(dp * 2) + rad + 8, X(dp), Y(dp * 2) + rad + 8, `dot ${fmm(dp)}`, X(dp) + 6, Y(dp * 2) + rad + 11, 'start');
  dim(padL - 16, Y(0), padL - 16, Y(lp), `line ${fmm(lp)}`, padL - 20, (Y(0) + Y(lp)) / 2 + 4, 'end');
}
function drawZ(svg, v) {
  const { w, h } = svgBox(svg);
  const cz = v.clearZ, pz = v.punchZ;
  if (![cz, pz].every(Number.isFinite)) { svgText(svg, w / 2, h / 2, 'Enter the clearance and punch depth', 'pv-label', 'middle'); return; }
  const top = Math.max(cz, 1) + 1, bottom = Math.min(pz, -1) - 1;
  const Y = z => 10 + (top - z) / (top - bottom) * (h - 20);
  // the paper at Z0
  svg.append(svgEl('rect', { x: 0, y: n3(Y(0)), width: w, height: 5 }, 'pv-z-paper'));
  const line = (z, cls, label) => {
    svg.append(svgEl('path', { d: `M60 ${n3(Y(z))}H${w}` }, cls));
    svgText(svg, w - 6, Y(z) - 4, label, 'pv-label', 'end');
  };
  line(cz, 'pv-z-line', `clearance ${cz > 0 ? '+' : ''}${fmm(cz)} mm`);
  line(pz, 'pv-z-line pv-z-depth', `punch depth ${fmm(pz)} mm`);
  svgText(svg, w - 6, Y(0) + 15, 'paper · Z0', 'pv-label', 'end');
  // the punch: up at clearance, and how far it goes down
  const px = 30, tip = z => Y(z);
  svg.append(svgEl('path', { d: `M${px - 6} ${n3(tip(cz) - 26)}h12v18l-6 8l-6 -8z` }, 'pv-punch'));
  svg.append(svgEl('path', { d: `M${px + 14} ${n3(tip(cz))}V${n3(tip(pz))}` }, 'pv-z-travel'));
  svg.append(svgEl('path', { d: `M${px + 10} ${n3(tip(pz) - 6)}l4 6l4 -6` }, 'pv-z-travel'));
  if (pz >= 0 || cz <= 0 || cz <= pz) svgText(svg, 6, h - 6, pz >= 0 ? 'Punch depth must be below 0 (under the paper)' : 'Clearance must be above 0 (over the paper)', 'pv-label pv-bad');
}
function drawValuesPreview() {
  if (!setupOpen() || setup.tab !== 'values') return;   // only while it is on the screen
  const v = fieldValues();
  const r = state.result;
  const s = r ? r.settings : v;   // as the braille is laid out (page scaling included)
  const tv = drawTopView($('mvSheet'), { s, dots: true });
  const cap = [];
  if (tv.area) cap.push(`start X ${fmm(s.originX)} · Y ${fmm(s.originY)}`, `area ${fmm(s.width)} × ${fmm(s.height)} mm`);
  if (r) cap.push(`${r.cols} cells × ${r.rows} lines`);
  $('mvSheetCap').textContent = cap.join(' · ') + (tv.over ? ' · outside the reach' : '');
  $('mvSheetCap').classList.toggle('pv-bad', !!tv.over);
  drawSpacing($('mvCell'), s);
  // with a paper size, Braille size (Page) scales the pitches: say so, the fields show 100 %
  $('mvCellCap').textContent = r && pageOn() && state.scale !== 100 ? `Braille spacing at ${state.scale} % (Braille size in Page)` : 'Braille spacing';
  drawZ($('mvZ'), v);
  $('mvZCap').textContent = Number.isFinite(v.feed) ? `plunge ${fmm(v.feed)} mm/min · settle ${Number.isFinite(v.dwell) ? fmm(v.dwell) : '–'} s` : '';
  $('mvError').textContent = state.error ? 'Fix the settings: ' + state.error : '';
  $('mvError').hidden = !state.error;
}
// Tool Box: the static parts are drawn once per change; the punch moves with every status report.
const tb = { map: null, bounds: null, zmap: null };
function drawToolbox() {
  if (!setupOpen() || setup.tab !== 'tools') return;
  const r = state.result;
  const pos = machine.connected && machine.status && machine.status.wpos;
  const tv = drawTopView($('tbMap'), { s: r ? r.settings : fieldValues(), dots: false, head: pos ? [pos[0], pos[1]] : null });
  tb.map = tv.m;
  const head = svgEl('g', {}, 'pv-head');
  head.id = 'tbHead';
  head.append(svgEl('path', { d: 'M-9 0h18M0 -9v18' }, 'pv-head-cross'), svgEl('circle', { cx: 0, cy: 0, r: 4.5 }, 'pv-head-dot'));
  $('tbMap').append(head);
  // side view: the punch height against the paper, clearance and punch depth
  const { w: zw, h } = svgBox($('tbZ'));
  const v = fieldValues();
  const cz = Number.isFinite(v.clearZ) ? v.clearZ : 5, pz = Number.isFinite(v.punchZ) ? v.punchZ : -5;
  const z = pos ? pos[2] : null;
  const top = Math.max(cz, 1, z == null ? -Infinity : z) + 2, bottom = Math.min(pz, -1, z == null ? Infinity : z) - 2;
  const Y = zz => 10 + (top - zz) / (top - bottom) * (h - 20);
  tb.zmap = { Y, top, bottom };
  const zsvg = $('tbZ');
  zsvg.append(svgEl('rect', { x: 0, y: n3(Y(0)), width: zw, height: 4 }, 'pv-z-paper'));
  for (const [zz, label, cls] of [[cz, 'clear', 'pv-z-line'], [pz, 'depth', 'pv-z-line pv-z-depth']]) {
    zsvg.append(svgEl('path', { d: `M40 ${n3(Y(zz))}H${zw}` }, cls));
    svgText(zsvg, zw - 4, Y(zz) - 3, label, 'pv-label', 'end');
  }
  svgText(zsvg, zw - 4, Y(0) + 13, 'Z0', 'pv-label', 'end');
  const punch = svgEl('g', {}, 'pv-head');
  punch.id = 'tbPunch';
  punch.append(svgEl('path', { d: 'M-6 -26h12v18l-6 8l-6 -8z' }, 'pv-punch'));
  zsvg.append(punch);
  moveHead(true);
}
function moveHead(fresh) {
  const pos = machine.connected && machine.status && machine.status.wpos;
  $('tbPos').textContent = pos ? `X ${pos[0].toFixed(2)}  Y ${pos[1].toFixed(2)}  Z ${pos[2].toFixed(2)}` : 'X –  Y –  Z –';
  $('tbNote').hidden = !!pos;
  if (!setupOpen() || setup.tab !== 'tools' || !tb.map) return;
  const head = $('tbHead'), punch = $('tbPunch');
  if (!head || !punch) return;
  head.style.visibility = punch.style.visibility = pos ? 'visible' : 'hidden';
  if (!pos) return;
  const x = tb.map.x(pos[0]), y = tb.map.y(pos[1]);
  const box = $('tbMap').viewBox.baseVal;
  // off the drawn area, or the punch left the Z scale: draw again with room for it
  if (!fresh && (x < 2 || y < 2 || x > box.width - 2 || y > box.height - 2 || pos[2] > tb.zmap.top || pos[2] < tb.zmap.bottom)) { drawToolbox(); return; }
  if (fresh) head.style.transition = punch.style.transition = 'none';
  head.style.transform = `translate(${n3(x)}px, ${n3(y)}px)`;
  punch.style.transform = `translate(22px, ${n3(tb.zmap.Y(pos[2]))}px)`;
  if (fresh) { void head.getBoundingClientRect(); head.style.transition = punch.style.transition = ''; }
}
function drawSetupPreviews() { drawValuesPreview(); drawToolbox(); }
new ResizeObserver(() => drawSetupPreviews()).observe($('setupPanel'));

// ------------------------------------------------------------------ WiFi: the machine's WiFi (top-left bar)
// Shows whether this computer is on the machine's WiFi (MKS DLC32) and joins it in one click.
const WIFI_DEFAULTS = Object.freeze({ ssid: 'MKS_DLC', password: '12345678' });
const wifi = { status: null, busy: false, step: '', error: '', assumed: '', ssid: WIFI_DEFAULTS.ssid, password: WIFI_DEFAULTS.password };
// Windows may list the network as "MKS_DLC 2"
const sameNet = (current, wanted) => !!current && !!wanted && (current === wanted || current.replace(/ \d+$/, '') === wanted);
const wifiOn = () => {
  const s = wifi.status;
  return !!(s && s.available && (sameNet(s.ssid, wifi.ssid) || (s.hidden && wifi.assumed === wifi.ssid)));
};

// "WiFi on" with a green light when this computer is on the machine's WiFi; "WiFi off" without a
// light when not - one click joins it.
function renderWifi() {
  const s = wifi.status;
  let st, text, title, now, tone = '';
  if (wifi.busy) {
    st = 'busy'; text = 'connecting…'; title = now = wifi.step || `Connecting to ${wifi.ssid}…`; tone = 'busy';
  } else if (!s) {
    st = 'check'; text = 'checking…'; title = now = 'Checking the WiFi…';
  } else if (!s.available) {
    st = 'na'; text = 'none'; title = now = s.error || 'WiFi is not available on this computer.'; tone = 'bad';
  } else if (wifiOn()) {
    st = 'on'; text = 'on'; tone = 'ok';
    title = `This computer is on ${wifi.ssid}, the machine's WiFi, for Photo from phone. Click for details.`;
    now = `✓ This computer is connected to “${wifi.ssid}”, the machine's WiFi.`;
  } else if (s.hidden) {
    st = 'na'; text = '?'; title = now = s.error || 'The system does not tell which WiFi this computer is on.';
  } else {
    st = 'off'; text = 'off';
    now = s.ssid ? `This computer is on “${s.ssid}”, not on the machine's WiFi.` : 'This computer is not connected to any WiFi.';
    title = `${now} Click to connect to ${wifi.ssid} (for Photo from phone).`;
  }
  const b = $('wifiBtn');
  b.dataset.state = st;
  b.title = title;
  b.setAttribute('aria-label', `WiFi (the machine's WiFi ${wifi.ssid}, for Photo from phone): ${text}`);
  $('wifiText').textContent = text;
  $('wifiNow').textContent = now;
  $('wifiNow').dataset.tone = tone;
  $('wifiConnectBtn').disabled = wifi.busy || (s && !s.available);
  $('wifiConnectBtn').textContent = wifi.busy ? 'Connecting…' : wifiOn() ? 'Connect again' : 'Connect';
  $('wifiError').hidden = !wifi.error;
  $('wifiError').textContent = wifi.error;
  renderPhone();
}
function openWifiPop(open) {
  $('wifiPop').hidden = !open;
  $('wifiBtn').setAttribute('aria-expanded', String(open));
  if (open) {
    $('wifiSsid').value = wifi.ssid;
    $('wifiPass').value = wifi.password;
  }
}
function readWifiFields() {
  wifi.ssid = $('wifiSsid').value.trim() || WIFI_DEFAULTS.ssid;
  wifi.password = $('wifiPass').value;
}
async function connectWifi() {
  if (!desk || wifi.busy) return;
  if (wifi.password && (wifi.password.length < 8 || wifi.password.length > 63)) {
    wifi.error = 'A WiFi password has 8 to 63 characters.';
    openWifiPop(true);
    renderWifi();
    return;
  }
  wifi.busy = true;
  wifi.error = '';
  wifi.step = `Connecting to ${wifi.ssid}…`;
  renderWifi();
  let r;
  try { r = await desk.wifi.connect(wifi.ssid, wifi.password); }
  catch (e) { r = { ok: false, error: e.message }; }
  wifi.busy = false;
  if (r.status) wifi.status = r.status;
  if (r.ok) {
    wifi.assumed = r.status && r.status.assumed ? wifi.ssid : '';
    flash(`Connected to ${wifi.ssid}, the machine's WiFi.`);
  } else {
    wifi.error = r.error || 'Could not connect.';
    openWifiPop(true);
  }
  renderWifi();
}
$('wifiBtn').onclick = () => {
  // one click: not on the machine's WiFi -> join it; otherwise show the details
  if ($('wifiBtn').dataset.state === 'off') { wifi.error = ''; connectWifi(); return; }
  openWifiPop($('wifiPop').hidden);
};
$('wifiPopClose').onclick = () => { openWifiPop(false); $('wifiBtn').focus(); };
$('wifiConnectBtn').onclick = () => { readWifiFields(); saveStore(); connectWifi(); };
$('wifiDefaultsBtn').onclick = () => {
  $('wifiSsid').value = WIFI_DEFAULTS.ssid;
  $('wifiPass').value = WIFI_DEFAULTS.password;
  readWifiFields();
  wifi.error = '';
  saveStore();
  renderWifi();
};
for (const id of ['wifiSsid', 'wifiPass']) $(id).addEventListener('change', () => { readWifiFields(); saveStore(); renderWifi(); });
$('wifiShowPass').addEventListener('change', () => { $('wifiPass').type = $('wifiShowPass').checked ? 'text' : 'password'; });
document.addEventListener('mousedown', e => { if (!$('wifiPop').hidden && !e.target.closest('.wifi-wrap')) openWifiPop(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('wifiPop').hidden) { openWifiPop(false); $('wifiBtn').focus(); } });
if (desk && desk.wifi) {
  desk.wifi.onEvent(e => {
    if (e.type === 'status' && e.status) {
      wifi.status = e.status;
      if (!e.status.hidden) wifi.assumed = '';
    } else if (e.type === 'step') wifi.step = e.text;
    renderWifi();
  });
}

// ------------------------------------------------------------------ photo from phone (Scan text)
// A phone on the same WiFi opens a small camera page (QR code); its photos come here and are read.
const phone = { on: false, starting: false, info: null, seen: 0, device: '', recv: null, note: null, queue: [], pumping: false, told: false, wifiQr: '', wifiQrKey: '', ticker: 0 };
const qrKind = () => ((document.querySelector('input[name=phoneQrKind]:checked') || {}).value === 'wifi' ? 'wifi' : 'page');
function phoneNote(text, tone, ms = 6000) {
  phone.note = { text, tone, until: Date.now() + ms };
  renderPhone();
}
function phoneStatus() {
  const info = phone.info;
  if (!info.url) return ['bad', 'This computer has no network address yet. Connect it to the WiFi first (WiFi at the top left).'];
  if (phone.recv) return ['busy', phone.recv.total ? `Receiving a photo… ${Math.min(100, Math.round(100 * phone.recv.received / phone.recv.total))}%` : 'Receiving a photo…'];
  if (phone.note && Date.now() < phone.note.until) return [phone.note.tone, phone.note.text];
  if (Date.now() - phone.seen < 12000) return ['ok', `${phone.device || 'Phone'} connected ✓ Tap Take photo on the phone.`];
  return ['wait', 'Waiting for the phone… Scan the code with the phone camera.'];
}
async function updateWifiQr() {
  const key = wifi.ssid + '\n' + wifi.password;
  if (phone.wifiQrKey === key || !desk) return;
  phone.wifiQrKey = key;
  const r = await desk.phone.wifiQr(wifi.ssid, wifi.password);
  phone.wifiQr = r && r.ok ? r.qr : '';
  renderPhone();
}
function phoneStep(parts) {
  // parts: strings, [bold text], or a node
  const li = el('li');
  for (const p of parts) li.append(Array.isArray(p) ? el('b', null, p[0]) : p);
  return li;
}
function renderPhone() {
  const on = !!(phone.on && phone.info && phone.info.running);
  $('phoneCard').dataset.state = on ? 'on' : 'off';
  $('phoneBtn').textContent = phone.starting ? 'Starting…' : on ? 'Stop' : 'Use phone camera';
  $('phoneBtn').classList.toggle('primary', !on);
  $('phoneBtn').disabled = phone.starting || !desk;
  $('phoneBody').hidden = !on;
  $('phoneShots').hidden = !$('phoneShots').children.length;
  if (!on) {
    $('phoneSub').textContent = phone.note && Date.now() < phone.note.until && phone.note.tone === 'bad'
      ? phone.note.text : 'Take a photo with your phone: it comes straight here and its text is read.';
    return;
  }
  const info = phone.info;
  const s = wifi.status;
  const onMachine = wifiOn();
  const net = s && s.available && s.ssid ? s.ssid : '';
  $('phoneSub').textContent = on && info.url ? 'On. Photos from the phone are read into the text box.' : 'On.';
  const kind = qrKind();
  const steps = [];
  if (kind === 'wifi') {
    updateWifiQr();   // (again only when the name or password changed)
    $('phoneQr').src = phone.wifiQr || '';
    $('phoneQr').alt = `QR code: join the WiFi ${wifi.ssid}`;
    steps.push(phoneStep(['Scan this code with the phone camera to join ', [wifi.ssid], ` (password ${wifi.password || 'none'}).`]));
    steps.push(phoneStep(['Then choose ', ['Camera page'], ' here and scan that code.']));
    if (!onMachine && s && s.available) {
      const b = el('button', 'btn small', `Connect this computer to ${wifi.ssid}`);
      b.type = 'button';
      b.disabled = wifi.busy;
      b.onclick = () => connectWifi();
      steps.push(phoneStep(['This computer must be on it too: ', b]));
    }
  } else {
    $('phoneQr').src = info.qr || '';
    $('phoneQr').alt = 'QR code: camera page for the phone';
    if (onMachine) steps.push(phoneStep(['Phone on the machine WiFi ', [wifi.ssid], ' (this computer is on it).']));
    else if (net) {
      const li = phoneStep(['Phone on the same WiFi as this computer: ', [net], '. ']);
      if (!wifi.busy) {
        const b = el('button', 'btn small', `Use ${wifi.ssid} instead`);
        b.type = 'button';
        b.onclick = () => connectWifi();
        li.append(b);
      }
      steps.push(li);
    } else steps.push(phoneStep(['Phone and this computer on the same WiFi, e.g. the machine WiFi ', [wifi.ssid], '.']));
    steps.push(phoneStep(['Scan this code with the phone camera and open the link.']));
    steps.push(phoneStep(['Tap ', ['Take photo'], ' (', ['Crop'], ' it if needed), then ', ['Send'], '. The photo shows here and its text goes into the text box.']));
  }
  $('phoneSteps').replaceChildren(...steps);
  $('phoneUrl').textContent = info.url || '-';
  const list = info.addresses || [];
  $('phoneAddr').hidden = list.length < 2;
  if (list.length >= 2) {
    $('phoneAddr').replaceChildren(...list.map(a => new Option(`${a.ip} (${a.iface})`, a.ip, false, a.ip === info.address)));
  }
  const [tone, text] = phoneStatus();
  $('phoneStatus').dataset.tone = tone;
  $('phoneStatus').textContent = text;
  $('phoneHelp').hidden = tone === 'ok' || tone === 'busy';
}
function phoneTick() {
  clearInterval(phone.ticker);
  phone.ticker = phone.on ? setInterval(() => { if ($('ocrDialog').open) renderPhone(); }, 1000) : 0;
}
async function startPhone() {
  if (!desk || phone.starting) return;
  phone.starting = true;
  renderPhone();
  let r;
  try { r = await desk.phone.start(); } catch (e) { r = { ok: false, error: e.message }; }
  phone.starting = false;
  if (r.ok) {
    phone.on = true;
    phone.info = r.info;
    phone.note = null;
  } else {
    phone.on = false;
    phoneNote(r.error || 'The phone link could not start.', 'bad', 15000);
  }
  phoneTick();
  saveStore();
  renderPhone();
}
async function stopPhone() {
  phone.on = false;
  phone.info = null;
  phone.seen = 0;
  phone.recv = null;
  phoneTick();
  saveStore();
  renderPhone();
  if (desk) await desk.phone.stop();
}
$('phoneBtn').onclick = () => (phone.on ? stopPhone() : startPhone());
document.querySelectorAll('input[name=phoneQrKind]').forEach(r => r.addEventListener('change', () => { if (qrKind() === 'wifi') updateWifiQr(); renderPhone(); }));
$('phoneAddr').addEventListener('change', async () => {
  const r = await desk.phone.useAddress($('phoneAddr').value);
  if (r && r.ok) { phone.info = r.info; renderPhone(); }
});

// the photos: small pictures in the Scan dialog; click one to see it large (and to remove it)
const shotInfo = new WeakMap();   // picture -> { n, file, chunk: the text it put in the text box }
let photoView = null;             // the picture shown large
function addShot(file, n) {
  const b = el('button', 'shot');
  b.type = 'button';
  b.dataset.state = 'new';
  b.title = `Photo ${n} from the phone. Click to see it large or remove it.`;
  const img = el('img');
  img.alt = `Photo ${n} from the phone`;
  img.src = URL.createObjectURL(file);
  const badge = el('span', 'shot-badge', `#${n}`);
  b.append(img, badge);
  shotInfo.set(b, { n, file, chunk: null });
  b.onclick = () => openPhoto(b);
  const box = $('phoneShots');
  box.prepend(b);
  while (box.children.length > 12) {
    const old = box.lastElementChild;
    URL.revokeObjectURL(old.querySelector('img').src);
    old.remove();
  }
  box.hidden = false;
  return b;
}
function setShot(b, st, n) {
  b.dataset.state = st;
  b.querySelector('.shot-badge').textContent = st === 'reading' ? `#${n} reading…` : st === 'done' ? `#${n} ✓` : st === 'empty' ? `#${n} no text` : `#${n}`;
  if (photoView === b) photoBar();
}
function openPhoto(b) {
  const img = b.querySelector('img');
  photoView = b;
  $('photoBig').src = img.src;
  $('photoBig').alt = img.alt;
  photoBar();
  $('photoDialog').showModal();
}
function photoBar() {
  const b = photoView, info = b && shotInfo.get(b);
  if (!info) return;
  const st = b.dataset.state;
  $('photoCaption').textContent = `Photo ${info.n} from the phone · ` + (st === 'done' ? 'text read ✓' : st === 'empty' ? 'no text found' : st === 'reading' ? 'reading…' : 'not read yet');
  $('photoRemove').disabled = st === 'reading';
  $('photoRemove').title = st === 'reading' ? 'Wait until the photo is read.' : 'Remove this photo and the text it put in the text box.';
}
$('photoClose').onclick = () => $('photoDialog').close();
$('photoDialog').addEventListener('click', e => { if (e.target === $('photoDialog') || e.target === $('photoBig')) $('photoDialog').close(); });
$('photoDialog').addEventListener('close', () => { photoView = null; setTimeout(pumpPhone, 0); });   // photos that came meanwhile

// Where a photo's text is in the text box, with the break that came with it (the line break or
// page break before it; after it when it is first): { start, end }. Only as it came - between
// breaks, unchanged - so no other text is ever taken; null otherwise.
const SEP_BEFORE = new RegExp('(?:\\n(?:' + D.PAGE_MARK.source + ')\\n|\\n\\n)$', 'i');
const SEP_AFTER = new RegExp('^(?:\\n(?:' + D.PAGE_MARK.source + ')\\n|\\n\\n)', 'i');
function findChunk(chunk) {
  const v = $('sentence').value, n = chunk ? chunk.text.length : 0;
  if (!n) return null;
  for (let i = v.lastIndexOf(chunk.text); i >= 0; i = i > 0 ? v.lastIndexOf(chunk.text, i - 1) : -1) {
    const end = i + n;
    const after = v.slice(end, end + 120).match(SEP_AFTER);
    if (end < v.length && !after) continue;
    if (!v.slice(0, i).trim()) return { start: 0, end: after ? end + after[0].length : end };
    const before = v.slice(Math.max(0, i - 120), i).match(SEP_BEFORE);
    if (before) return { start: i - before[0].length, end };
  }
  return null;
}

$('photoRemove').onclick = async () => {
  const b = photoView, info = b && shotInfo.get(b);
  if (!info || b.dataset.state === 'reading') return;
  const st = b.dataset.state;
  const found = st === 'done' ? findChunk(info.chunk) : null;
  const text = st === 'new' ? 'It has not been read yet.'
    : found ? 'The text it put in the text box is taken out too.'
    : st === 'done' ? 'Its text was changed in the text box, so the text stays there.'
    : 'No text came from it.';
  if (!(await confirmBox(`Remove photo ${info.n}?`, text, 'Remove photo'))) return;
  if (b.dataset.state === 'reading' || !b.isConnected) return;   // (it is being read now)
  removeShot(b);
};
function removeShot(b) {
  const info = shotInfo.get(b);
  const q = phone.queue.findIndex(x => x.shot === b);   // not read yet
  if (q >= 0) phone.queue.splice(q, 1);
  const at = b.dataset.state === 'done' ? findChunk(info.chunk) : null;
  if (at) {
    const t = $('sentence'), v = t.value;
    setText(t, v.slice(0, at.start) + v.slice(at.end), at.start, at.start, 'none', true);
    scheduleRebuild(false, true);   // (the page breaks after it count again)
  }
  const si = ocr.sources.map(x => x.label).lastIndexOf(info.file.name);
  if (si >= 0) { ocr.sources.splice(si, 1); renderSources(); }
  const files = [...$('files').files];   // Extract text must not read it again
  const keep = files.filter(f => !(f.name === info.file.name && f.size === info.file.size));
  if (keep.length !== files.length) showFiles(keep);
  URL.revokeObjectURL(b.querySelector('img').src);
  b.remove();
  shotInfo.delete(b);
  $('photoDialog').close();
  $('ocrStatus').textContent = `Photo ${info.n} removed` + (at ? ', with its text.' : '.');
  renderPhone();
  const next = $('phoneShots').querySelector('.shot');
  (next || $('phoneBtn')).focus();
}

// A photo came: show it and read it. With Scan open, the first photo follows "Put the text" and the
// next ones are added after it. When the photo opens Scan itself, it is always added after the text:
// text is never replaced without the choice being on the screen.
async function pumpPhone() {
  if (phone.pumping || !phone.queue.length || ocr.busy) return;
  if (state.printing || document.querySelector('dialog[open]:not(#ocrDialog)')) {
    if (!phone.told) { flash('Photo from the phone received. It is read when you open Scan text.'); phone.told = true; }
    return;
  }
  phone.told = false;
  phone.pumping = true;
  try {
    const wasOpen = $('ocrDialog').open;
    if (!wasOpen) openOcr();
    while (phone.queue.length && !ocr.busy) {
      const items = phone.queue.splice(0);
      if (ocr.runs > 0 || !wasOpen) document.querySelector('input[name=importMode][value=append]').checked = true;
      showFiles(items.map(i => i.file));
      for (const i of items) setShot(i.shot, 'reading', i.n);
      await runExtract();
      for (const i of items) {
        const src = [...ocr.sources].reverse().find(x => x.label === i.file.name);
        const info = shotInfo.get(i.shot);
        if (info) info.chunk = ocr.added.find(a => a.label === i.file.name) || null;   // for Remove
        setShot(i.shot, src && src.status === 'OCR' ? 'done' : 'empty', i.n);
      }
      document.querySelector('input[name=importMode][value=append]').checked = true;   // later photos add after
    }
  } finally {
    phone.pumping = false;
  }
}
if (desk && desk.phone) {
  desk.phone.onEvent(e => {
    if (e.type === 'visit') { phone.seen = Date.now(); phone.device = e.device || ''; }
    else if (e.type === 'receiving') phone.recv = e.cancelled ? null : { received: e.received || 0, total: e.total || 0 };
    else if (e.type === 'rejected') { phone.recv = null; phoneNote('Photo not taken: ' + e.error, 'bad'); }
    else if (e.type === 'info') { if (phone.on) phone.info = e.info; }
    else if (e.type === 'photo') {
      phone.recv = null;
      phone.seen = Date.now();
      const file = new File([e.bytes], e.name, { type: e.mime, lastModified: Date.now() });
      phone.queue.push({ file, n: e.n, shot: addShot(file, e.n) });
      phoneNote(`Photo ${e.n} received ✓ Reading the text…`, 'ok', 4000);
      pumpPhone();
    }
    renderPhone();
  });
}

// ------------------------------------------------------------------ profile logos (About)
// Official LinkedIn / GitHub / Facebook logo files, if the user put them in the brand folder.
if (desk && desk.brandLogos) desk.brandLogos().then(logos => {
  for (const a of document.querySelectorAll('a.social[data-brand]')) {
    const src = logos && logos[a.dataset.brand];
    if (!src) continue;
    const img = new Image();
    img.className = 'brand-logo';
    img.alt = '';
    img.onload = () => { const icon = a.querySelector('svg'); if (icon) icon.replaceWith(img); };
    img.src = src;
  }
}).catch(() => {});

// ------------------------------------------------------------------ start
$('sentence').value = typeof stored.text === 'string' ? stored.text : DEFAULT_TEXT;
writeSettings(Object.assign({}, D.DEFAULTS, stored.settings || {}));
voice.model = stored.voiceModel === 'fast' ? 'fast' : 'accurate';
if (stored.inputLang === 'bn') setLang('bn'); else syncLang();
$('voiceModel').value = activeVoiceModel();
if (stored.baud) $('baudSelect').value = String(stored.baud);
$('forceOcr').checked = !!(stored.ocr && stored.ocr.forceOcr);
$('invertPrint').checked = stored.invert !== false;
$('paperSize').replaceChildren(...D.PAPER_SIZES.map(p => new Option(p.label, p.id)));
function restorePage(page, sheet) {
  if (page && typeof page === 'object') {
    if (D.PAPER_SIZES.some(x => x.id === page.size)) $('paperSize').value = page.size;
    const o = document.querySelector(`input[name=orientation][value=${page.orientation === 'landscape' ? 'landscape' : 'portrait'}]`);
    o.checked = true;
    for (const [id, key] of [['paperW', 'w'], ['paperH', 'h']]) {
      if (page[key] !== undefined && page[key] !== '' && Number.isFinite(Number(page[key]))) $(id).value = page[key];
    }
    const oldMm = marginMm();   // margins are saved in mm; older files have no unit
    if (page.marginUnit === 'cm' || page.marginUnit === 'mm') document.querySelector(`input[name=marginUnit][value=${page.marginUnit}]`).checked = true;
    const m = page.margin == null || page.margin === '' ? NaN : Number(page.margin);
    showMargin(Number.isFinite(m) ? m : oldMm);
    // page scaling: anything else (older files, the removed "None") gets the standard, Fit to printer margins
    const scale = SCALE_MODES.includes(page.scale) ? page.scale : 'fit';
    document.querySelector(`input[name=pageScale][value=${scale}]`).checked = true;
    if (page.scalePct != null && page.scalePct !== '' && Number.isFinite(Number(page.scalePct))) {
      $('scalePct').value = Math.min(D.SCALE_MAX, Math.max(D.SCALE_MIN, Math.round(Number(page.scalePct))));
    }
    if (typeof page.pdfPaper === 'boolean') $('pdfPaper').checked = page.pdfPaper;
    const want = !!page.on;
    if (want && !pageOn()) manualArea = manualArea || readArea();
    if (!want && pageOn() && manualArea) { for (const k of AREA_KEYS) $(k).value = manualArea[k]; manualArea = null; }
    $('pageMode').checked = want;
  }
  if (sheet && typeof sheet === 'object') {
    $('autoNext').checked = sheet.auto !== false;
    if (Number.isFinite(Number(sheet.seconds))) $('autoNextSec').value = Math.min(3600, Math.max(5, Math.round(Number(sheet.seconds))));
  }
  $('autoNextSec').disabled = !$('autoNext').checked;
  applyPage();
}
if (stored.manualArea && typeof stored.manualArea === 'object') manualArea = stored.manualArea;
restorePage(stored.page, stored.sheet);
$('morePanel').open = stored.moreOpen === true;
$('showGcode').checked = stored.showGcode === true;   // the listing starts hidden: Copy and Save work without it
applyShowGcode();
if (ZOOMS.includes(String(stored.zoom))) document.querySelector(`input[name=zoom][value="${stored.zoom}"]`).checked = true;
$('lockMachine').checked = stored.lockMachine !== false;   // machine values start locked
applyLock();
showSetupTab(typeof stored.setupTab === 'string' ? stored.setupTab : 'guide');
state.sideView = stored.sideView === true;
if (stored.jogUnit === 'cm') document.querySelector('input[name=jogUnit][value=cm]').checked = true;
$('sourceBreak').checked = !!(stored.ocr && stored.ocr.sourceBreak);
$('keepLines').checked = !!(stored.ocr && stored.ocr.keepLines);
if (stored.wifi && typeof stored.wifi === 'object') {
  if (typeof stored.wifi.ssid === 'string' && stored.wifi.ssid.trim()) wifi.ssid = stored.wifi.ssid.trim().slice(0, 32);
  if (typeof stored.wifi.password === 'string') wifi.password = stored.wifi.password.slice(0, 63);
}
if (desk && desk.wifi) {
  $('wifiBtn').hidden = false;
  renderWifi();
  desk.wifi.status().then(r => { if (r && r.ok) { wifi.status = r.status; renderWifi(); } }).catch(() => {});
}
if (desk && desk.phone) {
  // the phone link stays on until it is stopped (also after a restart)
  desk.phone.info().then(r => {
    if (r && r.ok && r.info && r.info.running) { phone.on = true; phone.info = r.info; phoneTick(); renderPhone(); }
    else if (stored.phone && stored.phone.on) startPhone();
    else renderPhone();
  }).catch(() => {});
} else renderPhone();
if (!desk) {
  showMachineMsg('Open DotSense with "npm start" to use the machine, voice typing, OCR and file saving.', 'bad');
} else {
  refreshPorts();
  desk.machine.info().then(r => {
    if (r.ok && r.status && r.status.connected) {
      machine.connected = true;
      machine.info = r.info;
      $('machineVersion').textContent = 'Grbl ' + r.info.version;
      applyStatus(r.status);
    }
  });
}
rebuild(false);
if (stored.fixOn !== false) openFixer(false);   // Auto correct: on unless it was switched off
