# Starship Consoles — the screens

The 100 animated screens from Starship Consoles (https://starshipconsoles.com), the Mac screen saver,
as plain HTML/JavaScript, for porting to other platforms. MIT licence: see LICENSE.

## What's here
- `index.html` — every screen by department; click one to open it.
- `shuffle.html` — all of them shuffled full screen, a new one every 30 seconds (`shuffle.html?every=60`
  for a minute). Arrow keys go back and forward; click for full screen.
- `tng/<screen>.html` — one page per screen. Each loads `../lcars.js` and `../lcars.css` and nothing else:
  no network, no libraries, no build step.
- `lcars.js`, `lcars.css` — the shared kit: the 3840×2160 design grid zoomed to fit any window, the
  clock, the shapes, the random readouts.
- `catalog.json` — titles, subtitles and departments (`generation` 1–7: Bridge & Command, Engineering,
  Science, Medical, Operations & Crew, Tactical & Security, Navigation & Fleet).
- `sound/ambience.m4a` — the engine hum, looped.
- `fonts/` — Swiss 911 Ultra Compressed (the LCARS lettering) and Antonio, as files; the same fonts are
  embedded in `lcars.css` and `lcars-fonts.css`.

## Notes for a port
- The screens are built for 16:9 and look right at any size; they animate at 30 frames a second
  (`lcars.js` caps it).
- The fonts are embedded in `lcars.css` (Chrome and Edge refuse font files opened from `file://`), so
  the pages can be opened straight from the folder. If a browser still balks, serve the folder:
  `python -m http.server`, then open http://localhost:8000. A Windows screen saver can host the pages in
  WebView2 (or Electron); Wallpaper Engine's web wallpapers work too.
- Text is measured with the "LCARS" font before layout (`L.ready`), so keep the font loading.
- `sound/ambience.m4a` is the background engine hum: a seamless 3-minute loop (AAC). `shuffle.html` plays
  it from the first click or key press (browsers block sound until then); S turns it on or off.

## Licence and notices

MIT (see LICENSE) for the screens' code and designs. The fonts keep their own terms: Antonio is under the
SIL Open Font License (`fonts/OFL.txt`); Swiss 911 Ultra Compressed is a commercial Bitstream typeface.

Starship Consoles is an unofficial fan project in the style of the LCARS displays from Star Trek. It
is not affiliated with, endorsed, sponsored or licensed by Paramount, Paramount Skydance, CBS Studios,
Skydance, or anyone who owns Star Trek. Star Trek, LCARS, and the names and designs of the franchise
belong to their owners.
