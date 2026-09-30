/*
 * DotSense core: Grade-1 braille translation, page layout (auto-wrap) and G-code.
 * Runs in the app window (window.DotSense) and in Node for tests (module.exports).
 *
 * Coordinates follow the original Braille Gcode app:
 *   Start position X/Y = dot 1 (top-left dot) of the first cell on the page.
 *   Cells advance toward +X, dots 2/3 and following lines advance toward -Y.
 */
(function (root) {
  'use strict';

  const LETTERS = {
    a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5],
    f: [1, 2, 4], g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4], j: [2, 4, 5],
    k: [1, 3], l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5],
    p: [1, 2, 3, 4], q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5], s: [2, 3, 4], t: [2, 3, 4, 5],
    u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6], x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6],
    z: [1, 3, 5, 6]
  };
  // Digits reuse the a-j shapes, preceded by the number sign.
  const DIGITS = {
    '1': [1], '2': [1, 2], '3': [1, 4], '4': [1, 4, 5], '5': [1, 5],
    '6': [1, 2, 4], '7': [1, 2, 4, 5], '8': [1, 2, 5], '9': [2, 4], '0': [2, 4, 5]
  };
  const PUNCT = {
    ',': [2], ';': [2, 3], ':': [2, 5], '.': [2, 5, 6],
    '!': [2, 3, 5], '?': [2, 3, 6], "'": [3], '-': [3, 6]
  };
  const PUNCT_NAMES = { ',': 'comma', ';': 'semicolon', ':': 'colon', '.': 'period', '!': 'exclamation mark', '?': 'question mark', "'": 'apostrophe', '-': 'hyphen' };
  const NUMBER_SIGN = [3, 4, 5, 6];
  const LETTER_SIGN = [5, 6];   // also the UEB grade 1 sign: "read the next cell as written"

  // Other signs and symbols, as in Unified English Braille (UEB), checked against liblouis
  // (en-ueb-g1). [sign, cells ('4-1' = dots 4, then dot 1), name, 'num' = a number comes out of it]
  // Quotes, the apostrophe and ? also look at their neighbours: see cellsFor.
  const SYMBOL_TABLE = [
    ['"', '6-2356', 'quotation mark'], ['#', '456-1456', 'hash'], ['$', '4-234', 'dollar'], ['%', '46-356', 'percent'],
    ['&', '4-12346', 'ampersand'], ['(', '5-126', 'opening parenthesis'], [')', '5-345', 'closing parenthesis'],
    ['*', '5-35', 'asterisk'], ['+', '5-235', 'plus'], ['/', '456-34', 'slash'], ['<', '4-126', 'less than'],
    ['=', '5-2356', 'equals'], ['>', '4-345', 'greater than'], ['@', '4-1', 'at sign'], ['[', '46-126', 'opening bracket'],
    [']', '46-345', 'closing bracket'], ['\\', '456-16', 'backslash'], ['^', '4-26', 'caret'], ['_', '46-36', 'underscore'],
    ['`', '46-16', 'grave accent'], ['{', '456-126', 'opening brace'], ['}', '456-345', 'closing brace'],
    ['|', '456-1256', 'vertical bar'], ['~', '4-35', 'tilde'],
    ['¡', '45-56-235', 'inverted exclamation mark'], ['¢', '4-14', 'cent'], ['£', '4-123', 'pound'], ['¤', '1246', 'currency sign'],
    ['¥', '4-13456', 'yen'], ['¦', '46-1256', 'broken bar'], ['§', '45-234', 'section'], ['¨', '45-25', 'diaeresis'],
    ['©', '45-14', 'copyright'], ['«', '456-236', 'opening guillemet'], ['¬', '4-1456', 'not sign'], ['®', '45-1235', 'registered'],
    ['¯', '4-36', 'macron'], ['°', '45-245', 'degree'], ['±', '456-235', 'plus or minus'],
    ['²', '56-35-3456-12', 'superscript 2', 'num'], ['³', '56-35-3456-14', 'superscript 3', 'num'], ['´', '45-34', 'acute accent'],
    ['µ', '46-134', 'micro'], ['¶', '45-1234', 'paragraph sign'], ['·', '4-16', 'middle dot'], ['¸', '45-12346', 'cedilla'],
    ['»', '456-356', 'closing guillemet'], ['¼', '3456-1-34-145', 'one quarter', 'num'], ['½', '3456-1-34-12', 'one half', 'num'],
    ['¾', '3456-14-34-145', 'three quarters', 'num'], ['¿', '45-56-236', 'inverted question mark'], ['×', '5-236', 'times'],
    ['÷', '5-34', 'divided by'],
    ['‒', '6-36', 'dash'], ['–', '6-36', 'dash'], ['—', '6-36', 'dash'], ['―', '5-6-36', 'long dash'],
    ['‘', '6-236', 'opening single quote'], ['‚', '6-236', 'opening single quote'], ['‛', '6-236', 'opening single quote'],
    ['’', '6-356', 'closing single quote'], ['“', '236', 'opening quote'], ['„', '236', 'opening quote'], ['‟', '236', 'opening quote'],
    ['”', '356', 'closing quote'], ['†', '4-6-1456', 'dagger'], ['‡', '4-6-12456', 'double dagger'], ['•', '456-256', 'bullet'],
    ['′', '2356', 'prime'], ['″', '2356-2356', 'double prime'],
    ['€', '4-15', 'euro'], ['₣', '4-124', 'franc'], ['₦', '4-1345', 'naira'], ['™', '45-2345', 'trade mark'],
    ['←', '56-1256-246', 'left arrow'], ['↑', '56-1256-346', 'up arrow'], ['→', '56-1256-135', 'right arrow'], ['↓', '56-1256-146', 'down arrow'],
    ['−', '5-36', 'minus'], ['≠', '5-2356-4-156', 'not equal to'], ['≤', '456-4-126', 'less than or equal to'],
    ['≥', '456-4-345', 'greater than or equal to'], ['≈', '45-35', 'almost equal to'], ['∞', '3456-123456', 'infinity'],
    ['√', '5-146', 'square root'],
    ['⅓', '3456-1-34-14', 'one third', 'num'], ['⅔', '3456-12-34-14', 'two thirds', 'num'], ['⅕', '3456-1-34-15', 'one fifth', 'num'],
    ['⅖', '3456-12-34-15', 'two fifths', 'num'], ['⅗', '3456-14-34-15', 'three fifths', 'num'], ['⅘', '3456-145-34-15', 'four fifths', 'num'],
    ['⅙', '3456-1-34-124', 'one sixth', 'num'], ['⅚', '3456-15-34-124', 'five sixths', 'num'], ['⅛', '3456-1-34-125', 'one eighth', 'num'],
    ['⅜', '3456-14-34-125', 'three eighths', 'num'], ['⅝', '3456-15-34-125', 'five eighths', 'num'], ['⅞', '3456-1245-34-125', 'seven eighths', 'num'],
    ['✓', '4-146', 'check mark'],
    // maths, arrows, shapes and more
    ['↖', '56-1256-156', 'north west arrow'], ['↗', '56-1256-234', 'north east arrow'], ['↘', '56-1256-126', 'south east arrow'], ['↙', '56-1256-345', 'south west arrow'],
    ['↦', '56-1256-1256', 'rightwards arrow from bar'], ['↲', '56-1256-256', 'downwards arrow with tip leftwards'], ['↳', '56-1256-356', 'downwards arrow with tip rightwards'], ['↵', '56-1256-256-146', 'downwards arrow with corner leftwards'],
    ['⇀', '56-1256-4-1235', 'rightwards harpoon with barb upwards'], ['⇁', '56-1256-6-1235', 'rightwards harpoon with barb downwards'], ['⇌', '45-456-2356', 'rightwards harpoon over leftwards harpoon'], ['⇐', '56-1256-2356-246', 'leftwards double arrow'],
    ['⇑', '56-1256-2356-346', 'upwards double arrow'], ['⇒', '56-1256-2356-135', 'rightwards double arrow'], ['⇓', '56-1256-2356-146', 'downwards double arrow'], ['∀', '45-1', 'for all'],
    ['∂', '4-145', 'partial differential'], ['∃', '45-26', 'there exists'], ['∄', '45-26-4-156', 'there does not exist'], ['∅', '4-245', 'empty set'],
    ['∆', '6-46-145', 'increment'], ['∇', '45-145', 'nabla'], ['∈', '45-15', 'element of'], ['∉', '45-15-4-156', 'not an element of'],
    ['∋', '4-45-15', 'contains as member'], ['∌', '4-45-15-4-156', 'does not contain as member'], ['∏', '6-46-1234', 'n-ary product'], ['∑', '6-46-234', 'n-ary summation'],
    ['∓', '456-36', 'minus-or-plus sign'], ['∖', '456-16', 'set minus'], ['∗', '5-35', 'asterisk operator'], ['∘', '5-356', 'ring operator'],
    ['∝', '456-5-2356', 'proportional to'], ['∠', '456-246', 'angle'], ['∡', '46-456-246', 'measured angle'], ['∣', '456-1256', 'divides'],
    ['∤', '456-1256-4-156', 'does not divide'], ['∥', '3456-123', 'parallel to'], ['∦', '3456-123-4-156', 'not parallel to'], ['∧', '4-236', 'logical and'],
    ['∨', '4-235', 'logical or'], ['∩', '46-236', 'intersection'], ['∪', '46-235', 'union'], ['∫', '2346', 'integral'],
    ['∮', '4-2346', 'contour integral'], ['∴', '6-16', 'therefore'], ['∵', '4-34', 'because'], ['∶', '25', 'ratio'],
    ['∷', '25-25', 'proportion'], ['∼', '4-35', 'tilde operator'], ['≁', '4-35-4-156', 'not tilde'], ['≃', '456-35', 'asymptotically equal to'],
    ['≄', '456-35-4-156', 'not asymptotically equal to'], ['≅', '5-456-35', 'approximately equal to'], ['≇', '5-456-35-4-156', 'neither approximately nor actually equal to'], ['≉', '45-35-4-156', 'not almost equal to'],
    ['≏', '45-5-2356', 'difference between'], ['≑', '46-5-2356', 'geometrically equal to'], ['≡', '456-123456', 'identical to'], ['≢', '456-123456-4-156', 'not identical to'],
    ['≪', '46-4-126', 'much less-than'], ['≫', '46-4-345', 'much greater-than'], ['≮', '4-126-4-156', 'not less-than'], ['≯', '4-345-4-156', 'not greater-than'],
    ['≰', '456-4-126-4-156', 'neither less-than nor equal to'], ['≱', '456-4-345-4-156', 'neither greater-than nor equal to'], ['⊂', '45-126', 'subset of'], ['⊃', '45-345', 'superset of'],
    ['⊄', '45-126-4-156', 'not a subset of'], ['⊅', '45-345-4-156', 'not a superset of'], ['⊆', '456-45-126', 'subset of or equal to'], ['⊇', '456-45-345', 'superset of or equal to'],
    ['⊈', '456-45-126-4-156', 'neither a subset of nor equal to'], ['⊉', '456-45-345-4-156', 'neither a superset of nor equal to'], ['⊊', '46-45-126', 'subset of with not equal to'], ['⊋', '46-45-345', 'superset of with not equal to'],
    ['⊢', '456-25', 'right tack'], ['⊣', '4-456-25', 'left tack'], ['⊥', '3456-36', 'up tack'], ['⊦', '456-25', 'assertion'],
    ['⊨', '45-456-25', 'true'], ['⊬', '456-25-4-156', 'does not prove'], ['⊭', '45-456-25-4-156', 'not true'], ['⊲', '4-456-126', 'normal subgroup of'],
    ['⊳', '4-456-345', 'contains as normal subgroup'], ['⊴', '456-456-126', 'normal subgroup of or equal to'], ['⊵', '456-456-345', 'contains as normal subgroup or equal to'], ['⊾', '3456-456-246', 'right angle with arc'],
    ['⋅', '5-256', 'dot operator'], ['⋪', '4-456-126-4-156', 'not normal subgroup of'], ['⋫', '4-456-345-4-156', 'does not contain as normal subgroup'], ['⋬', '456-456-126-4-156', 'not normal subgroup of or equal to'],
    ['⋭', '456-456-345-4-156', 'does not contain as normal subgroup or equal'], ['〈', '4-126', 'left angle bracket'], ['〉', '4-345', 'right angle bracket'], ['■', '456-1246-3456-145', 'black square', 'num'],
    ['□', '1246-3456-145', 'white square', 'num'], ['▧', '46-1246-3456-145', 'square with upper left to lower right fill', 'num'], ['▲', '456-1246-3456-14', 'black up-pointing triangle', 'num'], ['△', '1246-3456-14', 'white up-pointing triangle', 'num'],
    ['○', '1246-123456', 'white circle'], ['◍', '46-1246-123456', 'circle with vertical fill'], ['▪', '456-256', 'black small square'], ['●', '5-35', 'black circle'],
    ['♀', '45-1346', 'female sign'], ['♂', '45-13456', 'male sign'], ['♭', '3456-126', 'music flat sign'], ['♮', '3456-16', 'music natural sign'],
    ['♯', '3456-146', 'music sharp sign'], ['✔', '4-146', 'heavy check mark'], ['│', '456', 'box drawings light vertical'], ['┊', '45', 'box drawings light quadruple dash vertical'],
    ['║', '6-456', 'box drawings double vertical'], ['╱', '345', 'box drawings light diagonal upper right to lower left'], ['╲', '126', 'box drawings light diagonal upper left to lower right'], ['⟂', '3456-36', 'perpendicular'],
    ['⦀', '3456-456-123', 'triple vertical bar delimiter'], ['⦵', '46-245', 'circle with horizontal bar'], ['⨣', '45-146-5-235', 'plus sign with circumflex accent above'], ['⨤', '45-12456-5-235', 'plus sign with tilde above'],
    ['⫤', '46-456-25', 'vertical bar double left turnstile'], ['⫴', '3456-456-123', 'triple vertical bar binary relation'], ['⫼', '3456-456-123', 'large triple vertical bar operator'], ['〃', '5-2', 'ditto mark'],
    ['ˇ', '45-345', 'caron'], ['˘', '4-346', 'breve'], ['˚', '45-1246', 'ring above'], ['˦', '45-46-14', 'high tone bar'],
    ['˧', '45-46-25', 'mid tone bar'], ['˨', '45-46-36', 'low tone bar'], ['⅐', '3456-1-34-1245', 'one seventh', 'num'], ['⅑', '3456-1-34-24', 'one ninth', 'num'],
    ['⅒', '3456-1-34-1-245', 'one tenth', 'num'], ['↉', '3456-245-34-14', 'zero thirds', 'num']
  ];
  const cellsOf = pattern => pattern.split('-').map(c => [...c].map(Number));
  const DIGIT_SHAPES = new Set(Object.values(DIGITS).map(d => d.join('')));   // the a-j cells
  const SYMBOLS = {};
  for (const [ch, dots, name, num] of SYMBOL_TABLE) SYMBOLS[ch] = { cells: cellsOf(dots), name, num: num === 'num' };
  // Accented letters: the accent's cells, then the letter (é = acute + e). Precomposed letters are
  // split into letter + accent (NFD). Letters with a stroke and ß have their own cells.
  const ACCENTS = {
    '̀': ['45-16', 'grave'], '́': ['45-34', 'acute'], '̂': ['45-146', 'circumflex'], '̃': ['45-12456', 'tilde'],
    '̄': ['4-36', 'macron'], '̆': ['4-346', 'breve'], '̈': ['45-25', 'diaeresis'], '̊': ['45-1246', 'ring'],
    '̌': ['45-346', 'caron'], '̧': ['45-12346', 'cedilla']
  };
  const STROKED = { 'ø': ['4-16', 'o'], 'ł': ['4-16', 'l'], 'đ': ['4-25', 'd'] };
  // More letters with their own cells (UEB, as liblouis): Greek, æ œ ð þ ŋ and other Latin letters.
  // Capitals are written like the small letters (capitals are not marked).
  const OTHER_LETTER_TABLE = [
    ['æ', '1-45-235-15', 'ae'], ['ð', '3456-1246', 'eth'], ['þ', '3456-2346', 'thorn'], ['ħ', '4-25-125', 'h with stroke'],
    ['ĳ', '24-45-235-245', 'ij'], ['ŋ', '45-1345', 'eng'], ['œ', '135-45-235-15', 'oe'], ['ŧ', '4-25-2345', 't with stroke'],
    ['ǝ', '456-26', 'turned e'], ['ə', '456-26', 'schwa'], ['ɨ', '4-25-24', 'i with stroke'], ['ƶ', '4-25-1356', 'z with stroke'],
    ['ǥ', '4-25-1245', 'g with stroke'], ['ƿ', '3456-2456', 'wynn'], ['ȝ', '3456-13456', 'yogh'], ['ȼ', '4-16-14', 'c with stroke'],
    ['ƀ', '4-25-12', 'b with stroke'], ['ɇ', '4-16-15', 'e with stroke'], ['ɉ', '4-25-245', 'j with stroke'], ['ɍ', '4-25-1235', 'r with stroke'],
    ['ɏ', '4-25-13456', 'y with stroke'], ['ⱥ', '4-16-1', 'a with stroke'], ['ⱦ', '4-16-2345', 't with diagonal stroke'], ['ꝁ', '4-25-13', 'k with stroke'],
    ['ꝃ', '4-16-13', 'k with diagonal stroke'], ['ꝑ', '4-25-1234', 'p with stroke through descender'], ['ꝗ', '4-25-12345', 'q with stroke through descender'], ['ꝙ', '4-16-12345', 'q with diagonal stroke'],
    ['ꝟ', '4-16-1236', 'v with diagonal stroke'], ['ꞙ', '4-25-124', 'f with stroke'], ['ᵽ', '4-25-1234', 'p with stroke'], ['α', '46-1', 'greek alpha'],
    ['β', '46-12', 'greek beta'], ['γ', '46-1245', 'greek gamma'], ['δ', '46-145', 'greek delta'], ['ε', '46-15', 'greek epsilon'],
    ['ζ', '46-1356', 'greek zeta'], ['η', '46-156', 'greek eta'], ['θ', '46-1456', 'greek theta'], ['ι', '46-24', 'greek iota'],
    ['κ', '46-13', 'greek kappa'], ['λ', '46-123', 'greek lamda'], ['μ', '46-134', 'greek mu'], ['ν', '46-1345', 'greek nu'],
    ['ξ', '46-1346', 'greek xi'], ['ο', '46-135', 'greek omicron'], ['π', '46-1234', 'greek pi'], ['ρ', '46-1235', 'greek rho'],
    ['σ', '46-234', 'greek sigma'], ['τ', '46-2345', 'greek tau'], ['υ', '46-136', 'greek upsilon'], ['φ', '46-124', 'greek phi'],
    ['χ', '46-12346', 'greek chi'], ['ψ', '46-13456', 'greek psi'], ['ω', '46-2456', 'greek omega'], ['ς', '46-234', 'greek final sigma']
  ];
  const OTHER_LETTERS = {};
  for (const [ch, dots, name] of OTHER_LETTER_TABLE) OTHER_LETTERS[ch] = { cells: cellsOf(dots), name };
  const SHARP_S = cellsOf('46-2346');
  // A Latin letter with accents: { base: 'e', pre: [accent cells], name: 'e acute' }, or null.
  function latinParts(ch) {
    const low = ch.toLowerCase();
    if (low.length !== 1) return null;
    if (STROKED[low]) return { base: STROKED[low][1], pre: cellsOf(STROKED[low][0]), name: STROKED[low][1] + ' with stroke' };
    const d = low.normalize('NFD');
    if (d.length < 2 || !LETTERS[d[0]]) return null;
    const pre = [], names = [];
    for (const m of d.slice(1)) {
      if (!ACCENTS[m]) return null;
      pre.push(...cellsOf(ACCENTS[m][0]));
      names.push(ACCENTS[m][1]);
    }
    return { base: d[0], pre, name: d[0] + ' ' + names.join(' ') };
  }

  // Bangla (Bengali) braille - Bharati braille as used in Bangladesh ('bd', default) or India ('in').
  // Sources: Wikipedia "Bengali Braille" (Bangladesh / India tables), liblouis bengali.cti (Braille
  // Council of India) and the Standard Bharati Braille Codes. A value is one cell (dot list) or a
  // list of cells. Vowel signs use the same cells as the vowels.
  const BN_VOWELS = {
    'অ': [1], 'আ': [3, 4, 5], 'ই': [2, 4], 'ঈ': [3, 5], 'উ': [1, 3, 6], 'ঊ': [1, 2, 5, 6],
    'ঋ': [[5], [1, 2, 3, 5]], 'ঌ': [[5], [1, 2, 3]], 'এ': [1, 5], 'ঐ': [3, 4], 'ও': [1, 3, 5], 'ঔ': [2, 4, 6],
    'ৠ': [[6], [1, 2, 3, 5]], 'ৡ': [[6], [1, 2, 3]]
  };
  const BN_SIGNS = {   // vowel signs (matras), written after the consonant like in Unicode
    'া': [3, 4, 5], 'ি': [2, 4], 'ী': [3, 5], 'ু': [1, 3, 6], 'ূ': [1, 2, 5, 6], 'ৃ': [[5], [1, 2, 3, 5]],
    'ৄ': [[6], [1, 2, 3, 5]], 'ৢ': [[5], [1, 2, 3]], 'ৣ': [[6], [1, 2, 3]], 'ে': [1, 5], 'ৈ': [3, 4], 'ো': [1, 3, 5], 'ৌ': [2, 4, 6],
    'ং': [5, 6], 'ঃ': [6], 'ঁ': [3], 'ঽ': [2]
  };
  const BN_CONSONANTS = {
    'ক': [1, 3], 'খ': [1, 3, 4, 6], 'গ': [1, 2, 4, 5], 'ঘ': [1, 2, 6], 'ঙ': [3, 4, 6],
    'চ': [1, 4], 'ছ': [1, 6], 'জ': [2, 4, 5], 'ঝ': [1, 3, 5, 6], 'ঞ': [2, 5],
    'ট': [2, 3, 4, 5, 6], 'ঠ': [2, 4, 5, 6], 'ড': [1, 2, 4, 6], 'ঢ': [1, 2, 3, 4, 5, 6], 'ণ': [3, 4, 5, 6],
    'ত': [2, 3, 4, 5], 'থ': [1, 4, 5, 6], 'দ': [1, 4, 5], 'ধ': [2, 3, 4, 6], 'ন': [1, 3, 4, 5],
    'প': [1, 2, 3, 4], 'ফ': [2, 3, 5], 'ব': [1, 2], 'ভ': [1, 2, 3, 6], 'ম': [1, 3, 4],
    'য': [1, 3, 4, 5, 6], 'র': [1, 2, 3, 5], 'ল': [1, 2, 3], 'শ': [1, 4, 6], 'ষ': [1, 2, 3, 4, 6], 'স': [2, 3, 4], 'হ': [1, 2, 5],
    'ড়': [1, 2, 4, 5, 6], 'ঢ়': [1, 2, 3, 5, 6], 'য়': [2, 6], 'ৎ': [[5], [2, 3, 4, 5]],
    'ক্ষ': [1, 2, 3, 4, 5], 'জ্ঞ': [1, 5, 6]
  };
  // India (Bharati) differs in a few letters.
  const BN_INDIA = { 'খ': [4, 6], 'ঝ': [3, 5, 6], 'ভ': [4, 5], 'ঢ়': [[5], [1, 2, 4, 5, 6]], 'ৎ': [[4], [2, 3, 4, 5]] };
  const BN_NUKTA = '়', BN_HALANT = '্', BN_DANDA = '।';
  const BN_NUKTA_FORMS = { 'ড': 'ড়', 'ঢ': 'ঢ়', 'য': 'য়' };   // decomposed forms stay decomposed in NFC
  const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  const BN_BLOCK = /[ঀ-৿]/;

  const DEFAULTS = Object.freeze({
    originX: 10, originY: 135,   // start position = first dot (mm)
    width: 160, height: 120,     // print area measured from the start position (mm)
    dotPitch: 4, cellPitch: 9, linePitch: 14,
    clearZ: 5, punchZ: -5, feed: 1000, dwell: 0.2
  });
  const SETTING_KEYS = Object.keys(DEFAULTS);
  const LABELS = {
    originX: 'Start X', originY: 'Start Y', width: 'Print width', height: 'Print height',
    dotPitch: 'Dot pitch', cellPitch: 'Cell pitch', linePitch: 'Line pitch',
    clearZ: 'Clearance Z', punchZ: 'Punch depth Z', feed: 'Plunge feed', dwell: 'Settle dwell'
  };
  // Paper sizes (portrait, width x height in mm), as in the printer dialog.
  const PAPER_SIZES = [
    { id: 'a4', label: 'A4 210 × 297 mm', w: 210, h: 297 },
    { id: 'photo4x6', label: '10 × 15 cm (4 × 6 in)', w: 101.6, h: 152.4 },
    { id: 'photo5x7', label: '13 × 18 cm (5 × 7 in)', w: 127, h: 177.8 },
    { id: 'a6', label: 'A6 105 × 148 mm', w: 105, h: 148 },
    { id: 'a5', label: 'A5 148 × 210 mm', w: 148, h: 210 },
    { id: 'b5', label: 'B5 182 × 257 mm', w: 182, h: 257 },
    { id: 'photo35x5', label: '9 × 13 cm (3.5 × 5 in)', w: 88.9, h: 127 },
    { id: 'photo5x8', label: '13 × 20 cm (5 × 8 in)', w: 127, h: 203.2 },
    { id: 'photo8x10', label: '20 × 25 cm (8 × 10 in)', w: 203.2, h: 254 },
    { id: 'wide169', label: '16:9 wide size (102 × 181 mm)', w: 102, h: 181 },
    { id: 'card100x148', label: '100 × 148 mm', w: 100, h: 148 },
    { id: 'env10', label: 'Envelope #10 4 1/8 × 9 1/2 in', w: 104.8, h: 241.3 },
    { id: 'envdl', label: 'Envelope DL 110 × 220 mm', w: 110, h: 220 },
    { id: 'envc6', label: 'Envelope C6 114 × 162 mm', w: 114, h: 162 },
    { id: 'letter', label: 'Letter 8 1/2 × 11 in', w: 215.9, h: 279.4 },
    { id: 'legal', label: 'Legal 8 1/2 × 14 in', w: 215.9, h: 355.6 },
    { id: 'a3', label: 'A3 297 × 420 mm', w: 297, h: 420 },
    { id: 'a3plus', label: 'A3+ 329 × 483 mm', w: 329, h: 483 },
    { id: 'a2', label: 'A2 420 × 594 mm', w: 420, h: 594 },
    { id: 'b4', label: 'B4 257 × 364 mm', w: 257, h: 364 },
    { id: 'b3', label: 'B3 364 × 515 mm', w: 364, h: 515 },
    { id: 'custom', label: 'User-Defined', w: 0, h: 0 }
  ];

  const MAX_CHARS = 1000000;
  const MAX_PAGES = 10000;
  const PAGE_BREAK = '[[PAGE]]';
  // A page break in the text. Next page writes [[New Page 3]]: the number is the page the break
  // starts (a label only - the app keeps it up to date). [[New Page]], [[PAGE]] (older projects)
  // and a form feed work too; capitals and spaces do not matter.
  const PAGE_MARK = /\[\[[^\S\r\n\f]*(?:new[^\S\r\n\f]*)?page(?:[^\S\r\n\f]*\d+)?[^\S\r\n\f]*\]\]/i;
  const PAGE_SPLIT = new RegExp(PAGE_MARK.source + '|\\f', 'i');
  const PAGE_MARKS = new RegExp(PAGE_MARK.source, 'gi');

  const fmt = n => String(Math.round(n * 1000) / 1000);

  function normalize(text) {
    return String(text == null ? '' : text)
      .normalize('NFC')                     // e.g. Bangla ে + া = ো
      .replace(/\r\n?/g, '\n')
      .replace(/[‐‑]/g, '-')              // hyphens (quotes, dashes and the rest have their own signs)
      .replace(/[\ufb00-\ufb06]/g, c => c.normalize('NFKC'))   // ligatures from PDFs: ﬁ -> fi
      .replace(/…/g, '...')
      .replace(/[­​‌‍⁠﻿]/g, '')
      .replace(/[\t  -   　]/g, ' ');
  }

  function isSupported(ch) {
    const low = ch.toLowerCase();
    return (low >= 'a' && low <= 'z' && !!LETTERS[low]) || !!DIGITS[ch] || !!PUNCT[ch] || ch === ' ' || ch === '\n' || ch === '\f' ||
      !!SYMBOLS[ch] || !!ACCENTS[ch] || low === 'ß' || !!OTHER_LETTERS[low] || !!latinParts(ch) ||
      !!BN_VOWELS[ch] || !!BN_SIGNS[ch] || !!BN_CONSONANTS[ch] || !!BN_DIGITS[ch] || ch === BN_HALANT || ch === BN_NUKTA || ch === BN_DANDA;
  }

  // Cells of a table value: one cell [1, 2] or several [[5], [1, 2, 3, 5]].
  const cellList = v => (Array.isArray(v[0]) ? v : [v]);

  // Bangla text from position i: pushes the cells of one letter (with its halant, nukta or
  // conjunct) and returns the next position.
  function bnCells(chars, i, out, india) {
    const ch = chars[i];
    const look = (v, k) => cellList(v).forEach((dots, n, all) => out.push({ ch: n === all.length - 1 ? k : '', dots, kind: n === all.length - 1 ? 'letter' : 'prefix' }));
    const letter = (k, v) => look(india && BN_INDIA[k] ? BN_INDIA[k] : v, k);
    if (BN_VOWELS[ch]) { letter(ch, BN_VOWELS[ch]); return i + 1; }
    if (BN_SIGNS[ch]) { letter(ch, BN_SIGNS[ch]); return i + 1; }
    if (ch === BN_DANDA) { out.push({ ch, dots: [2, 5, 6], kind: 'punct' }); return i + 1; }
    if (ch === BN_NUKTA) return i + 1;                       // a nukta that forms nothing: no cell
    if (ch === BN_HALANT) { out.push({ ch, dots: [4], kind: 'letter' }); return i + 1; }
    if (!BN_CONSONANTS[ch]) { out.push({ ch, dots: [], kind: 'unknown' }); return i + 1; }
    // one consonant: the ksha / jña conjuncts have their own cells; ড ঢ য with a nukta are ড় ঢ় য়
    let key = ch, j = i + 1;
    if (ch === 'ক' && chars[j] === BN_HALANT && chars[j + 1] === 'ষ') { key = 'ক্ষ'; j += 2; }
    else if (ch === 'জ' && chars[j] === BN_HALANT && chars[j + 1] === 'ঞ') { key = 'জ্ঞ'; j += 2; }
    else if (BN_NUKTA_FORMS[ch] && chars[j] === BN_NUKTA) { key = BN_NUKTA_FORMS[ch]; j += 1; }
    const v = india && BN_INDIA[key] ? BN_INDIA[key] : BN_CONSONANTS[key];
    if (chars[j] === BN_HALANT) {
      // a dead consonant (conjuncts, reph, ya-phala...): the halant sign comes BEFORE the consonant
      out.push({ ch: '', dots: [4], kind: 'prefix', mark: 'halant' });
      look(v, key + BN_HALANT);
      return j + 1;
    }
    look(v, key);
    // a vowel letter right after a consonant: write the inherent a (dot 1), or it reads as a vowel sign
    if (BN_VOWELS[chars[j]]) out.push({ ch: 'অ', dots: [1], kind: 'sign' });
    return j;
  }

  // Braille cells for one word (no spaces inside). opts.bangla: 'bd' (Bangladesh, default) or 'in' (India).
  // ctx (optional): { single: true } while a ‘single quote’ is open (from the words before).
  function cellsFor(word, opts, ctx) {
    const india = !!(opts && opts.bangla === 'in');
    const chars = [...word];
    const out = [];
    let inNumber = false;
    for (let i = 0; i < chars.length;) {
      const ch = chars[i];
      const digit = DIGITS[ch] ? ch : BN_DIGITS[ch];
      if (digit) {
        if (!inNumber) out.push({ ch: '#', dots: NUMBER_SIGN, kind: 'sign' });
        out.push({ ch, dots: DIGITS[digit], kind: 'digit' });
        inNumber = true;
        i++;
        continue;
      }
      if (BN_BLOCK.test(ch) && ch !== BN_DANDA) {
        // Bharati braille: a letter right after a number takes the letter sign
        if (inNumber && ch !== BN_NUKTA) out.push({ ch: 'ltr', dots: LETTER_SIGN, kind: 'sign' });
        inNumber = false;
        i = bnCells(chars, i, out, india);
        continue;
      }
      // UEB: a decimal point or comma keeps the number going (3.14, 1,000)
      if (inNumber && (ch === '.' || ch === ',')) {
        out.push({ ch, dots: PUNCT[ch], kind: 'punct', name: PUNCT_NAMES[ch] });
        i++;
        continue;
      }
      const low = ch.toLowerCase();
      const other = OTHER_LETTERS[low];
      const parts = low.length === 1 && low >= 'a' && low <= 'z' && LETTERS[low] ? { base: low, pre: [], name: '' }
        : low === 'ß' ? { base: '', pre: [SHARP_S[0]], last: SHARP_S[1], name: 'sharp s' }
          : other ? { base: '', pre: other.cells.slice(0, -1), last: other.cells[other.cells.length - 1], name: other.name } : latinParts(ch);
      if (parts) {
        let j = i + 1;
        while (ACCENTS[chars[j]]) {   // letter + separate accent
          parts.pre = parts.pre.concat(cellsOf(ACCENTS[chars[j]][0]));
          parts.name = (parts.name || parts.base) + ' ' + ACCENTS[chars[j]][1];
          j++;
        }
        // a letter that starts with an a-j cell, straight after digits, would read as digits: add the letter
        // sign (1a, 2æ; an accent sign first ends the number: 1é)
        const first = parts.pre.length ? parts.pre[0] : parts.last || LETTERS[parts.base];
        if (inNumber && DIGIT_SHAPES.has(first.join(''))) out.push({ ch: 'ltr', dots: LETTER_SIGN, kind: 'sign' });
        inNumber = false;
        const up = chars.slice(i, j).join('').normalize('NFC').toUpperCase();
        const label = [...up].length === 1 ? up : chars.slice(i, j).join('');
        const name = parts.name || undefined;
        for (const dots of parts.pre) out.push({ ch: '', dots, kind: 'prefix', of: label, name });
        out.push({ ch: label, dots: parts.last || LETTERS[parts.base], kind: 'letter', name });
        i = j;
        continue;
      }
      inNumber = false;
      const cells = signCells(chars, i, ctx);
      if (!cells) out.push({ ch, dots: [], kind: 'unknown' });
      else {
        if (cells.g1) out.push({ ch: 'g1', dots: LETTER_SIGN, kind: 'sign' });
        cells.list.forEach((dots, n) => out.push(n === cells.list.length - 1
          ? { ch, dots, kind: 'punct', name: cells.name }
          : { ch: '', dots, kind: 'prefix', of: ch, name: cells.name }));
        inNumber = cells.num;   // ½ ² ...: a number comes out of it
      }
      i++;
    }
    return out;
  }

  // The cells of a sign at chars[i] (not a letter or digit), looking at its neighbours in the word
  // like UEB does: { list, name, g1: grade 1 sign first, num }, or null if it has no braille.
  const WORDISH = /[\p{L}\p{N}\p{M}]/u, LETTERISH = /\p{L}/u, LATIN = /\p{Script=Latin}/u;
  function signCells(chars, i, ctx) {
    const ch = chars[i], prev = chars[i - 1], next = chars[i + 1];
    const textBefore = () => chars.slice(0, i).some(c => WORDISH.test(c));
    const textAfter = () => chars.slice(i + 1).some(c => WORDISH.test(c));
    const between = re => prev != null && next != null && re.test(prev) && re.test(next);
    if (ch === '"') {   // straight quotes: opening before a word, closing after it
      const b = textBefore(), a = textAfter();
      if (b !== a) return { list: [b ? [3, 5, 6] : [2, 3, 6]], name: b ? 'closing quote' : 'opening quote' };
    }
    // ’ ´ ` inside a word are apostrophes (it’s). ’ after a word closes an open ‘quote’, otherwise it
    // is an apostrophe too (the students’ books).
    if ((ch === '’' || ch === '´' || ch === '`') && between(LETTERISH)) return { list: [[3]], name: 'apostrophe' };
    if (ch === '’' && !singleOpen(chars, i, ctx)) return { list: [[3]], name: 'apostrophe' };
    // ? takes the grade 1 sign unless it ends a word (it could be read as an opening quote)
    if (ch === '?') return { list: [PUNCT[ch]], name: PUNCT_NAMES[ch], g1: !(textBefore() && !textAfter()) };
    // , ; : ! between letters take the grade 1 sign (a,b)
    if ((ch === ',' || ch === ';' || ch === ':' || ch === '!') && between(LATIN)) return { list: [PUNCT[ch]], name: PUNCT_NAMES[ch], g1: true };
    if (PUNCT[ch]) return { list: [PUNCT[ch]], name: PUNCT_NAMES[ch] };
    if (ch === BN_DANDA) return { list: [[2, 5, 6]], name: 'danda' };
    const sym = SYMBOLS[ch];
    return sym ? { list: sym.cells, name: sym.name, num: sym.num } : null;
  }
  const OPEN_SINGLE = '‘‚‛';
  // Is a ‘single quote’ open at chars[i]? (from the words before, then this word up to i)
  function singleOpen(chars, i, ctx) {
    let open = !!(ctx && ctx.single);
    for (let k = 0; k < i; k++) {
      if (OPEN_SINGLE.includes(chars[k])) open = true;
      else if (chars[k] === '’' && !(k > 0 && k < chars.length - 1 && LETTERISH.test(chars[k - 1]) && LETTERISH.test(chars[k + 1]))) open = false;
    }
    return open;
  }
  // The quote state after these cells.
  function afterQuotes(cells, state) {
    let single = state.single;
    for (const c of cells) {
      if (c.kind === 'punct' && OPEN_SINGLE.includes(c.ch)) single = true;
      else if (c.name === 'closing single quote') single = false;
    }
    return { single };
  }

  function readSettings(s) {
    const out = {};
    for (const key of SETTING_KEYS) {
      const v = typeof s[key] === 'string' ? Number.parseFloat(s[key]) : s[key];
      if (!Number.isFinite(v)) throw new Error('Enter a number for ' + LABELS[key] + '.');
      out[key] = v;
    }
    return out;
  }

  // Checks that do not depend on the print area or the braille size.
  function validate(s) {
    if (s.dotPitch <= 0) throw new Error('Dot pitch must be more than 0.');
    if (s.cellPitch <= s.dotPitch) throw new Error('Cell pitch must be larger than dot pitch, or cells overlap.');
    if (s.linePitch <= 2 * s.dotPitch) throw new Error('Line pitch must be larger than 2 x dot pitch, or lines overlap.');
    if (s.clearZ <= s.punchZ) throw new Error('Clearance Z must be higher than punch depth Z.');
    if (s.feed <= 0) throw new Error('Plunge feed must be more than 0.');
    if (s.dwell < 0) throw new Error('Settle dwell cannot be negative.');
    return s;
  }

  // Validates settings and returns how many cells per line and lines per page fit.
  function geometry(input) {
    const s = validate(readSettings(input));
    if (s.width <= 0 || s.height <= 0) throw new Error('Print width and height must be more than 0.');
    const cols = Math.floor((s.width - s.dotPitch) / s.cellPitch + 1 + 1e-9);
    const rows = Math.floor((s.height - 2 * s.dotPitch) / s.linePitch + 1 + 1e-9);
    if (cols < 2) throw new Error('Print width must fit at least 2 braille cells.');
    if (rows < 1) throw new Error('Print height must fit at least 1 braille line.');
    if (cols * rows > 100000) throw new Error('Print area is too large. Check that values are in millimetres.');
    return { cols, rows, settings: s };
  }

  // Dots are drawn as circles of 0.3 x the dot pitch (1.2 mm radius at the default 4 mm pitch).
  // With a paper size every dot stays EDGE_GAP mm inside the margin line, measured to its edge.
  const DOT_RADIUS = 0.3;
  const EDGE_GAP = 2;
  const dotRadius = s => DOT_RADIUS * (typeof s === 'number' ? s : Number.parseFloat(s.dotPitch));

  // Start position and print area for a sheet of paper.
  // X/Y zero sits on the paper's front-left corner (bottom-left of the page, top edge toward the
  // back of the machine). Margins on all sides; the dots start EDGE_GAP mm inside the margin line,
  // and the text block is centred left-right, so an inverted print is an exact left-right flip.
  function paperArea(paper, input) {
    const num = k => {
      const v = typeof input[k] === 'string' ? Number.parseFloat(input[k]) : input[k];
      if (!Number.isFinite(v) || v <= 0) throw new Error('Enter a number for ' + LABELS[k] + '.');
      return v;
    };
    const dotPitch = num('dotPitch'), cellPitch = num('cellPitch'), linePitch = num('linePitch');
    let w = Number(paper && paper.w), h = Number(paper && paper.h);
    if (!(w > 0) || !(h > 0)) throw new Error('Enter the paper width and height.');
    if (paper.orientation === 'landscape' ? w < h : w > h) { const t = w; w = h; h = t; }
    const m = Number(paper.margin);
    if (!Number.isFinite(m) || m < 0) throw new Error('Enter a paper margin of 0 or more.');
    const inset = EDGE_GAP + dotRadius(dotPitch);   // dot centres stay this far inside the margin line
    const uw = w - 2 * m - 2 * inset, uh = h - 2 * m - 2 * inset;
    if (uw < dotPitch + cellPitch || uh < 2 * dotPitch) throw new Error('The margin is too big for this paper.');
    const cols = Math.floor((uw - dotPitch) / cellPitch + 1 + 1e-9);
    const rows = Math.floor((uh - 2 * dotPitch) / linePitch + 1 + 1e-9);
    const span = (cols - 1) * cellPitch + dotPitch;
    const r = n => Math.round(n * 1000) / 1000;
    return {
      paperW: w, paperH: h, originX: r(m + inset + (uw - span) / 2), originY: r(h - m - inset), width: r(span), height: r(uh), cols, rows,
      sheet: { minX: m, maxX: w - m, minY: m, maxY: h - m }   // where dots may go: the paper inside its margins
    };
  }

  // How many dots would reach outside the sheet area (they must never be punched).
  // `pad` is the dot radius: the whole dot, not only its centre, must be inside the margin line.
  function offSheet(pts, sheet, pad = 0) {
    const e = 0.002;   // positions are rounded to 0.001 mm
    let n = 0;
    for (const p of pts) if (p.x - pad < sheet.minX - e || p.x + pad > sheet.maxX + e || p.y - pad < sheet.minY - e || p.y + pad > sheet.maxY + e) n++;
    return n;
  }

  // Wraps normalized text into lines of `cols` cells and pages of `rows` lines.
  // With rows = Infinity, pages only end at page breaks.
  // `breaks` (optional) gets, for each page break in order, the index of the page it starts.
  function wrapText(norm, cols, rows, unsupported, opts, breaks) {
    const pages = [];
    let page = [];
    const addLine = line => {
      if (page.length === rows) { pages.push(page); page = []; }
      page.push(line);
      if (pages.length > MAX_PAGES) throw new Error('More than 10,000 braille pages. Split the document.');
    };
    const sections = norm.split(PAGE_SPLIT);
    let quotes = { single: false };   // a ‘single quote’ open from the words before
    sections.forEach((section, si) => {
      if (si) {
        if (page.length) pages.push(page);
        else if (!pages.length) pages.push([]);
        page = [];
        if (breaks) breaks.push(pages.length);
      }
      section.replace(/^\n|\n$/g, '').split('\n').forEach(raw => {
        let line = [];
        for (const word of raw.trim().split(/ +/).filter(Boolean)) {
          if (unsupported) for (const ch of word) if (!isSupported(ch)) unsupported.set(ch, (unsupported.get(ch) || 0) + 1);
          const token = cellsFor(word, opts, quotes);
          if (token.length <= cols) {
            if (line.length && line.length + 1 + token.length > cols) { addLine(line); line = []; }
            if (line.length) line.push({ ch: ' ', dots: [], kind: 'space' });
            line.push(...token);
          } else {
            // Word longer than a line: split it, re-encoding each part so digit runs keep a number sign.
            if (line.length) { addLine(line); line = []; }
            let part = '', q = quotes;
            for (const ch of word) {
              if (part && cellsFor(part + ch, opts, q).length > cols) {
                const cells = cellsFor(part, opts, q);
                addLine(cells);
                q = afterQuotes(cells, q);
                part = '';
              }
              part += ch;
            }
            line = cellsFor(part, opts, q);
          }
          quotes = afterQuotes(token, quotes);
        }
        addLine(line);
      });
    });
    if (page.length) pages.push(page);
    // A trailing page break should not produce an empty sheet.
    while (pages.length && pages[pages.length - 1].every(l => l.every(c => !c.dots.length))) pages.pop();
    return pages;
  }

  // Wraps text into lines of cells and lines into pages.
  function layout(text, input, opts) {
    const g = geometry(input);
    const norm = normalize(text);
    if (norm.length > MAX_CHARS) throw new Error('Use at most 1,000,000 characters. Split larger documents.');
    const unsupported = new Map();
    const breaks = [];
    const pages = wrapText(norm, g.cols, g.rows, unsupported, opts, breaks);

    let letters = 0, dots = 0, lines = 0;
    for (const p of pages) {
      lines += p.length;
      for (const l of p) for (const c of l) {
        if (c.kind === 'letter' || c.kind === 'digit' || c.kind === 'punct') letters++;
        dots += c.dots.length;
      }
    }
    return {
      pages, cols: g.cols, rows: g.rows, settings: g.settings,
      breaks,   // for each page break in the text: the index of the page it starts
      unsupported: [...unsupported.entries()].map(([ch, count]) => ({ ch, count })),
      stats: { letters, dots, lines, pages: pages.length }
    };
  }

  // Page scaling, like a print dialog: the braille size in percent of the dot, cell and line pitch.
  const SCALE_MIN = 50, SCALE_MAX = 200;
  const STANDARD_DOT = 2.5;   // dot spacing of standard braille (mm)

  function scalePitches(input, pct) {
    const f = pct / 100;
    const r = n => Math.round(n * 1000) / 1000;
    const v = k => (typeof input[k] === 'string' ? Number.parseFloat(input[k]) : input[k]) * f;
    return Object.assign({}, input, { dotPitch: r(v('dotPitch')), cellPitch: r(v('cellPitch')), linePitch: r(v('linePitch')) });
  }

  // Settings for a sheet of paper at a braille size: start position and print area come from the paper.
  function pageSettings(paper, input, pct) {
    const s = scalePitches(input, pct == null ? 100 : pct);
    const a = paperArea(paper, s);
    return Object.assign(s, { originX: a.originX, originY: a.originY, width: a.width, height: a.height });
  }

  // Braille size for "Fit to printer margins" (grow or shrink) and "Reduce to printer margins"
  // (shrink only): the largest whole percent at which every page of the text fits on one sheet
  // (pages end only at page breaks). Never below SCALE_MIN; `fits` is false if even that is too big.
  function fitScale(text, input, paper, mode, opts) {
    validate(readSettings(input));
    const norm = normalize(text);
    if (norm.length > MAX_CHARS) throw new Error('Use at most 1,000,000 characters. Split larger documents.');
    const hi = mode === 'reduce' ? 100 : SCALE_MAX;
    if (!/\S/.test(norm.replace(PAGE_MARKS, ''))) return { pct: 100, fits: true };   // nothing to fit
    // Quick check first: every non-space character needs a cell, and a sheet has cols x rows cells.
    // (a Bangla nukta needs no cell and ক্ষ / জ্ঞ are one cell for three characters, so those count less)
    const lowerBound = sec => { const t = sec.replace(/\s+/g, ''); return t.length - (t.split(BN_NUKTA).length - 1) - 2 * (t.split(BN_HALANT).length - 1); };
    const mostChars = norm.split(PAGE_SPLIT).reduce((m, sec) => Math.max(m, lowerBound(sec)), 0);
    const longest = new Map();   // cells per line -> lines on the longest page
    const fits = pct => {
      let g;
      try { g = geometry(pageSettings(paper, input, pct)); } catch (_) { return false; }
      if (mostChars > g.cols * g.rows) return false;
      if (!longest.has(g.cols)) longest.set(g.cols, wrapText(norm, g.cols, Infinity, null, opts).reduce((m, p) => Math.max(m, p.length), 0));
      return longest.get(g.cols) <= g.rows;
    };
    if (fits(hi)) return { pct: hi, fits: true };
    if (!fits(SCALE_MIN)) return { pct: SCALE_MIN, fits: false };
    let lo = SCALE_MIN, top = hi;   // fits(lo) is true, fits(top) is false
    while (top - lo > 1) {
      const mid = Math.floor((lo + top) / 2);
      if (fits(mid)) lo = mid; else top = mid;
    }
    return { pct: lo, fits: true };
  }

  // Dot centres for one page, in punching order.
  function points(page, s) {
    const out = [];
    page.forEach((line, r) => line.forEach((cell, c) => cell.dots.forEach(d => out.push({
      x: s.originX + c * s.cellPitch + (d > 3 ? s.dotPitch : 0),
      y: s.originY - r * s.linePitch - ((d - 1) % 3) * s.dotPitch,
      line: r, col: c, dot: d, ch: cell.ch, what: cellWhat(cell)
    }))));
    return out;
  }

  // Invert print: the sheet is punched from the top and read from the back, so the
  // whole page is flipped left-right. Cells swap sides across the full print width
  // and the dot columns swap inside each cell (1<->4, 2<->5, 3<->6).
  // "HELLO" is punched as O L L E H, each cell mirrored.
  const MIRROR_DOT = { 1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3 };
  const BLANK = Object.freeze({ ch: ' ', dots: Object.freeze([]), kind: 'space' });

  function mirrorPage(page, cols) {
    return page.map(line => {
      if (!line.length) return [];
      const out = new Array(cols).fill(BLANK);
      line.forEach((cell, c) => {
        out[cols - 1 - c] = Object.assign({}, cell, { dots: cell.dots.map(d => MIRROR_DOT[d]).sort((a, b) => a - b), srcCol: c });
      });
      return out;
    });
  }

  // The page as the machine punches it.
  function machinePage(page, input, opts) {
    if (!(opts && opts.invert)) return page;
    return mirrorPage(page, geometry(input).cols);
  }

  // Dot centres in punching order for the machine (mirrored when inverting).
  function pagePoints(page, input, opts) {
    return points(machinePage(page, input, opts), readSettings(input));
  }

  // Reading-side identity of a punched dot: "line:cell:dot" on the page as it is read.
  function readingKey(p, cols, invert) {
    return invert ? p.line + ':' + (cols - 1 - p.col) + ':' + MIRROR_DOT[p.dot] : p.line + ':' + p.col + ':' + p.dot;
  }

  function bounds(pts) {
    if (!pts.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }

  // What a cell is, for people: “@” (at sign), number sign, first cell of “É” ...
  function cellWhat(cell) {
    if (cell.kind === 'sign') return cell.ch === '#' ? 'number sign' : cell.ch === 'ltr' ? 'letter sign' : cell.ch === 'g1' ? 'grade 1 sign (the next sign is read as written)' : 'অ (inherent vowel, written before a vowel letter)';
    if (cell.kind === 'prefix') return cell.mark === 'halant' ? 'halant (্)' : cell.of ? 'first cell of ' + (cell.name ? `${cell.of} (${cell.name})` : `“${cell.of}”`) : 'first cell of the next letter';
    if (cell.kind === 'unknown') return `“${cell.ch}” is not in the braille table`;
    return cell.name ? `${cell.ch} (${cell.name})` : `“${cell.ch}”`;
  }

  function lineText(line) {
    return line.filter(c => c.kind !== 'sign').map(c => c.ch).join('');
  }

  function pageText(page) {
    return page.map(lineText).join('\n');
  }

  // G-code comments are plain ASCII: Bangla is written in Latin letters there (ISO 15919-like).
  const BN_ROMAN_V = { 'অ': 'a', 'আ': 'aa', 'ই': 'i', 'ঈ': 'ii', 'উ': 'u', 'ঊ': 'uu', 'ঋ': 'ri', 'ঌ': 'li', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou', 'ৠ': 'rii', 'ৡ': 'lii' };
  const BN_ROMAN_S = { 'া': 'aa', 'ি': 'i', 'ী': 'ii', 'ু': 'u', 'ূ': 'uu', 'ৃ': 'ri', 'ৄ': 'rii', 'ৢ': 'li', 'ৣ': 'lii', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou' };
  const BN_ROMAN_MARK = { 'ং': 'ng', 'ঃ': 'h', 'ঁ': '~', 'ঽ': "'", '।': '.' };
  const BN_ROMAN_C = {
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng', 'চ': 'c', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'ny',
    'ট': 'T', 'ঠ': 'Th', 'ড': 'D', 'ঢ': 'Dh', 'ণ': 'N', 'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm', 'য': 'y', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'Sh', 'স': 's', 'হ': 'h',
    'ড়': 'R', 'ঢ়': 'Rh', 'য়': 'y'
  };
  function romanize(text) {
    const chars = [...String(text)];
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      let ch = chars[i];
      if (BN_NUKTA_FORMS[ch] && chars[i + 1] === BN_NUKTA) { ch = BN_NUKTA_FORMS[ch]; i++; }
      if (BN_ROMAN_C[ch]) {
        out += BN_ROMAN_C[ch];
        const next = chars[i + 1];
        if (next === BN_HALANT) i++;                       // dead consonant: no vowel
        else if (BN_ROMAN_S[next]) { out += BN_ROMAN_S[next]; i++; }
        else out += 'a';                                   // inherent vowel
      } else if (ch === 'ৎ') out += 't';
      else if (BN_ROMAN_V[ch]) out += BN_ROMAN_V[ch];
      else if (BN_ROMAN_S[ch]) out += BN_ROMAN_S[ch];
      else if (BN_ROMAN_MARK[ch]) out += BN_ROMAN_MARK[ch];
      else if (BN_DIGITS[ch]) out += BN_DIGITS[ch];
      else if (ch === BN_HALANT || ch === BN_NUKTA) { /* nothing */ }
      else out += ch;
    }
    return out;
  }
  // (quotes, dashes and a few signs as their ASCII look-alikes, accents dropped, anything else '?')
  const ASCII_LIKE = { '“': '"', '”': '"', '„': '"', '‟': '"', '«': '"', '»': '"', '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '″': '"',
    '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-', '×': 'x', '÷': '/', '•': '*', '·': '.', '…': '...', 'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
    '½': '1/2', '¼': '1/4', '¾': '3/4', '²': '^2', '³': '^3', '°': 'deg', '±': '+/-', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '→': '->', '←': '<-',
    '€': 'EUR', '£': 'GBP', '¥': 'JPY', '¢': 'c', '©': '(C)', '®': '(R)', '™': '(TM)', '¡': '!', '¿': '?' };
  const asciiComment = t => romanize(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, c => ASCII_LIKE[c] || '?');
  // A sign's name for the G-code notes: COMMA (,) / EURO
  const noteName = (ch, name) => (name ? name.toUpperCase() + (/^[\x21-\x7e]$/.test(ch) ? ` (${ch})` : '') : romanize(ch).toUpperCase());

  // Builds one page as program entries. Entries with `code` are sent to the machine;
  // `dot`/`phase` let the live view know which dot a line belongs to.
  function program(page, input, pageIndex, pageCount, opts) {
    const s = readSettings(input);
    pageIndex = pageIndex || 0;
    pageCount = pageCount || 1;
    const invert = !!(opts && opts.invert);
    const cols = geometry(s).cols;
    const reading = page;
    page = invert ? mirrorPage(reading, cols) : reading;
    const pts = points(page, s);
    const E = [];
    const code = (c, dot, phase) => E.push({ code: c, dot: dot == null ? -1 : dot, phase: phase || '' });
    const note = t => E.push({ comment: asciiComment(t) });
    const blank = () => E.push({ blank: true });
    const firstText = (reading.map(lineText).find(t => t.trim()) || '').trim();
    const summary = firstText.length > 60 ? firstText.slice(0, 57) + '...' : firstText;

    code('%'); code('G21'); code('G90'); code('G94'); blank();
    note('=====================================');
    note('DOTSENSE BRAILLE PRINT - PAGE ' + (pageIndex + 1) + ' OF ' + pageCount);
    note('TEXT: ' + romanize(summary).toUpperCase());
    if (invert) note('INVERT PRINT: MIRRORED - PUNCH FROM THE TOP, READ FROM THE BACK');
    note('3018 CNC - Z STEPPER');
    note('Spindle OFF');
    note('Clearance = Z' + fmt(s.clearZ) + 'mm');
    note('Punch Depth = Z' + fmt(s.punchZ) + 'mm');
    note('Z DOWN SPEED = ' + fmt(s.feed) + ' mm/min');
    note('Dots = ' + pts.length);
    note('=====================================');
    blank();
    code('M5'); blank();
    code('G0 Z' + fmt(s.clearZ));
    code('G0 X' + fmt(s.originX) + ' Y' + fmt(s.originY));

    let k = 0;
    page.forEach((line, r) => {
      if (!line.some(c => c.dots.length)) return;
      blank(); note('----- LINE ' + (r + 1) + ' -----');
      for (const cell of line) {
        if (cell.kind === 'unknown') {
          blank(); note('===== ' + cell.ch.toUpperCase() + ' =====');
          note("(no braille mapping for '" + cell.ch + "', skipped)");
          continue;
        }
        if (!cell.dots.length) continue;
        const label = cell.kind === 'sign'
          ? (cell.ch === '#' ? '# (number sign)' : cell.ch === 'ltr' ? 'letter sign' : cell.ch === 'g1' ? 'grade 1 sign' : 'A (inherent vowel)')
          : cell.kind === 'prefix' ? (cell.mark === 'halant' ? 'HALANT' : cell.of ? 'PREFIX OF ' + noteName(cell.of, cell.name) : 'PREFIX')
            : noteName(cell.ch, cell.name);
        blank(); note('===== ' + label + ' =====');
        for (let i = 0; i < cell.dots.length; i++) {
          const p = pts[k];
          code('G0 X' + fmt(p.x) + ' Y' + fmt(p.y), k, 'move');
          code('G1 Z' + fmt(s.punchZ) + ' F' + fmt(s.feed), k, 'plunge');
          code('G0 Z' + fmt(s.clearZ), k, 'retract');
          if (s.dwell > 0) code('G4 P' + fmt(s.dwell), k, 'dwell');
          blank();
          k++;
        }
      }
    });
    note('===== END =====');
    code('G0 Z' + fmt(s.clearZ));
    code('G0 X0 Y0');
    blank();
    code('M5'); code('M30'); code('%');
    return { entries: E, points: pts, settings: s, invert, cols };
  }

  function gcode(page, input, pageIndex, pageCount, opts) {
    return program(page, input, pageIndex, pageCount, opts).entries
      .map(e => e.code != null ? e.code : e.comment != null ? '; ' + e.comment : '')
      .join('\n');
  }

  // Lines for streaming to the machine: comments, blanks and '%' removed.
  // `keys` tells, for each punched dot, which dot of the reading-side page it is.
  function jobLines(page, input, pageIndex, pageCount, opts) {
    const p = program(page, input, pageIndex, pageCount, opts);
    return {
      lines: p.entries.filter(e => e.code != null && e.code !== '%').map(e => ({ code: e.code, dot: e.dot, phase: e.phase })),
      points: p.points,
      keys: p.points.map(pt => readingKey(pt, p.cols, p.invert)),
      settings: p.settings,
      invert: p.invert
    };
  }

  // Trapezoid move time (s) for distance d (mm), speed v (mm/min), acceleration a (mm/s^2).
  function moveTime(d, v, a) {
    if (d <= 0) return 0;
    const vs = v / 60;
    if (!(a > 0)) return d / vs;
    const dAccel = vs * vs / a;
    return d < dAccel ? 2 * Math.sqrt(d / a) : d / vs + vs / a;
  }

  // Rough print time in seconds. Machine values come from GRBL $110-$112 / $120-$122 when connected.
  function estimate(pts, input, machine) {
    const s = readSettings(input);
    const m = Object.assign({ rateXY: 1000, rateZ: 500, accelXY: 50, accelZ: 50 }, machine || {});
    const z = Math.abs(s.clearZ - s.punchZ);
    const plunge = moveTime(z, Math.min(s.feed, m.rateZ), m.accelZ);
    const retract = moveTime(z, m.rateZ, m.accelZ);
    let t = 0, x = s.originX, y = s.originY;
    for (const p of pts) {
      t += moveTime(Math.hypot(p.x - x, p.y - y), m.rateXY, m.accelXY) + plunge + retract + s.dwell;
      x = p.x; y = p.y;
    }
    t += moveTime(Math.hypot(x, y), m.rateXY, m.accelXY);
    return t;
  }

  // Camera photos are often stored sideways with a note (EXIF Orientation 1-8) saying how to turn
  // them for viewing. OCR ignores that note, so the app turns such photos upright first.
  // Returns the orientation from the start of a JPEG file (1 = upright or unknown).
  function jpegOrientation(b) {
    if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return 1;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }                    // fill byte
      if (marker === 0xd9 || marker === 0xda) return 1;           // image data starts: no EXIF
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return 1;
      const end = Math.min(b.length, i + 2 + len);
      if (marker === 0xe1 && len >= 16 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66 && b[i + 8] === 0 && b[i + 9] === 0) {
        const t = i + 10;                                         // TIFF header: II (little) or MM (big endian)
        const le = b[t] === 0x49 && b[t + 1] === 0x49;
        if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return 1;
        const u16 = o => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
        const u32 = o => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
        const ifd = t + u32(t + 4);
        if (ifd + 2 > end) return 1;
        const n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          if (e + 12 > end) break;
          if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
        }
        return 1;
      }
      i += 2 + len;
    }
    return 1;
  }

  const api = {
    jpegOrientation, DOT_RADIUS, EDGE_GAP, dotRadius,
    DEFAULTS, SETTING_KEYS, LABELS, PAGE_BREAK, PAGE_MARK, MAX_CHARS, PAPER_SIZES, paperArea,
    SCALE_MIN, SCALE_MAX, STANDARD_DOT, scalePitches, pageSettings, fitScale, offSheet,
    LETTERS, DIGITS, PUNCT, NUMBER_SIGN, LETTER_SIGN,
    MIRROR_DOT, normalize, isSupported, cellsFor, romanize, geometry, layout, points, bounds,
    mirrorPage, machinePage, pagePoints, readingKey,
    lineText, pageText, cellWhat, SYMBOLS, program, gcode, jobLines, estimate, moveTime, fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DotSense = api;
})(typeof window !== 'undefined' ? window : globalThis);
