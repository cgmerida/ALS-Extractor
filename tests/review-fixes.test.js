// Regressions for the code-review fixes (placeholder tempo, signature dedupe, names, scoping, pako fallback).
const test = require('node:test');
const assert = require('assert');
const zlib = require('zlib');
const { ALS, parse, toArrayBuffer } = require('./helpers');

globalThis.pako = require('pako');

const set = (inner, extra = '') => `<Ableton><LiveSet>${extra}<MasterTrack>${inner}</MasterTrack></LiveSet></Ableton>`;
const env = (id, tag, evs) => `<AutomationEnvelope><EnvelopeTarget><PointeeId Value="${id}"/></EnvelopeTarget><Automation><Events>${evs.map(([t, v]) => `<${tag} Time="${t}" Value="${v}"/>`).join('')}</Events></Automation></AutomationEnvelope>`;
const mixer = `<DeviceChain><Mixer><Tempo><Manual Value="120"/><AutomationTarget Id="8"/></Tempo><TimeSignature><Manual Value="201"/><AutomationTarget Id="9"/></TimeSignature></Mixer></DeviceChain>`;

test('placeholder tempo overridden at beat 0 is not reported as the start tempo', () => {
  const r = ALS.analyze(parse(set(`<AutomationEnvelopes><Envelopes>${env(8, 'FloatEvent', [[-63072000, 120], [0, 128]])}</Envelopes></AutomationEnvelopes>${mixer}`)));
  assert.strictEqual(ALS.tempoPoints(r.map, false)[0].bpm, 128);
  assert.strictEqual(ALS.renderTempo(r, { anchors: true }), '128.0000 -> 00:00:000');
});

test('same-beat 3/4 then back to 4/4 collapses to a single 4/4', () => {
  const r = ALS.analyze(parse(set(`<AutomationEnvelopes><Envelopes>${env(9, 'EnumEvent', [[-63072000, 201], [16, 200], [16, 201], [32, 200]])}</Envelopes></AutomationEnvelopes>${mixer}`)));
  assert.strictEqual(ALS.renderSigs(r), '4/4 -> 00:00:000\n3/4 -> 00:16:000');
});

test('locator name with a line break stays on one line', () => {
  const r = ALS.analyze(parse(set(mixer, `<Locators><Locators><Locator><Time Value="4"/><Name Value="Verso&#10;Uno"/></Locator></Locators></Locators>`)));
  assert.strictEqual(ALS.renderMarkers(r), 'Verso Uno -> 00:02:000');
});

test('a same-named Tempo param inside a master device is not used as the song tempo', () => {
  const decoy = set(`<DeviceChain><DeviceChain><Devices><Echo><Tempo><Manual Value="999"/></Tempo></Echo></Devices></DeviceChain></DeviceChain>`);
  assert.throws(() => ALS.analyze(parse(decoy)), /No tempo/);
});

test('decompression falls back to pako and reports its reason', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const gz = zlib.gzipSync(Buffer.from(set(mixer)));

  const bad = new Uint8Array(gz);
  bad.fill(0xff, 12, 30);
  await assert.rejects(ALS.decompress(bad.buffer), (e) => /Decompression failed .*\(.+\)/.test(e.message));

  const DS = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    assert((await ALS.decompress(toArrayBuffer(gz))).includes('<MasterTrack>'));
  } finally {
    globalThis.DecompressionStream = DS;
  }
});
