// Loads the DOM-agnostic core (<script id="core">) out of index.html so it can run under Node.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DOMParser } = require('@xmldom/xmldom');
const { parseMidi } = require('midi-file');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const mod = { exports: {} };
new Function('module', core)(mod);
const ALS = mod.exports;

const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

async function loadFixture(name) {
  const xml = await ALS.decompress(toArrayBuffer(fixture(name)));
  return { xml, result: ALS.analyze(parse(xml)) };
}

// Everything the user copies out of the three cards, in one string.
const renderAll = (r) => [
  '--- markers', ALS.renderMarkers(r),
  '--- tempo', ALS.renderTempo(r, { anchors: true }),
  '--- sigs', ALS.renderSigs(r),
].join('\n');

// Reads a .mid back with an independent parser and integrates its tempo events to milliseconds,
// i.e. what any standard MIDI player would compute.
function midiTimeline(bytes) {
  const midi = parseMidi(Buffer.from(bytes));
  const ppq = midi.header.ticksPerBeat;
  const out = { header: midi.header, tempos: [], markers: [], sigs: [], names: [] };
  let tick = 0, us = 0, usPerQ = 500000;
  // midi-file decodes text byte-by-byte; re-decode as the UTF-8 we wrote.
  const text = (s) => Buffer.from(s, 'latin1').toString('utf8');
  for (const e of midi.tracks[0]) {
    tick += e.deltaTime;
    us += e.deltaTime * usPerQ / ppq;
    const ms = us / 1000;
    if (e.type === 'setTempo') { out.tempos.push({ tick, ms, bpm: 60e6 / e.microsecondsPerBeat }); usPerQ = e.microsecondsPerBeat; }
    else if (e.type === 'marker') out.markers.push({ tick, ms, text: text(e.text) });
    else if (e.type === 'timeSignature') out.sigs.push({ tick, ms, label: `${e.numerator}/${e.denominator}` });
    else if (e.type === 'trackName') out.names.push(text(e.text));
  }
  return out;
}

function assertMarkersMatch(r, o, midi) {
  const expected = ALS.markerRows(r, o).rows;
  assert.strictEqual(midi.markers.length, expected.length, 'marker count');
  midi.markers.forEach((m, i) => {
    assert.strictEqual(m.text, expected[i].name.replace(/[\r\n]+/g, ' '));
    assert(Math.abs(m.ms - expected[i].ms) < 1, `"${m.text}": MIDI ${m.ms.toFixed(3)} ms vs text ${expected[i].ms} ms`);
  });
}

module.exports = { ALS, html, parse, toArrayBuffer, fixture, loadFixture, renderAll, midiTimeline, assertMarkersMatch };
