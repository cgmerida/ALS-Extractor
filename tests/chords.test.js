// ChordConverter.html: chords-over-lyrics -> MultiTracks [bracketed] chords.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'ChordConverter.html'), 'utf8');
const mod = { exports: {} };
new Function('module', html.match(/<script id="core">([\s\S]*?)<\/script>/)[1])(mod);
const Chords = mod.exports;
const convert = (s) => Chords.convert(s).text;

test('UI scripts are syntactically valid', () => {
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
});

test('chords are inserted at the column they sit above', () => {
  assert.strictEqual(convert('  B           F#\n   Cristo te alabaré'), '[B] Cristo te a[F#]labaré');
  assert.strictEqual(convert('B                     E\n Vi caer al enemigo'), '[B] Vi caer al enemigo [E]');
  assert.strictEqual(convert('E\nNadie como Tú'), '[E]Nadie como Tú');
});

test('a chord over a space is not glued to the previous word', () => {
  assert.strictEqual(convert('B     F#      G#m   E\nGlo - rio - so       te cantamos'),
    '[B]Glo - [F#]rio - so [G#m] [E] te cantamos');
});

test('chord vocabulary', () => {
  for (const c of ['B', 'F#', 'G#m', 'E/B', 'E/G#', 'B/F#', 'C#m', 'A2', 'Bbmaj7', 'Dm7b5', 'Cmaj7#11', 'Asus4',
    'Dsus2/F#', 'C6/9', 'Cadd9', 'Gsus', 'F#m7', 'E5', 'Bdim', 'Caug']) assert(Chords.isChord(c), c);
  for (const w of ['Tú', 'Glo', 'Ama', 'Dios', 'X2', 'Be', '[B]']) assert(!Chords.isChord(w), w);
});

test('section headers: plain, numbered, with repeats, bracketed', () => {
  for (const h of ['INTRO X2', 'VERSO 1', 'PUENTE 1 X2', 'CORO', 'Pre-Estribillo', 'Verse 2:', 'Primera Parte', 'Outro (x4)'])
    assert.strictEqual(Chords.classify(h).type, 'header', h);
  assert.deepStrictEqual(Chords.classify('[Estribillo]'), { type: 'header', text: 'Estribillo' });
  // Lyrics that start with a section word stay lyrics, so the chord line above still merges.
  assert.strictEqual(convert('G   C\nCoronado de gloria'), '[G]Coro[C]nado de gloria');
  assert.strictEqual(convert('G\nFinal de los tiempos'), '[G]Final de los tiempos');
});

test('header and chords on one line', () => {
  assert.strictEqual(convert('[Salida] E  G#  E  D#'), 'Salida\n[E] [G#] [E] [D#]');
  assert.strictEqual(convert('Intro: B E/B'), 'Intro:\n[B] [E/B]');
  assert.strictEqual(convert('Tono:  B'), 'Tono: B'.replace(' ', '  ')); // a key line is not a section
});

test('decorations on chord lines', () => {
  assert.strictEqual(convert('( E  G#m  E  B  F# )'), '( [E] [G#m] [E] [B] [F#] )');
  assert.strictEqual(convert('| B | E | x2'), '| [B] | [E] | x2');
  assert.strictEqual(convert('(E G#m)'), '([E] [G#m])');
});

test('an untitled section copies all of its text', () => {
  assert.deepStrictEqual(Chords.convert('B E\nhola').sections, [{ text: '[B]ho[E]la', titled: false, body: '[B]ho[E]la' }]);
});

test('sections: a lone header joins the next block unless that block has its own header', () => {
  const r = Chords.convert('[Estribillo]\n\nB\n Glo\n\nCORO\n\nTURNAROUND X2\nB G#m E');
  assert.deepStrictEqual(r.sections, [
    { text: 'Estribillo\n[B] Glo', titled: true, body: '[B] Glo' },
    { text: 'CORO', titled: true, body: '' },
    { text: 'TURNAROUND X2\n[B] [G#m] [E]', titled: true, body: '[B] [G#m] [E]' },
  ]);
});

test('CRLF, tabs, nbsp and decomposed accents', () => {
  assert.strictEqual(convert('INTRO\r\nB E\r\n'), 'INTRO\n[B] [E]');
  assert.strictEqual(convert('B  E\nabcde'), '[B]abc[E]de');
  // "é" as e + combining accent would shift every column after it.
  assert.strictEqual(convert('      E\nalabé tu'), 'alabé [E]tu');
});

test('a chord line with one unknown token is flagged and left as text', () => {
  const r = Chords.convert('B  E  Hm7  G#m');
  assert.strictEqual(r.text, 'B  E  Hm7  G#m');
  assert.deepStrictEqual(r.notices, [{ line: 1, text: 'B  E  Hm7  G#m' }]);
  assert.deepStrictEqual(Chords.convert('A mi Dios').notices, []);
});

// ---------- Code review fixes ----------

test('a chord line is never merged into a near-chord line below it, and that line is still flagged', () => {
  const r = Chords.convert('B   E\nB Hm7 G#m\nHola mundo');
  assert.strictEqual(r.text, '[B] [E]\nB Hm7 G#m\nHola mundo');
  assert.deepStrictEqual(r.notices, [{ line: 2, text: 'B Hm7 G#m' }]);
});

test('headers with a note in parentheses or after a dash', () => {
  for (const h of ['CORO (Final)', 'Verso 1 - Tono B', 'Puente (suave)', 'Outro x4 (fade)'])
    assert.strictEqual(Chords.classify(h).type, 'header', h);
  assert.deepStrictEqual(Chords.convert('CORO (Final)\n\nB E\nhola').sections, [{ text: 'CORO (Final)\n[B]ho[E]la', titled: true, body: '[B]ho[E]la' }]);
  // A lyric that merely starts with a section word is still a lyric.
  assert.strictEqual(Chords.classify('Coro de ángeles (x2)').type, 'text');
});

test('tabs expand to 8-column stops, like the textarea shows them', () => {
  assert.strictEqual(convert('\tE\nabcdefghij'), 'abcdefgh[E]ij');
  assert.strictEqual(convert('B\tE\nabcdefghij'), '[B]abcdefgh[E]ij');
  assert.strictEqual(convert('B  \tE\nabcdefghij'), '[B]abcdefgh[E]ij');
});

test('a chord after a parenthesis or bar line goes at the chord letter', () => {
  assert.strictEqual(convert('(E   G#m)\nHola mundo amigo'), 'H[E]ola [G#m]mundo amigo');
  assert.strictEqual(convert('|B  E|'), '|[B] [E]|');
});

// Emoji take two columns in a monospace font, so E (column 6) sits above the "o".
test('emoji count as two columns, like they display', () => {
  assert.strictEqual(convert('B     E\n😀😀 hola'), '[B]😀😀 h[E]ola');
});

test('only real chord numbers', () => {
  for (const w of ['C1234', 'C8', 'Cadd3', 'C#3']) assert(!Chords.isChord(w), w);
  for (const c of ['C7b9', 'C7#9', 'Cno3', 'Cadd11', 'G13', 'Bb7sus4', 'Asus2']) assert(Chords.isChord(c), c);
});

// Known limits, pinned so a change in behavior is deliberate.
test('known limits', () => {
  // Decorations are dropped when merged into a lyric ("x2" would otherwise become lyric text).
  assert.strictEqual(convert('B  E  x2\nHola mundo amigo'), '[B]Hol[E]a mundo amigo');
  // A one-word lyric that is a section name reads as a header.
  assert.strictEqual(convert('G\nFinal'), '[G]\nFinal');
});

test('at: each input line maps to the output section and line it became', () => {
  const r = Chords.convert('CORO (Final)\n\nB E\nhola\nB Hm7 G#m\n\nOUTRO\nB E');
  assert.deepStrictEqual(Array.from(r.at.slice(1)), [
    { section: 0, line: 0 },  // CORO (Final)
    { section: 0, line: -1 }, // blank between a lone header and its block
    { section: 0, line: 1 },  // chord line ...
    { section: 0, line: 1 },  // ... and its lyric become one output line
    { section: 0, line: 2 },  // flagged line, kept as text
    undefined,                // blank between sections
    { section: 1, line: 0 },
    { section: 1, line: 1 },
  ]);
});
