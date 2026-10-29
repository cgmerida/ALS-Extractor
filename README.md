# ALS Extractor

A 100% client-side web application designed for Musical Directors, programmers, and playback engineers. 

**ALS Extractor** parses compressed Ableton Live Set (`.als`) files directly in your browser to extract timeline locators, time signatures, and master track tempo automation. It mathematically converts Ableton's beat-relative data into absolute time (`MM:SS:mmm`) and exports standard MIDI files. 

This completely eliminates the need for manual data entry when preparing custom sessions for playback ecosystems like Secuencias.com / MultiTracks Cloud Pro.

## ✨ Key Features

* **Zero-Server Processing:** Uses `pako` and native DOM APIs to decompress and parse XML data locally. Your `.als` files never leave your computer.
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

## 🛠 Tech Stack

* Vanilla JavaScript (ES6+)
* HTML5 / CSS3 (Tailwind CSS)
* [pako](https://github.com/nodeca/pako) (for zlib port / gzip extraction)
* [midi-writer-js](https://github.com/grimmdude/MidiWriterJS) (for MIDI generation)
* [JSZip](https://github.com/Stuk/jszip) & [FileSaver.js](https://github.com/eligrey/FileSaver.js) (for batch exporting)
