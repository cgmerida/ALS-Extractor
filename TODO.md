# TODO

## V2 follow-ups
- [ ] **Secuencias dropdown lists.** Send the options of the Sections and Time Changes dropdowns. The linter's `SECTION_NAMES` should be exactly the Sections list (a name not in it can't be picked), and the signature list shows which signatures Secuencias supports. Also check how many BPM decimals the Tempo Changes field accepts (the app copies 4, e.g. `68.5551`).
- [x] **Copy one by one.** Each card is a list with per-value copy buttons, "Copy next" (tempo alternates BPM and time) and check marks per song. Verified in headless Chromium: copy order, clipboard contents, offset changes clearing check marks, per-song progress, no console errors.
- [ ] **Browser check of V2 (remaining, in real Chrome).** Drop 2+ sets at once, switch tabs, change offset/format/anchors/smooth ramps/skip blank, Export MIDI, Download All (ZIP), copy buttons. Report anything odd. Also: type `2,5` and `2e` in Offset (the first works, the second shows a red note); untick a toggle, reload, and confirm the output still matches the toolbar; ZIP button reads "Loading n/m…" while a setlist loads.
- [ ] **Smooth ramps in Secuencias.** Paste the smoothed tempo of `Build My Life` (6 lines, 06:22:270 → 06:24:152) and check the slowdown sounds/looks right. Long ramps get ~1 point per beat (64-beat ramp ≈ 63 extra lines); if that is too many to paste, raise `SMOOTH_TOLERANCE_MS` in `index.html`.
- [ ] **Secuencias MIDI import.** Import the exported `.mid` of `Build My Life` (not `MultiTrack`: its stepped tempo gives the same result either way, so it can't tell the two apart) and check `Ending`. 06:24:169 means Secuencias steps MIDI tempo like a standard player (exact). About 06:24:188 means it interpolates between tempo events; the export is then a few tens of ms off after a ramp. That's acceptable, but worth knowing.
- [ ] **Accents in MIDI markers.** Marker text is written as UTF-8. Check that a name with accents/ñ shows correctly after import.
- [ ] **Section-name standard.** The linter's list (`SECTION_NAMES` / `NAME_SUGGESTIONS` in `index.html`) is a sensible default, not an official Secuencias list. Replace it if Secuencias publishes one.
- [ ] **GitHub Pages.** Push to a repo, set Settings → Pages → Source to "GitHub Actions". Decide whether `tests/fixtures/*.als` may be public (a public repo exposes them even though the site doesn't).

## Earlier items
- [ ] **Curved tempo ramps (Live 11+).** First decide whether your sets use them at all; if not, the existing warning is enough. If yes, provide a test set: 120 BPM at bar 1 → 90 BPM at bar 9, curve the segment (Alt/Option-drag), a locator at bar 13, and the min:sec time Ableton shows for that locator.
- [ ] **Other time signatures.** Find an `.als` with several changes (e.g. 4/4 → 3/4 → 6/8 or 7/8), a locator at each change, and the times Ableton shows. Confirms the `(num − 1) + 99·log2(den)` decoding; only 4/4 (201) is verified so far.
- [ ] **Live 11.** Assumed to work (same layout as 12 with `<MasterTrack>`); report if a real Live 11 set fails.
- [x] **Regression tests.** `npm test` — tests in `tests/`, fixtures in `tests/fixtures/`. When a new `.als` turns up (time signatures, curves, Live 11), add it there with a test.

## Closed
- Tempo before the first change — checked by the user on their data, no action.
- Tailwind CDN warning — kept on purpose: the app has no build step (V2 requirement) and GitHub Pages serves it as-is. The warning is cosmetic.
