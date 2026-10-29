// Regressions for the max-level code review, each built from the reviewer's failure scenario.
const test = require('node:test');
const assert = require('assert');
const zlib = require('zlib');
const JSZip = require('jszip');
const { parseMidi } = require('midi-file');
const { ALS, parse, fixture, toArrayBuffer, loadFixture, midiTimeline, assertMarkersMatch } = require('./helpers');

globalThis.pako = require('pako');

// A Live 12-style set from [beat, bpm] tempo events and [beat, name] locators.
function makeSet(tempo, locs) {
  const ev = tempo.map(([t, v]) => `<FloatEvent Time="${t}" Value="${v}"/>`).join('');
  const lo = locs.map(([t, n]) => `<Locator><Time Value="${t}"/><Name Value="${n}"/></Locator>`).join('');
  return ALS.analyze(parse(`<Ableton Creator="Ableton Live 12.1"><LiveSet><Locators><Locators>${lo}</Locators></Locators>`
    + `<MainTrack><AutomationEnvelopes><Envelopes><AutomationEnvelope><EnvelopeTarget><PointeeId Value="8"/></EnvelopeTarget><Automation><Events>${ev}</Events></Automation></AutomationEnvelope></Envelopes></AutomationEnvelopes>`
    + `<DeviceChain><Mixer><Tempo><Manual Value="${tempo[0][1]}"/><AutomationTarget Id="8"/></Tempo></Mixer></DeviceChain></MainTrack></LiveSet></Ableton>`));
}

// A reader that interpolates BPM linearly between consecutive tempo events (in beats), instead of
// stepping. Returns each marker's time in ms under that model.
function interpolatingReaderMarkers(bytes) {
  const midi = parseMidi(Buffer.from(bytes));
  const ppq = midi.header.ticksPerBeat;
  let tick = 0;
  const tempos = [], markers = [];
  for (const e of midi.tracks[0]) {
    tick += e.deltaTime;
    if (e.type === 'setTempo') tempos.push({ tick, bpm: 60e6 / e.microsecondsPerBeat });
    if (e.type === 'marker') markers.push({ tick, text: Buffer.from(e.text, 'latin1').toString('utf8') });
  }
  const timeAt = (t) => {
    let sec = 0;
    for (let i = 0; i < tempos.length && tempos[i].tick < t; i++) {
      const a = tempos[i], b = tempos[i + 1];
      const end = b ? Math.min(b.tick, t) : t;
      const bpmEnd = b ? a.bpm + (b.bpm - a.bpm) * (end - a.tick) / (b.tick - a.tick) : a.bpm;
      sec += ALS.segmentSeconds((end - a.tick) / ppq, a.bpm, bpmEnd);
    }
    return sec * 1000;
  };
  return markers.map((m) => ({ text: m.text, ms: timeAt(m.tick) }));
}

// 1 ---------- trimmed start: text and MIDI keep the same locators ----------
test('trimming to a displayed marker keeps that marker in the MIDI, at 0', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const o = { offsetMs: -294085 }; // the displayed "Chorus -> 04:54:085"
  assert(ALS.renderMarkers(r, o).startsWith('Chorus -> 00:00:000'));
  const midi = midiTimeline(ALS.buildMidi(r, o));
  assert.strictEqual(midi.markers[0].text, 'Chorus');
  assert.strictEqual(midi.markers[0].tick, 0);
  assertMarkersMatch(r, o, midi);
});

test('trim near a marker at slow tempos: same locators in text and MIDI, no drift', () => {
  const at30 = makeSet([[-63072000, 30], [0, 30]], [[0, 'Intro'], [4, 'Verse'], [8, 'Chorus']]);
  for (const offsetMs of [-8001, -7999, -8000]) assertMarkersMatch(at30, { offsetMs }, midiTimeline(ALS.buildMidi(at30, { offsetMs })));
  const at20 = makeSet([[-63072000, 20], [0, 20]], [[0, 'Intro'], [4, 'Verse'], [8, 'Chorus']]);
  const midi = midiTimeline(ALS.buildMidi(at20, { offsetMs: -1511 }));
  assertMarkersMatch(at20, { offsetMs: -1511 }, midi);
  const verse = midi.markers.find((m) => m.text === 'Verse');
  assert(Math.abs(verse.ms - 10489) < 0.05, `Verse at ${verse.ms} ms`);
});

// 3 ---------- hold event before a ramp ----------
test('MIDI holds the flat tempo until the ramp, so an interpolating reader does not glide from bar 1', async () => {
  const { result: r } = await loadFixture('BuildMyLife-WorthyOfYourName-live8.als');
  const bytes = ALS.buildMidi(r);
  const midi = midiTimeline(bytes);
  const rampTick = Math.round(445.98179893023644 * ALS.PPQ);
  const hold = midi.tempos.find((t) => t.tick === rampTick - 1);
  assert(hold && Math.abs(hold.bpm - 70) < 0.001, 'a 70 BPM event 1 tick before the ramp');
  assertMarkersMatch(r, {}, midi); // a standard (stepping) reader is unaffected
  // Without the hold an interpolating reader put Ending ~2.3 s late. The file is exact for standard
  // readers (ramp pieces carry average tempos), which leaves an interpolating reader tens of ms off.
  const expected = ALS.markerRows(r).rows;
  for (const [i, m] of interpolatingReaderMarkers(bytes).entries()) {
    assert(Math.abs(m.ms - expected[i].ms) < 30, `${m.text}: interpolating reader ${m.ms.toFixed(1)} ms vs ${expected[i].ms} ms`);
  }
});

// 5 ---------- placeholder tempo never shows up ----------
test('a placeholder tempo overridden at beat 0 does not leak into a pre-roll', () => {
  const r = makeSet([[-63072000, 120], [0, 128]], [[0, 'Intro']]);
  for (const offsetMs of [0, 1, 2000]) {
    const text = ALS.renderTempo(r, { offsetMs });
    assert(text.startsWith('128.0000 -> 00:00:000') && !text.includes('120.0000'), `offset ${offsetMs}: ${text}`);
  }
});

// 6 ---------- unique ZIP names ----------
test('unique names never collide, and failed songs do not reserve a name', async () => {
  assert.deepStrictEqual(ALS.uniqueNames(['Song', 'Song (2)', 'Song']), ['Song', 'Song (2)', 'Song (3)']);
  assert.deepStrictEqual(ALS.uniqueNames(['a', 'A']), ['a', 'A (2)']);
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const songs = [
    { name: 'A', fileName: 'A.als', error: 'broken' },
    { name: 'A', fileName: 'other/A.als', result: r },
    { name: 'Song (2)', fileName: 'Song (2).als', result: r },
    { name: 'Song', fileName: 'Song.als', result: r },
    { name: 'Song', fileName: 'x/Song.als', result: r },
  ];
  const zip = await JSZip.loadAsync(await ALS.buildZip(JSZip, songs, {}, 'uint8array'));
  assert.deepStrictEqual(Object.keys(zip.files).sort(), ['A.mid', 'Setlist summary.txt', 'Song (2).mid', 'Song (3).mid', 'Song.mid']);
});

// 7 ---------- markers inside a steep ramp ----------
test('MIDI markers inside a steep ramp land on the exact time', () => {
  const steep = makeSet([[-63072000, 70], [446.1, 70], [448.1, 50]], [[0, 'Intro'], [448, 'Ending']]);
  const midi = midiTimeline(ALS.buildMidi(steep));
  const exact = ALS.beatToAbsoluteTime(steep.map, 448);
  assert(Math.abs(midi.markers[1].ms - exact) < 0.05, `Ending ${midi.markers[1].ms} vs ${exact}`);
  const fast = makeSet([[-63072000, 60], [0, 60], [4, 120]], [[0, 'Intro'], [0.125, 'Pickup']]);
  for (const offsetMs of [0, -50, -100]) assertMarkersMatch(fast, { offsetMs }, midiTimeline(ALS.buildMidi(fast, { offsetMs })));
});

// 8 ---------- truncated file ----------
test('a truncated .als reports corruption, not "invalid XML"', async () => {
  const bytes = fixture('MultiTrack-live8.als');
  const cut = toArrayBuffer(bytes.subarray(0, Math.floor(bytes.length / 2)));
  const t = test.mock ?? null; // eslint-disable-line no-unused-vars
  const warn = console.warn, error = console.error;
  console.warn = console.error = () => {};
  try {
    await assert.rejects(ALS.decompress(cut), /Decompression failed/);
  } finally {
    console.warn = warn; console.error = error;
  }
});

// 10 ---------- name advice ----------
test('name linter: modifiers, solo and (x2) counters', () => {
  for (const n of ['Final Chorus', 'Final Verse', 'Double Chorus', 'Chorus (x2)', 'Chorus (2x)', 'Solo', 'Solo 2']) {
    assert(ALS.isStandardName(n), n);
  }
  assert.strictEqual(ALS.suggestName('Solo Guitarra'), 'Solo');
  assert.strictEqual(ALS.suggestName('Final'), 'Outro');
  assert.strictEqual(ALS.suggestName('Coro Fuerte'), 'Chorus');
  assert.strictEqual(ALS.suggestName('Coro2'), 'Chorus');
  assert.strictEqual(ALS.suggestName('Finale'), null, 'whole words only');
  assert.strictEqual(ALS.suggestName('Coronación'), null, 'whole words only');
});

// 11, 12 ---------- offset parsing and display ----------
test('offset field: "2.5" and "2,5" both mean 2.5 s; anything else is rejected, not guessed', () => {
  const cases = { '': 0, '2,5': 2500, '2.5': 2500, '-1.25': -1250, '+2': 2000, ' 3 ': 3000, '.5': 500, '-0,04': -40 };
  for (const [s, ms] of Object.entries(cases)) assert.strictEqual(ALS.parseOffset(s), ms, JSON.stringify(s));
  for (const s of ['2e', '-', '.', '+', '1-', 'abc', '1.2.3', '1,2,3']) assert.strictEqual(ALS.parseOffset(s), null, s);
});

test('offset is shown exactly as applied', async () => {
  assert.strictEqual(ALS.formatOffset(1250), '+1.25 s');
  assert.strictEqual(ALS.formatOffset(-40), '−0.04 s');
  assert.strictEqual(ALS.formatOffset(0), '0 s');
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  assert(ALS.lint(r, { offsetMs: -6800 }).some((x) => x.title.includes('after the −6.8 s offset')));
  const summary = ALS.buildSummary([{ name: 'M', fileName: 'M.als', result: r }], { offsetMs: 1250 });
  assert(summary.includes('Offset: +1.25 s'));
});

// 13 ---------- Live 8 Mixer path ----------
test('Live 8 tempo is read from MasterChain/Mixer, not the first Mixer found', () => {
  const r = ALS.analyze(parse(`<Ableton Creator="Ableton Live 8.4.2"><LiveSet><MasterTrack>`
    + `<DeviceChain><Devices><SomeDevice><Mixer><Tempo><Manual Value="999"/></Tempo></Mixer></SomeDevice></Devices></DeviceChain>`
    + `<MasterChain><Mixer><Tempo><ArrangerAutomation><Events><FloatEvent Time="-63072000" Value="71"/></Events></ArrangerAutomation></Tempo></Mixer></MasterChain>`
    + `</MasterTrack></LiveSet></Ableton>`));
  assert.strictEqual(r.map[0].value, 71);
});
