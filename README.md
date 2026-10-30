# ALS Extractor

A 100% client-side web application designed for Musical Directors, programmers, and playback engineers. 

**ALS Extractor** parses compressed Ableton Live Set (`.als`) files directly in your browser to extract timeline locators, time signatures, and master track tempo automation. It mathematically converts Ableton's beat-relative data into absolute time (`MM:SS:mmm`) and exports standard MIDI files. 

This completely eliminates the need for manual data entry when preparing custom sessions for playback ecosystems like Secuencias.com / MultiTracks Cloud Pro.

The repo also includes a second tool, the **Chord Converter** (see below).

**Live:** [ALS Extractor](https://cgmerida.github.io/ALS-Extractor/) · [Chord Converter](https://cgmerida.github.io/ALS-Extractor/ChordConverter.html)

## ✨ Key Features

* **Zero-Server Processing:** Uses the browser's native gzip decompression (with `pako` as a fallback) and DOM APIs to parse the XML locally. Your `.als` files never leave your computer.
* **Smart Tempo Interpolation:** Accurately converts linear BPM ramps into absolute time.
* **Auto-Anchor Injection:** Automatically calculates `T - 1ms` anchor points to enforce immediate tempo jumps in playback software that relies on linear interpolation.
* **Direct MIDI Export:** Generates ready-to-upload `.mid` files containing all tempo, time signature, and marker meta-events.
* **Setlist Batch Processing:** Drag and drop multiple `.als` files to parse an entire weekend setlist in seconds.
* **SMPTE & Offset Support:** Built-in calculators to shift timestamps globally or view them in standard audiovisual timecode (HH:MM:SS:FF).

## 🚀 How to Use

1. Drag and drop your `.als` file into the upload zone.
2. Review the extracted Markers, Tempo Automation, and Time Signatures in the dashboard.
3. Click **Export MIDI** to download the generated `.mid` file.
4. Upload the MIDI file to your preferred playback cloud platform to instantly map your song's structure.

## 🎸 Chord Converter

`ChordConverter.html` turns a chords-over-lyrics chart into MultiTracks' inline `[bracketed]` chord format, for example:

```
VERSO 1                          VERSO 1
B                     E    →     [B] Vi caer al enemigo [E]
 Vi caer al enemigo
```

* **Paste and go:** the output updates as you type; each section becomes a card.
* **Copy section by section:** click a card (or **Copy next**) to copy it *without* its name, ready to paste into a MultiTracks section; **Copy all** copies the whole chart with names. Check marks show what you've copied and survive edits to other sections.
* **Understands real charts:** section names in English or Spanish, with numbers, `x2` or notes (`CORO (Final)`, `Verso 1 - Tono B`), bracketed names (`[Estribillo]`), names and chords on one line (`[Salida] E G# E`), `( )` / `|` / `x2` around chords, tabs, and slash or extended chords (`E/G#`, `Cmaj7#11`, `Dm7b5`).
* **Flags likely typos:** a chord line with one unrecognized chord (e.g. `B Hm7 G#m`) is left as text, listed under **Check These Lines**, and marked on its card. Click it to jump to the line in the input.
* **Linked panels:** the output line made from the input line under your cursor is highlighted.

## 🧪 Tests

```
npm ci
npm test
```

Tests live in `tests/` (`.als` fixtures in `tests/fixtures/`) and load the logic straight out of the HTML files (`<script id="core">`), so there is no build step.

## 🛠 Tech Stack

* Vanilla JavaScript (ES6+)
* HTML5 / CSS3 (Tailwind CSS)
* Native `DecompressionStream`, with [pako](https://github.com/nodeca/pako) loaded only as a fallback (gzip extraction)
* MIDI files are written by the app itself (no MIDI library)
* [JSZip](https://github.com/Stuk/jszip) & [FileSaver.js](https://github.com/eligrey/FileSaver.js) (for MIDI downloads and batch exporting)
* Tests: Node's built-in test runner, with `@xmldom/xmldom`, `midi-file`, `jszip` and `pako` as dev dependencies
