// Tempo math, formatting, anchors and XML layouts, on synthetic sets.
const test = require('node:test');
const assert = require('assert');
const zlib = require('zlib');
const { ALS, parse, toArrayBuffer } = require('./helpers');

const modern = `<?xml version="1.0" encoding="UTF-8"?><Ableton Creator="Ableton Live 11.3"><LiveSet>
<Locators><Locators>
 <Locator Id="1"><Time Value="16"/><Name Value="Coro Final"/></Locator>
 <Locator Id="0"><Time Value="0"/><Name Value="Intro"/></Locator>
</Locators></Locators>
<Tracks><AudioTrack><DeviceChain><Mixer><Tempo><Manual Value="999"/></Tempo></Mixer></DeviceChain></AudioTrack></Tracks>
<MasterTrack>
 <AutomationEnvelopes><Envelopes>
  <AutomationEnvelope Id="1"><EnvelopeTarget><PointeeId Value="9"/></EnvelopeTarget><Automation><Events>
   <EnumEvent Time="-63072000" Value="201"/><EnumEvent Time="8" Value="200"/><EnumEvent Time="12" Value="302"/>
  </Events></Automation></AutomationEnvelope>
  <AutomationEnvelope Id="0"><EnvelopeTarget><PointeeId Value="8"/></EnvelopeTarget><Automation><Events>
   <FloatEvent Id="1" Time="-63072000" Value="120"/>
   <FloatEvent Id="2" Time="8" Value="120"/>
   <FloatEvent Id="3" Time="8" Value="60"/>
   <FloatEvent Id="4" Time="12" Value="120"/>
  </Events></Automation></AutomationEnvelope>
 </Envelopes></AutomationEnvelopes>
 <DeviceChain><Mixer><Tempo><Manual Value="120"/><AutomationTarget Id="8"/></Tempo><TimeSignature><Manual Value="201"/><AutomationTarget Id="9"/></TimeSignature></Mixer></DeviceChain>
</MasterTrack></LiveSet></Ableton>`;

test('tempo math and formatting', () => {
  assert.strictEqual(Math.round(ALS.segmentSeconds(4, 120, 120) * 1000), 2000);
  assert(Math.abs(ALS.segmentSeconds(4, 60, 120) - 4 * Math.LN2) < 1e-12);
  assert.strictEqual(ALS.formatMs(87887), '01:27:887');
});

test('time signature enum decoding', () => {
  for (const [v, l] of [[201, '4/4'], [200, '3/4'], [302, '6/8'], [303, '7/8'], [99, '1/2'], [212, '15/4']]) {
    assert.strictEqual(ALS.decodeTimeSignature(v).label, l);
  }
});

test('modern envelope layout through gzip: markers, step + ramp, anchors, signatures', async () => {
  const gz = zlib.gzipSync(Buffer.from(modern));
  const r = ALS.analyze(parse(await ALS.decompress(toArrayBuffer(gz))));
  assert.strictEqual(ALS.renderMarkers(r), 'Intro -> 00:00:000\nCoro Final -> 00:08:773');
  assert.strictEqual(ALS.renderTempo(r, { anchors: true, smoothRamps: false }), '120.0000 -> 00:00:000\n120.0000 -> 00:03:999\n60.0000 -> 00:04:000\n120.0000 -> 00:06:773');
  assert.strictEqual(ALS.renderTempo(r, { anchors: false, smoothRamps: false }), '120.0000 -> 00:00:000\n60.0000 -> 00:04:000\n120.0000 -> 00:06:773');
  assert.strictEqual(ALS.renderSigs(r), '4/4 -> 00:00:000\n3/4 -> 00:04:000\n6/8 -> 00:06:773');
});

test('MainTrack with legacy ArrangerAutomation', () => {
  const xml = `<Ableton Creator="x"><LiveSet><MainTrack><DeviceChain><Mixer><Tempo><Manual Value="90"/><ArrangerAutomation><Events><FloatEvent Time="0" Value="100"/><FloatEvent Time="10" Value="100"/></Events></ArrangerAutomation></Tempo></Mixer></DeviceChain></MainTrack></LiveSet></Ableton>`;
  const r = ALS.analyze(parse(xml));
  assert.strictEqual(r.masterTag, 'MainTrack');
  assert.strictEqual(r.tempoSource, 'legacy');
  assert.strictEqual(ALS.renderTempo(r, { anchors: true, smoothRamps: false }), '100.0000 -> 00:00:000\n100.0000 -> 00:06:000');
  assert.strictEqual(ALS.renderSigs(r), '');
});

test('manual tempo only, uncompressed XML, locator past the last tempo event', async () => {
  const xml = `<?xml version="1.0"?><Ableton><LiveSet><Locators><Locators><Locator><Time Value="128"/><Name Value="Puente"/></Locator></Locators></Locators><MasterTrack><DeviceChain><Mixer><Tempo><Manual Value="128"/><AutomationTarget Id="3"/></Tempo><TimeSignature><Manual Value="201"/></TimeSignature></Mixer></DeviceChain></MasterTrack></LiveSet></Ableton>`;
  const r = ALS.analyze(parse(await ALS.decompress(new TextEncoder().encode(xml).buffer)));
  assert.strictEqual(ALS.renderMarkers(r), 'Puente -> 01:00:000');
  assert.strictEqual(ALS.renderTempo(r, { anchors: true, smoothRamps: false }), '128.0000 -> 00:00:000');
  assert.strictEqual(ALS.renderSigs(r), '4/4 -> 00:00:000');
});

test('errors: no master track, not gzip', async () => {
  assert.throws(() => ALS.analyze(parse('<Ableton><LiveSet/></Ableton>')), /Master/);
  await assert.rejects(ALS.decompress(new Uint8Array([1, 2, 3, 4]).buffer), /not a valid/);
});
