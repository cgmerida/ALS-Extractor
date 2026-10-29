// Real Ableton sets: the same song saved in Live 8.4.2 and Live 12.1.1, plus Live 11 / future
// variants derived from the Live 12 file. Expected values come from the original spec.
const test = require('node:test');
const assert = require('assert');
const { ALS, parse, loadFixture, renderAll } = require('./helpers');

test('Live 8.4.2 set matches the spec examples', async () => {
  const { result: r } = await loadFixture('MultiTrack-live8.als');
  assert.deepStrictEqual([r.version.label, r.version.supported, r.masterTag, r.tempoSource], ['Live 8.4.2', true, 'MasterTrack', 'legacy']);
  assert(ALS.renderMarkers(r).includes('Turnaround -> 01:27:887'));
  assert(ALS.renderTempo(r, { anchors: true }).startsWith('71.0000 -> 00:00:000\n71.0000 -> 05:11:830\n68.5551 -> 05:11:831'));
  assert.strictEqual(ALS.renderSigs(r), '4/4 -> 00:00:000');
});

test('Live 12.1.1 save of the same set gives identical output', async () => {
  const { result: r8 } = await loadFixture('MultiTrack-live8.als');
  const { result: r12 } = await loadFixture('MultiTrack-live12.als');
  assert.deepStrictEqual(
    [r12.version.label, r12.version.supported, r12.masterTag, r12.tempoSource, r12.sigSource, r12.curvedTempo],
    ['Live 12.1.1', true, 'MainTrack', 'envelope', 'envelope', 0],
  );
  assert.strictEqual(renderAll(r12), renderAll(r8));
});

test('Live 8 set with a tempo ramp (70 -> 58 BPM over ~2 beats): no anchors, ramp endpoints only', async () => {
  const { result: r } = await loadFixture('BuildMyLife-WorthyOfYourName-live8.als');
  assert.strictEqual(r.curvedTempo, 0, 'a straight ramp, not curved automation');
  const expected = '70.0000 -> 00:00:000\n70.0000 -> 06:22:270\n58.0000 -> 06:24:152';
  assert.strictEqual(ALS.renderTempo(r, { anchors: true, smoothRamps: false }), expected);
  assert.strictEqual(ALS.renderTempo(r, { anchors: false, smoothRamps: false }), expected);
  assert(ALS.renderMarkers(r).includes('Ending -> 06:24:169'));
  assert.strictEqual(ALS.renderSigs(r), '4/4 -> 00:00:000');
});

test('Live 11 layout (MasterTrack + envelopes) gives identical output', async () => {
  const { result: r8 } = await loadFixture('MultiTrack-live8.als');
  const { xml } = await loadFixture('MultiTrack-live12.als');
  const r11 = ALS.analyze(parse(xml.replace(/MainTrack/g, 'MasterTrack').replace('Ableton Live 12.1.1', 'Ableton Live 11.3.13')));
  assert.deepStrictEqual([r11.version.supported, r11.masterTag, r11.tempoSource], [true, 'MasterTrack', 'envelope']);
  assert.strictEqual(renderAll(r11), renderAll(r8));
});

test('curved tempo automation is detected', async () => {
  const { xml } = await loadFixture('MultiTrack-live12.als');
  const r = ALS.analyze(parse(xml.replace(
    '<FloatEvent Id="1" Time="369" Value="71" />',
    '<FloatEvent Id="1" Time="369" Value="71" CurveControl1X="0.3" CurveControl1Y="0.7" />',
  )));
  assert.strictEqual(r.curvedTempo, 1);
});

test('future version with a renamed main track still parses, with a notice', async () => {
  const { result: r8 } = await loadFixture('MultiTrack-live8.als');
  const { xml } = await loadFixture('MultiTrack-live12.als');
  const r13 = ALS.analyze(parse(xml.replace(/MainTrack/g, 'SongTrack').replace('Ableton Live 12.1.1', 'Ableton Live 13.0')));
  assert.strictEqual(r13.masterTag, 'SongTrack');
  assert(/newer than the newest tested/.test(r13.version.warning));
  assert.strictEqual(renderAll(r13), renderAll(r8));
});

test('version detection range', () => {
  const v = (c) => ALS.detectVersion(parse(`<Ableton Creator="${c}"/>`).documentElement);
  for (const c of ['Ableton Live 8.4.2', 'Ableton Live 9.7.7', 'Ableton Live 10.1', 'Ableton Live 11.3.13', 'Ableton Live 12.1.1']) {
    assert(v(c).supported, c);
  }
  assert(/older/.test(v('Ableton Live 7.0.18').warning));
  assert(/newer/.test(v('Ableton Live 13.0').warning));
  assert(/Could not detect/.test(v('').warning));
});
