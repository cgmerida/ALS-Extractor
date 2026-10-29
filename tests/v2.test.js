// V2 features: offset, SMPTE, linter, MIDI export (verified by parsing the file back), batch ZIP.
const test = require('node:test');
const assert = require('assert');
const JSZip = require('jszip');
const { ALS, parse, loadFixture, midiTimeline, assertMarkersMatch } = require('./helpers');

const rampSet = `<Ableton Creator="Ableton Live 12.1.1"><LiveSet>
<Locators><Locators>
 ${[[0, 'Intro'], [2, 'Puente Ñ — Final'], [4, 'Verse'], [10, 'Chorus'], [40, 'Bridge'], [72, 'Outro'], [100, 'End']]
    .map(([t, n]) => `<Locator><Time Value="${t}"/><Name Value="${n}"/></Locator>`).join('')}
</Locators></Locators>
<MainTrack>
 <AutomationEnvelopes><Envelopes>
  <AutomationEnvelope><EnvelopeTarget><PointeeId Value="8"/></EnvelopeTarget><Automation><Events>
   <FloatEvent Time="-63072000" Value="60"/><FloatEvent Time="0" Value="60"/><FloatEvent Time="4" Value="120"/>
   <FloatEvent Time="8" Value="120"/><FloatEvent Time="72" Value="80"/><FloatEvent Time="72" Value="140"/>
  </Events></Automation></AutomationEnvelope>
  <AutomationEnvelope><EnvelopeTarget><PointeeId Value="9"/></EnvelopeTarget><Automation><Events>
   <EnumEvent Time="-63072000" Value="201"/><EnumEvent Time="8" Value="200"/><EnumEvent Time="40" Value="302"/>
  </Events></Automation></AutomationEnvelope>
 </Envelopes></AutomationEnvelopes>
 <DeviceChain><Mixer><Tempo><Manual Value="60"/><AutomationTarget Id="8"/></Tempo><TimeSignature><Manual Value="201"/><AutomationTarget Id="9"/></TimeSignature></Mixer></DeviceChain>
</MainTrack></LiveSet></Ableton>`;

// ---------- Time formatting ----------
test('SMPTE 30 fps non-drop', () => {
  assert.strictEqual(ALS.formatSmpte(0), '00:00:00:00');
  assert.strictEqual(ALS.formatSmpte(999), '00:00:00:29');
  assert.strictEqual(ALS.formatSmpte(33), '00:00:00:00');
  assert.strictEqual(ALS.formatSmpte(34), '00:00:00:01');
  assert.strictEqual(ALS.formatSmpte(311830), '00:05:11:24');
  assert.strictEqual(ALS.formatSmpte(3600000 + 61000), '01:01:01:00');
});

test('format switch changes only the time column', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  assert(ALS.renderMarkers(r, { format: 'smpte' }).includes('Turnaround -> 00:01:27:26'));
});

// ---------- Offset ----------
test('absoluteTimeToBeat inverts beatToAbsoluteTime, including ramps', () => {
  const r = ALS.analyze(parse(rampSet));
  for (const b of [0, 1, 2.5, 4, 6, 30, 71.9, 72, 90]) {
    assert(Math.abs(ALS.absoluteTimeToBeat(r.map, ALS.beatToAbsoluteTime(r.map, b) / 1000) - b) < 1e-9, `beat ${b}`);
  }
});

test('positive offset shifts every row and keeps anchors exactly 1 ms before the step', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const o = { offsetMs: 2000 };
  assert(ALS.renderMarkers(r, o).includes('Turnaround -> 01:29:887'));
  assert(ALS.renderTempo(r, o).startsWith('71.0000 -> 00:00:000\n71.0000 -> 05:13:830\n68.5551 -> 05:13:831'));
  assert.strictEqual(ALS.renderSigs(r, o), '4/4 -> 00:00:000');
});

test('negative offset trims the start: earlier rows are dropped, not stacked on 0', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const o = { offsetMs: -10000 };
  const markers = ALS.renderMarkers(r, o).split('\n');
  assert.strictEqual(markers[0], 'Intro -> 00:10:282');
  assert.strictEqual(ALS.markerRows(r, o).dropped, 2);
  assert(ALS.renderTempo(r, o).startsWith('71.0000 -> 00:00:000\n71.0000 -> 05:01:830'));
  assert(ALS.lint(r, o).some((x) => x.level === 'error' && /2 locator\(s\) fall before/.test(x.title)));
});

// ---------- Linter ----------
test('linter on the real set: only a note that the blank end locator was skipped', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const issues = ALS.lint(r);
  assert.deepStrictEqual(issues.map((x) => x.level), ['info'], JSON.stringify(issues, null, 1));
  assert(/1 blank-named locator\(s\) skipped/.test(issues[0].title));
  assert(issues[0].detail.includes('05:31:430'));
  // Kept on request: then it is a warning again.
  const kept = ALS.lint(r, { skipBlank: false });
  assert.deepStrictEqual(kept.map((x) => x.level), ['warning']);
  assert(/blank name/.test(kept[0].title));
});

// ---------- Blank locators ----------
test('blank locators are skipped from text and MIDI by default, kept when the option is off', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  assert(!ALS.renderMarkers(r).includes('05:31:430'));
  assert(ALS.renderMarkers(r, { skipBlank: false }).endsWith('  -> 05:31:430'));
  const skipped = midiTimeline(ALS.buildMidi(r));
  const kept = midiTimeline(ALS.buildMidi(r, { skipBlank: false }));
  assert.strictEqual(kept.markers.length - skipped.markers.length, 1);
  assertMarkersMatch(r, {}, skipped);
  assertMarkersMatch(r, { skipBlank: false }, kept);
});

test('a blank locator at 0 does not satisfy "starts at zero" when blanks are skipped', () => {
  const r = ALS.analyze(parse(`<Ableton Creator="Ableton Live 12.1"><LiveSet><Locators><Locators>`
    + `<Locator><Time Value="0"/><Name Value=" "/></Locator><Locator><Time Value="8"/><Name Value="Intro"/></Locator></Locators></Locators>`
    + `<MainTrack><DeviceChain><Mixer><Tempo><Manual Value="120"/></Tempo></Mixer></DeviceChain></MainTrack></LiveSet></Ableton>`));
  assert(/No locator at 00:00:000/.test(ALS.lint(r)[0].title));
  assert(!ALS.lint(r, { skipBlank: false }).some((x) => /No locator at/.test(x.title)));
});

// ---------- Ramp smoothing ----------
// Beats Secuencias counts between consecutive points if it interpolates BPM linearly in time.
function linearInTimeBeats(points) {
  let beats = 0;
  for (let i = 1; i < points.length; i++) beats += (points[i - 1].bpm + points[i].bpm) / 2 * (points[i].ms - points[i - 1].ms) / 60000;
  return beats;
}

test('smooth ramps: the real ramp song gets a few points on Ableton\'s curve and a sub-ms grid', async () => {
  const { result: r } = await loadFixture('BuildMyLife-WorthyOfYourName-live8.als');
  const rows = ALS.renderTempo(r).split('\n');
  assert.deepStrictEqual(rows, [
    '70.0000 -> 00:00:000', '70.0000 -> 06:22:270',
    '67.0000 -> 06:22:709', '64.0000 -> 06:23:167', '61.0000 -> 06:23:648',
    '58.0000 -> 06:24:152',
  ]);
  // Each added point is where Ableton actually reaches that BPM.
  for (const row of rows.slice(2, 5)) {
    const [bpm, time] = row.split(' -> ');
    const [m, s, ms] = time.split(':').map(Number);
    const sec = (m * 60000 + s * 1000 + ms) / 1000;
    const beat = ALS.absoluteTimeToBeat(r.map, sec);
    assert(Math.abs(70 + (58 - 70) * (beat - 445.98179893023644) / (447.98357683982687 - 445.98179893023644) - Number(bpm)) < 0.01, row);
  }
  // Grid error across the ramp: ~5.9 ms with endpoints only, under 1 ms smoothed (ms rounding included).
  const ramp = (o) => ALS.tempoPoints(o.smoothRamps ? ALS.smoothRamps(r.map) : r.map, false).filter((p) => p.ms >= 382270);
  const actual = 447.98357683982687 - 445.98179893023644;
  const gridMs = (pts) => Math.abs(linearInTimeBeats(pts) - actual) * 60 / 58 * 1000;
  assert(gridMs(ramp({ smoothRamps: false })) > 5);
  assert(gridMs(ramp({ smoothRamps: true })) < 1);
});

test('smooth ramps: no change for stepped tempo, markers or MIDI', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  assert.strictEqual(ALS.renderTempo(r), ALS.renderTempo(r, { smoothRamps: false }));
  const { result: ramp } = await loadFixture('BuildMyLife-WorthyOfYourName-live8.als');
  assert.strictEqual(ALS.renderMarkers(ramp), ALS.renderMarkers(ramp, { smoothRamps: false }));
  assert.deepStrictEqual(ALS.buildMidi(ramp), ALS.buildMidi(ramp, { smoothRamps: false }));
});

test('smooth ramps: long ramps are capped at 16th-note pieces', () => {
  const r = ALS.analyze(parse(rampSet)); // 120 -> 80 BPM over 64 beats
  const added = ALS.smoothRamps(r.map).length - r.map.length;
  assert(added > 0 && added <= (4 + 64) * 4, `added ${added}`);
});

test('linter rules: start at zero, names, static tempo', () => {
  const set = (locs, tempo = '<FloatEvent Time="-63072000" Value="90"/>') => ALS.analyze(parse(
    `<Ableton Creator="Ableton Live 12.1"><LiveSet><Locators><Locators>${locs.map(([t, n]) => `<Locator><Time Value="${t}"/><Name Value="${n}"/></Locator>`).join('')}</Locators></Locators>`
    + `<MainTrack><AutomationEnvelopes><Envelopes><AutomationEnvelope><EnvelopeTarget><PointeeId Value="8"/></EnvelopeTarget><Automation><Events>${tempo}</Events></Automation></AutomationEnvelope></Envelopes></AutomationEnvelopes>`
    + `<DeviceChain><Mixer><Tempo><Manual Value="90"/><AutomationTarget Id="8"/></Tempo></Mixer></DeviceChain></MainTrack></LiveSet></Ableton>`));

  const r = set([[4, 'Coro Fuerte'], [8, 'Verse 2'], [12, 'Chorus x2'], [16, 'Pre-Chorus'], [20, 'Puente'], [24, 'Mi Sección']]);
  const issues = ALS.lint(r);
  const titles = issues.map((x) => x.title);
  assert.strictEqual(issues[0].level, 'error');
  assert(/No locator at 00:00:000/.test(titles[0]));
  assert(issues.find((x) => /"Coro Fuerte"/.test(x.title)).detail.includes('"Chorus"'));
  assert(issues.find((x) => /"Puente"/.test(x.title)).detail.includes('"Bridge"'));
  assert(issues.some((x) => /"Mi Sección"/.test(x.title)));
  assert(!titles.some((t) => /Verse 2|Chorus x2|Pre-Chorus/.test(t)));
  assert(titles.some((t) => /Static tempo: 90\.00 BPM/.test(t)));

  const moving = set([[0, 'Intro']], '<FloatEvent Time="-63072000" Value="90"/><FloatEvent Time="8" Value="90"/><FloatEvent Time="8" Value="100"/>');
  assert.deepStrictEqual(ALS.lint(moving), []);
  assert(/No locators/.test(ALS.lint(set([]))[0].title));
});

// ---------- MIDI ----------
test('MIDI of the real set: markers land on the text times in a standard player', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const midi = midiTimeline(ALS.buildMidi(r, {}, 'MultiTrack'));
  assert.deepStrictEqual([midi.header.format, midi.header.numTracks, midi.header.ticksPerBeat], [1, 1, ALS.PPQ]);
  assert.deepStrictEqual(midi.names, ['MultiTrack']);
  assertMarkersMatch(r, {}, midi);
  assert.deepStrictEqual(midi.sigs.map((s) => [s.tick, s.label]), [[0, '4/4']]);
});

test('MIDI anchors: a no-op tempo event ~1 ms before each step, only when the toggle is on', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  const on = midiTimeline(ALS.buildMidi(r, { anchors: true }));
  const off = midiTimeline(ALS.buildMidi(r, { anchors: false }));
  assert.strictEqual(on.tempos.length - off.tempos.length, 7);
  for (const step of off.tempos.slice(1)) {
    const i = on.tempos.findIndex((t) => t.tick === step.tick);
    const anchor = on.tempos[i - 1];
    assert(step.ms - anchor.ms > 0.5 && step.ms - anchor.ms < 1.5, `anchor gap ${step.ms - anchor.ms} ms`);
    assert.strictEqual(anchor.bpm, on.tempos[i - 2].bpm, 'anchor repeats the tempo in effect');
  }
  assertMarkersMatch(r, {}, on);
  assertMarkersMatch(r, {}, off);
});

test('MIDI of the real ramp song: markers on the text times, ramp split into steps, no anchors', async () => {
  const { result: r } = await loadFixture('BuildMyLife-WorthyOfYourName-live8.als');
  const on = midiTimeline(ALS.buildMidi(r, { anchors: true }));
  const off = midiTimeline(ALS.buildMidi(r, { anchors: false }));
  assert.deepStrictEqual(on, off, 'a ramp has no step, so the anchor toggle changes nothing');
  assertMarkersMatch(r, {}, on);
  assert(on.tempos.length > 3, 'the ramp becomes several tempo steps');
  assert(Math.abs(on.tempos.at(-1).bpm - 58) < 0.01);
});

test('MIDI with offsets: pre-roll and trimmed start keep markers on the text times', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  for (const offsetMs of [2000, 100, -10000, -311000]) {
    const o = { offsetMs };
    const midi = midiTimeline(ALS.buildMidi(r, o));
    assertMarkersMatch(r, o, midi);
    assert.strictEqual(midi.tempos[0].tick, 0, 'a tempo is stated at tick 0');
    assert.strictEqual(midi.sigs[0].tick, 0, 'a time signature is stated at tick 0');
  }
});

test('MIDI ramps are split into steps that keep exact absolute times; UTF-8 names survive', () => {
  const r = ALS.analyze(parse(rampSet));
  for (const offsetMs of [0, 1500, -3000]) {
    const midi = midiTimeline(ALS.buildMidi(r, { offsetMs }));
    assertMarkersMatch(r, { offsetMs }, midi);
  }
  const midi = midiTimeline(ALS.buildMidi(r));
  assert(midi.markers.some((m) => m.text === 'Puente Ñ — Final'));
  assert.deepStrictEqual(midi.sigs.map((s) => s.label), ['4/4', '3/4', '6/8']);
  assert.deepStrictEqual(midi.sigs.map((s) => s.tick), [0, 8 * ALS.PPQ, 40 * ALS.PPQ]);
  // The step at beat 72 (80 -> 140 BPM) is an exact jump in the file.
  const after = midi.tempos.find((t) => t.tick === 72 * ALS.PPQ);
  assert(Math.abs(after.bpm - 140) < 0.01);
});

test('MIDI tempo rounding does not accumulate over a long, ramp-heavy song', () => {
  // ~35 minutes: a ramp every 8 beats between 70 and 170 BPM, a locator every 16 beats.
  let ev = '<FloatEvent Time="-63072000" Value="70"/>', locs = '';
  for (let b = 0, i = 0; b <= 4000; b += 8, i++) ev += `<FloatEvent Time="${b}" Value="${i % 2 ? 170 : 70.3}"/>`;
  for (let b = 0; b <= 4000; b += 16) locs += `<Locator><Time Value="${b}"/><Name Value="L${b}"/></Locator>`;
  const r = ALS.analyze(parse(`<Ableton Creator="Ableton Live 12.1"><LiveSet><Locators><Locators>${locs}</Locators></Locators>`
    + `<MainTrack><AutomationEnvelopes><Envelopes><AutomationEnvelope><EnvelopeTarget><PointeeId Value="8"/></EnvelopeTarget><Automation><Events>${ev}</Events></Automation></AutomationEnvelope></Envelopes></AutomationEnvelopes>`
    + `<DeviceChain><Mixer><Tempo><Manual Value="70"/><AutomationTarget Id="8"/></Tempo></Mixer></DeviceChain></MainTrack></LiveSet></Ableton>`));
  const midi = midiTimeline(ALS.buildMidi(r));
  const worst = Math.max(...midi.markers.map((m, i) => Math.abs(m.ms - r.markers[i].ms)));
  assert(worst < 0.05, `worst marker drift ${worst.toFixed(3)} ms`);
});

test('Live 12 save exports the same MIDI as Live 8', async () => {
  const { result: r8 } = await loadFixture('MultiTrack-live8.als');
  const { result: r12 } = await loadFixture('MultiTrack-live12.als');
  assert.deepStrictEqual(ALS.buildMidi(r12, {}, 'x'), ALS.buildMidi(r8, {}, 'x'));
});

// ---------- Batch ----------
test('ZIP: one .mid per parsed song, unique names, summary lists failures', async () => {
  const { result: r8 } = await loadFixture('MultiTrack-live8.als');
  const { result: r12 } = await loadFixture('MultiTrack-live12.als');
  const songs = [
    { name: 'MultiTrack', fileName: 'MultiTrack.als', result: r8 },
    { name: 'MultiTrack', fileName: 'other/MultiTrack.als', result: r12 },
    { name: 'Broken: song?', fileName: 'Broken: song?.als', error: 'This file is not a valid .als' },
  ];
  // SMPTE is display-only: the ZIP summary must stay in MM:SS:mmm.
  const zip = await JSZip.loadAsync(await ALS.buildZip(JSZip, songs, { offsetMs: 0, format: 'smpte' }, 'uint8array'));
  assert.deepStrictEqual(Object.keys(zip.files).sort(), ['MultiTrack (2).mid', 'MultiTrack.mid', 'Setlist summary.txt']);
  const mid = await zip.file('MultiTrack.mid').async('uint8array');
  assert.deepStrictEqual(mid, ALS.buildMidi(r8, {}, 'MultiTrack'));
  const summary = await zip.file('Setlist summary.txt').async('string');
  assert(summary.includes('=== 1. MultiTrack (MultiTrack.als) ==='));
  assert(summary.includes('Turnaround -> 01:27:887'));
  assert(summary.includes('ERROR: This file is not a valid .als'));
  assert(summary.includes('Health: 0 error(s), 0 warning(s)'));
  assert(summary.includes('[NOTE] 1 blank-named locator(s) skipped'));
});
