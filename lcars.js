/* LCARS kit — shared by every screen.
 *
 * Built for a screensaver that runs on three 6K displays at once, so the cost of
 * every moving thing is decided here:
 *   - One clock at 30 fps. Every animation is written against time, not frames.
 *   - Things that move are their own composited layers (L.layer): moving or fading
 *     them never repaints anything.
 *   - Text that changes (the readouts) is changed a few cells at a time, a few
 *     times a second, as real LCARS readouts do.
 *   - The frame (elbows, bars) is drawn once.
 */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  // ---------- shapes: which canvas this screen is laid out on ----------
  // Every screen has the wide layout (3840×2160). A screen may offer more in its <head>:
  //   <meta name="lcars-shapes" content="upright ultrawide">
  // and then builds the layout for L.shape. The shape that fills the window best is chosen when
  // the page loads; if the window later changes shape enough, the page is rebuilt (the iPad app
  // does that itself, with a crossfade). Keep SHAPES in step with ConsoleShape.swift (a test checks).
  const SHAPES = { upright: [2160, 3120], wide: [3840, 2160], ultrawide: [5040, 2160] };
  const offerMeta = document.querySelector('meta[name="lcars-shapes"]');
  const offered = ["wide", ...(offerMeta ? offerMeta.content.split(/[\s,]+/) : []).filter((s) => SHAPES[s] && s !== "wide")];
  const winSize = () => window.__lcarsWindow || [innerWidth, innerHeight];   // the app passes the real window
  const fills = (s, [w, h]) => { if (!(w > 0 && h > 0)) return s === "wide" ? 1 : 0; const r = w / h, c = SHAPES[s][0] / SHAPES[s][1]; return Math.min(r / c, c / r); };
  const bestShape = (size) => offered.reduce((a, s) =>
    fills(s, size) > fills(a, size) || (fills(s, size) === fills(a, size) && SHAPES[s][0] > SHAPES[a][0]) ? s : a, "wide");
  const forced = (location.search.match(/[?&]shape=(\w+)/) || [])[1];   // dev: ?shape=upright
  const form = forced && offered.includes(forced) ? forced : bestShape(winSize());
  const [W, H] = SHAPES[form];
  const L = (window.LCARS = { W, H, zoom: 1, shape: form, shapes: offered });
  const shapes = [];                                  // static shapes, for the layout audit
  const shape = (x, y, w, h, el, panel, noalign) => shapes.push({ x, y, w, h, el, panel, noalign });
  const headers = [];                                 // section headers, for the audit's header rule

  const stage = document.createElement("div");
  stage.id = "stage";
  document.body.appendChild(stage);
  L.stage = stage;

  const frame = document.createElementNS(NS, "svg");
  frame.id = "frame";
  frame.setAttribute("viewBox", `0 0 ${W} ${H}`);
  stage.appendChild(frame);
  L.frame = frame;
  if (form !== "wide") {                              // lcars.css sizes both for the wide canvas
    for (const e of [stage, frame]) { e.style.width = W + "px"; e.style.height = H + "px"; }
  }

  // The iPad app's viewport lays the canvas out at zoom 1 (iOS draws CSS-zoomed text wrongly):
  // width = the canvas width, or wider for a wider window. The app guesses the shape; the page
  // knows it, so it sets the width itself, now and whenever the app reports a new window size.
  const setViewport = ([w, h]) => {
    const m = document.getElementById("consoles-viewport");
    if (m && w > 0 && h > 0) m.content = `width=${Math.ceil(Math.max(W, (H * w) / h))},user-scalable=no,viewport-fit=cover`;
  };
  L.viewport = (w, h) => { window.__lcarsWindow = [w, h]; setViewport([w, h]); };
  if (window.__lcarsWindow) setViewport(window.__lcarsWindow);
  let reshape;
  addEventListener("resize", () => {                  // rebuild in the shape that now fits best
    // the app rebuilds it itself; a page in a frame is the parent page's to replace (a reload there
    // fires the frame's load event again, which the public shuffle page takes for a new screen)
    if (window.__lcarsNative || forced || window.top !== window) return;
    clearTimeout(reshape);
    reshape = setTimeout(() => { if (bestShape(winSize()) !== form) location.reload(); }, 600);
  });

  // ---------- fitting the design to the display ----------
  const onFit = [];
  function fit() {
    const z = Math.min(innerWidth / W, innerHeight / H);
    L.zoom = z;
    stage.style.zoom = z;
    stage.style.left = (innerWidth - W * z) / 2 / z + "px";
    stage.style.top = (innerHeight - H * z) / 2 / z + "px";
    for (const f of onFit) f(z);
  }
  addEventListener("resize", fit);

  // ---------- the clock ----------
  const tasks = [];
  let last = -1e9, t0 = null;
  L.t = 0;
  L.tick = (f) => tasks.push(f);                    // every frame, f(t) — t in seconds
  L.every = (ms, f, jitter = 0.35) => {             // now and then, f(t)
    let next = 0;
    tasks.push((t) => {
      if (t * 1000 < next) return;
      next = t * 1000 + ms * (1 + (Math.random() * 2 - 1) * jitter);
      f(t);
    });
  };
  function loop(now) {
    requestAnimationFrame(loop);
    // 30 fps on a 60 or 120 Hz display. window.__lcarsFrameMs is set only by the Apple TV recorder
    // (PreviewApp/Record.swift --fps 60), for a screen whose slow motion stepped visibly on a TV.
    if (now - last < (window.__lcarsFrameMs || 1000 / 30) - 4) return;
    last = now;
    if (t0 === null) t0 = now;
    const t = (L.t = (now - t0) / 1000);
    for (const f of tasks) f(t);
  }

  // ---------- random readouts ----------
  L.rand = (a, b) => a + Math.random() * (b - a);
  L.irand = (a, b) => Math.floor(L.rand(a, b + 1));
  L.pick = (a) => a[Math.floor(Math.random() * a.length)];
  L.digits = (n) => { let s = String(L.irand(1, 9)); while (s.length < n) s += L.irand(0, 9); return s; };
  L.code = () => `${L.irand(1, 99)}-${L.digits(L.irand(3, 5))}`;
  L.ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  L.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  L.mix = (a, b, k) => a + (b - a) * k;

  // ---------- building ----------
  L.el = (tag, cls, parent = stage, css = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.assign(e.style, css);
    parent.appendChild(e);
    return e;
  };
  const px = (v) => (typeof v === "number" ? v + "px" : v);
  const place = (e, o) => {
    for (const k of ["x", "y", "w", "h"]) if (o[k] !== undefined)
      e.style[{ x: "left", y: "top", w: "width", h: "height" }[k]] = px(o[k]);
  };

  /** A button or bar: {x,y,w,h,c,label,r:'l'|'r'|'lr'|null,fs,cls} */
  L.box = (o, parent = stage) => {
    const e = L.el("div", "bx boot " + (o.cls || ""), parent);
    place(e, o);
    e.style.background = col(o.c);
    const r = o.h / 2;
    if (o.r === "l") e.style.borderRadius = `${r}px 0 0 ${r}px`;
    if (o.r === "r") e.style.borderRadius = `0 ${r}px ${r}px 0`;
    if (o.r === "lr") e.style.borderRadius = `${r}px`;
    if (o.r === "r" || o.r === "lr") e.style.paddingRight = Math.max(22, r * 0.85) + "px";   // clear of the curve
    if (o.fs) e.style.fontSize = o.fs + "px";
    if (o.label !== undefined) e.textContent = o.label;
    if (parent === stage) shape(o.x, o.y, o.w, o.h, e);
    return e;
  };

  // Swiss 911 Ultra Compressed, measured: with line-height 1, capitals run from 0.11 to 0.83 of
  // the size below the top of the line. So text can be placed by its baseline or its cap top.
  L.CAP_TOP = 0.11; L.BASELINE = 0.83;

  /** Free text: {x, y | base | cap, s(size), c, txt, align:'r'|'l'|'c', w, on}
   *  y: top of the line; base: the baseline; cap: the top of the capitals. For 'r', x is the right edge.
   *  on: printed on a shape on purpose (the layout audit then leaves it alone). */
  L.text = (o, parent = stage) => {
    const e = L.el("div", "t boot " + (o.cls || ""), parent);
    e.style.fontSize = o.s + "px";
    e.style.color = o.c ? (o.c.startsWith("#") ? o.c : `var(--${o.c})`) : "";
    const y = o.base !== undefined ? o.base - L.BASELINE * o.s : o.cap !== undefined ? o.cap - L.CAP_TOP * o.s : o.y;
    e.style.top = y + "px";
    // rightIn: inside a layer, align to the parent's own right edge (x measured from its left)
    const pw = o.rightIn ? parseFloat(parent.style.width) : W;
    if (o.align === "r") e.style.right = (o.rightIn ? pw - o.x : W - o.x) + "px";
    else if (o.align === "c") { e.style.left = o.x - (o.w || 2000) / 2 + "px"; e.style.width = (o.w || 2000) + "px"; e.style.textAlign = "center"; }
    else e.style.left = o.x + "px";
    if (o.ls) e.style.letterSpacing = o.ls + "px";
    if (o.on) e.dataset.on = "1";                     // deliberately printed on a shape
    if (o.legend) e.dataset.legend = "1";             // a small legend (scale numbers): exempt from the size rule
    e.textContent = o.txt;
    return e;
  };

  /** Run the layout once the LCARS font is in, so text can be measured. */
  L.ready = (build) => document.fonts.load('100px "LCARS"').then(() => { build(); L.start(); });
  const measure = document.createElement("canvas").getContext("2d");
  /** Width of a line of text at size s, as drawn (upper case, the LCARS font). */
  L.textWidth = (txt, s) => { measure.font = `${s}px "LCARS"`; return measure.measureText(String(txt).toUpperCase()).width; };
  /** A title whose capitals exactly fill a bar's height, right-aligned at x.
   *  {x, y (the bar's top), h (the bar's height), txt, c}. Returns where the title starts. */
  L.title = (o) => {
    const s = o.h / (L.BASELINE - L.CAP_TOP);
    const e = L.text({ x: o.x, cap: o.y, s, c: o.c, txt: o.txt, align: "r" });
    e.dataset.title = "1";
    return o.x - e.offsetWidth;                       // as drawn (canvas measureText ran ~11px wide)
  };
  /** A title placed by its left edge. Returns where it ends. */
  L.titleLeft = (o) => {
    const s = o.h / (L.BASELINE - L.CAP_TOP);
    const e = L.text({ x: o.x, cap: o.y, s, c: o.c, txt: o.txt });
    e.dataset.title = "1";
    return o.x + e.offsetWidth;
  };
  /** Set an element's text only when it changes (every write repaints). */
  L.set = (e, txt) => { txt = String(txt); if (e.textContent !== txt) e.textContent = txt; };
  /** A section header: a rounded label box, then a bar one gap on, to the column's edge.
   *  {x, y, w (whole width), label, c1, c2, h = 56, fs = 32, lw (box width; default fits the label)} */
  L.header = (o) => {
    const h = o.h || 56, fs = o.fs || (h >= 56 ? 32 : 28);
    const lw = o.lw || Math.ceil(L.textWidth(o.label, fs) + 88);
    L.box({ x: o.x, y: o.y, w: lw, h, c: o.c1, label: o.label, fs, r: "l" });
    const bar = L.rect({ x: o.x + lw + L.GAP, y: o.y, w: o.w - lw - L.GAP, h, c: o.c2 });
    headers.push({ x: o.x, y: o.y, w: o.w, h, el: bar, label: o.label });   // for the audit's header rule
    return lw;
  };

  /** The frame, in one call. type "A" (sidebar left, title top right), "B" (mirrored),
   *  "C" (bracket: narrow sidebars both sides, title centred), "D" (wide: no sidebar).
   *  {type, title, c (main colour), c2 (bottom/second colour), accent, side: [[h, c, label], …],
   *   side2 (C only: the right-hand sidebar, so the two don't repeat; defaults to side),
   *   foot (label on the bottom elbow)} — returns the content box {x0, x1, y0, y1}.
   *  Drawn for L.shape: ultrawide is the wide frame stretched (right-hand pieces move out by
   *  D = W − 3840); upright is taller (bottom pieces move down by Y = H − 2160) with shorter
   *  elbows and bars, and leaves out the accent piece beside the title when the title is long. */
  L.frame = (o) => {
    const BAR = 64, c = o.c, c2 = o.c2 || o.c, acc = o.accent || c2, G = L.GAP;
    const U = form === "upright", D = W - 3840, Y = H - 2160;
    const sideBoxes = (x, w, side = o.side) => {
      let y = 298;
      const hs = side || [[140, acc, ""], [70, c2, ""], [420, c, ""], [70, acc, ""], [300, c2, ""], [70, acc, ""], [216, c, ""]];
      const total = hs.reduce((a, h) => a + h[0], 0) + 8 * (hs.length - 1), k = (1632 + Y - 298) / total;
      hs.forEach(([h, col, label], i) => {
        const hh = i === hs.length - 1 ? 1632 + Y - y : Math.round(h * k);
        L.box({ x, y, w, h: hh, c: col, label, fs: w < 200 ? 30 : 40 });
        y += hh + 8;
      });
    };
    // upright: the accent piece and the bar between x0 and x1 on the top row, or just the bar if short
    const topRow = (x0, x1, accFirst = true) => {
      if (x1 - x0 >= 420) {
        if (accFirst) { L.rect({ x: x0, y: 40, w: 180, h: BAR, c: acc }); L.rect({ x: x0 + 180 + G, y: 40, w: x1 - (x0 + 180 + G), h: BAR, c }); }
        else { L.rect({ x: x0, y: 40, w: x1 - 180 - G - x0, h: BAR, c }); L.rect({ x: x1 - 180, y: 40, w: 180, h: BAR, c: acc }); }
      } else if (x1 - x0 >= 60) L.rect({ x: x0, y: 40, w: x1 - x0, h: BAR, c });
    };
    const bottom = (pieces) => pieces.forEach(([x, w, col]) => L.rect({ x, y: 2056 + Y, w, h: BAR, c: col }));
    if (o.type === "A" || !o.type) {
      L.box({ x: 3724 + D, y: 40, w: 92, h: BAR, c, r: "r" });
      const tl = L.title({ x: 3724 + D - G, y: 40, h: BAR, c, txt: o.title });
      L.elbow({ corner: "tl", x: 40, y: 40, w: U ? 640 : 1360, h: 250, bw: 240, bh: BAR, R: 150, r: 60, c });
      if (U) topRow(680 + G, tl - G);
      else {
        L.rect({ x: 1400 + G, y: 40, w: 300, h: BAR, c: acc });
        L.rect({ x: 1724 + G, y: 40, w: tl - G - (1724 + G), h: BAR, c });
      }
      sideBoxes(40, 240);
      L.elbow({ corner: "bl", x: 40, y: 1640 + Y, w: U ? 900 : 1500, h: 480, bw: 240, bh: BAR, R: 150, r: 60, c: c2 });
      if (o.foot) L.text({ x: 258, base: 1712 + Y, s: 40, c: "#000", txt: o.foot, align: "r", on: true });
      bottom(U ? [[940 + G, 420, acc], [1384 + G, 3724 + D - G - (1384 + G), c2]]
               : [[1540 + G, 600, acc], [2164 + G, 900, c], [3088 + G, 3724 + D - G - (3088 + G), c2]]);
      L.box({ x: 3724 + D, y: 2056 + Y, w: 92, h: BAR, c, r: "r" });
      return { x0: 330, x1: 3816 + D, y0: 140, y1: 2010 + Y };
    }
    if (o.type === "B") {
      const ex = U ? 3816 + D - 640 : 2600 + D, ew = U ? 640 : 1216;
      L.box({ x: 40, y: 40, w: 92, h: BAR, c, r: "l" });
      const tr = L.titleLeft({ x: 132 + G, y: 40, h: BAR, c, txt: o.title });
      if (U) topRow(tr + G, ex - G);
      else {
        L.rect({ x: tr + G, y: 40, w: 320, h: BAR, c: acc });
        L.rect({ x: tr + 320 + 2 * G, y: 40, w: ex - G - (tr + 320 + 2 * G), h: BAR, c });
      }
      L.elbow({ corner: "tr", x: ex, y: 40, w: ew, h: 250, bw: 240, bh: BAR, R: 150, r: 60, c });
      sideBoxes(3576 + D, 240);
      L.elbow({ corner: "br", x: ex, y: 1640 + Y, w: ew, h: 480, bw: 240, bh: BAR, R: 150, r: 60, c: c2 });
      if (o.foot) L.text({ x: 3794 + D, base: 1712 + Y, s: 40, c: "#000", txt: o.foot, align: "r", on: true });
      L.box({ x: 40, y: 2056 + Y, w: 92, h: BAR, c: c2, r: "l" });
      bottom(U ? [[132 + G, 420, acc], [132 + 2 * G + 420, ex - G - (132 + 2 * G + 420), c2]]
               : [[132 + G, 700, acc], [132 + 2 * G + 700, 900, c], [132 + 3 * G + 1600, ex - G - (132 + 3 * G + 1600), c2]]);
      return { x0: 40, x1: 3520 + D, y0: 140, y1: 2010 + Y };
    }
    if (o.type === "C") {
      // a bracket: the title centred in the top bar, elbows down both sides, narrow sidebars
      const ew = U ? 400 : 900, rx = 3800 + D - ew;
      const t = L.text({ x: 0, cap: 40, s: BAR / (L.BASELINE - L.CAP_TOP), c, txt: o.title });
      const ink = t.offsetWidth;
      t.style.left = W / 2 - ink / 2 + "px";
      t.dataset.title = "1";
      const l = W / 2 - ink / 2 - G, rr = W / 2 + ink / 2 + G;
      // upright with a long title: no room for the accent pieces, so the elbows reach the title
      const reach = U && l - (40 + ew + G) < 60;
      L.elbow({ corner: "tl", x: 40, y: 40, w: reach ? l - 40 : ew, h: 250, bw: 140, bh: BAR, R: 120, r: 50, c });
      if (!reach) L.rect({ x: 40 + ew + G, y: 40, w: l - (40 + ew + G), h: BAR, c: acc });
      if (!reach) L.rect({ x: rr, y: 40, w: rx - G - rr, h: BAR, c: acc });
      L.elbow({ corner: "tr", x: reach ? rr : rx, y: 40, w: reach ? 3800 + D - rr : ew, h: 250, bw: 140, bh: BAR, R: 120, r: 50, c });
      sideBoxes(40, 140); sideBoxes(3660 + D, 140, o.side2 || o.side);
      L.elbow({ corner: "bl", x: 40, y: 1640 + Y, w: ew, h: 480, bw: 140, bh: BAR, R: 120, r: 50, c: c2 });
      L.elbow({ corner: "br", x: rx, y: 1640 + Y, w: ew, h: 480, bw: 140, bh: BAR, R: 120, r: 50, c: c2 });
      const m = U ? 420 : 900;
      bottom([[40 + ew + G, m, acc], [40 + ew + 2 * G + m, rx - G - (40 + ew + 2 * G + m), c]]);
      if (o.foot) L.text({ x: 158, base: 1712 + Y, s: 34, c: "#000", txt: o.foot, align: "r", on: true });
      return { x0: 220, x1: 3620 + D, y0: 140, y1: 2010 + Y };
    }
    // "D": wide — caps and bars top and bottom, no sidebars
    L.box({ x: 40, y: 40, w: 92, h: BAR, c, r: "l" });
    const tr = L.titleLeft({ x: 132 + G, y: 40, h: BAR, c, txt: o.title });
    if (U) topRow(tr + G, 3724 + D - G);
    else {
      L.rect({ x: tr + G, y: 40, w: 360, h: BAR, c: acc });
      L.rect({ x: tr + 360 + 2 * G, y: 40, w: 3724 + D - G - (tr + 360 + 2 * G), h: BAR, c });
    }
    L.box({ x: 3724 + D, y: 40, w: 92, h: BAR, c, r: "r" });
    L.box({ x: 40, y: 2056 + Y, w: 92, h: BAR, c: c2, r: "l" });
    bottom(U ? [[132 + G, 600, c2], [132 + 2 * G + 600, 3724 + D - G - (132 + 2 * G + 600), c]]
             : [[132 + G, 1100, c2], [132 + 2 * G + 1100, 600, acc], [132 + 3 * G + 1700, 3724 + D - G - (132 + 3 * G + 1700), c]]);
    L.box({ x: 3724 + D, y: 2056 + Y, w: 92, h: BAR, c: c2, r: "r" });
    return { x0: 40, x1: 3816 + D, y0: 140, y1: 2010 + Y };
  };
  L.GAP = 24;                                         // the gap between a title and its bar, between segments

  /** A composited layer — free to move and fade. */
  L.layer = (o, parent = stage) => {
    const e = L.el("div", "layer " + (o.cls || ""), parent);
    place(e, o);
    return e;
  };
  L.move = (e, x, y, rot = 0, sc = 1) => {
    e.style.transform = `translate3d(${x}px,${y}px,0)` + (rot ? ` rotate(${rot}deg)` : "") + (sc !== 1 ? ` scale(${sc})` : "");
  };

  /** Columns of numbers that tick. cols: [{w, n, c?}] (n digits; 0 = blank), rows: count. */
  L.numbers = (o, parent = stage) => {
    const e = L.el("div", "num boot", parent);
    place(e, o);
    e.style.fontSize = o.s + "px";
    e.style.color = `var(--${o.c || "sky"})`;
    const cells = [];
    for (let r = 0; r < o.rows; r++) {
      const row = L.el("div", "r", e);
      if (o.rowColors) row.style.color = `var(--${o.rowColors[r % o.rowColors.length]})`;
      for (const col of o.cols) {
        const s = L.el("span", "", row);
        s.style.width = col.w + "px";
        if (col.c) s.style.color = `var(--${col.c})`;
        const blank = Math.random() < (o.blank || 0);
        s.textContent = !col.n || blank ? "" : L.digits(col.n);
        if (col.n) cells.push({ s, n: col.n, blankable: !!o.blank });
      }
    }
    e.tick = (k = 1) => {
      for (let i = 0; i < k; i++) {
        const cell = L.pick(cells);
        cell.s.textContent = cell.blankable && Math.random() < 0.15 ? "" : L.digits(cell.n);
      }
    };
    return e;
  };

  // ---------- the frame: SVG drawn once ----------
  L.svg = (tag, attrs, parent = frame) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };
  const col = (c) => (c.startsWith("#") ? c : `var(--${c})`);
  /** An elbow. corner: which corner the curve is in ('tl','tr','bl','br').
   *  w,h: outer size. bw: width of the vertical arm. bh: height of the horizontal arm.
   *  R: outer radius. r: inner radius. */
  L.elbow = (o, parent = frame) => {
    const { w, h, bw, bh } = o, R = o.R ?? Math.min(bw, h) * 0.9, r = o.r ?? Math.min(bh, bw) * 0.6;
    const d = `M${w},0 H${R} A${R},${R} 0 0 0 0,${R} V${h} H${bw} V${bh + r} A${r},${r} 0 0 1 ${bw + r},${bh} H${w} Z`;
    const sx = o.corner[1] === "r" ? -1 : 1, sy = o.corner[0] === "b" ? -1 : 1;
    const tx = o.x + (sx < 0 ? w : 0), ty = o.y + (sy < 0 ? h : 0);
    const p = L.svg("path", { d, fill: col(o.c), transform: `translate(${tx},${ty}) scale(${sx},${sy})`, class: "boot" }, parent);
    if (parent === frame) {                           // its two arms
      shape(sx > 0 ? o.x : o.x + w - bw, o.y, bw, h, p);
      shape(o.x, sy > 0 ? o.y : o.y + h - bh, w, bh, p);
    }
    return p;
  };
  L.rect = (o, parent = frame) => {
    const e = L.svg("rect", { x: o.x, y: o.y, width: o.w, height: o.h, rx: o.rx || 0, fill: col(o.c), class: o.boot === false ? "" : "boot" }, parent);
    if (parent === frame && !o.free) shape(o.x, o.y, o.w, o.h, e, o.panel, o.noalign);   // panel: text may sit inside it
    return e;
  };
  /** Ring segment path: centre, inner/outer radius, start/end angle in degrees (0 = up, clockwise). */
  L.arc = (cx, cy, r1, r2, a0, a1) => {
    const p = (r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
    const big = a1 - a0 > 180 ? 1 : 0;
    const [x1, y1] = p(r2, a0), [x2, y2] = p(r2, a1), [x3, y3] = p(r1, a1), [x4, y4] = p(r1, a0);
    return `M${x1},${y1} A${r2},${r2} 0 ${big} 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 ${big} 0 ${x4},${y4} Z`;
  };

  // ---------- canvases sized to the display's real pixels ----------
  L.canvas = (o, parent = stage) => {
    const cv = L.el("canvas", "boot " + (o.cls || ""), parent, { position: "absolute" });
    place(cv, o);
    if (parent === stage) shape(o.x, o.y, o.w, o.h, cv, o.panel);
    const g = cv.getContext("2d");
    const c = { cv, g, w: o.w, h: o.h, k: 1, onResize: null };
    onFit.push((z) => {
      const k = z * (devicePixelRatio || 1);
      cv.width = Math.round(o.w * k); cv.height = Math.round(o.h * k);
      c.k = k; g.setTransform(k, 0, 0, k, 0, 0);
      if (c.onResize) c.onResize();
    });
    return c;
  };

  /** A field of stars on a canvas, drawn once. */
  L.stars = (c, n, colors = ["#7f9cff", "#5c7dff", "#c9d6ff", "#ffffff"], maxR = 3.2) => {
    const pts = Array.from({ length: n }, () => [Math.random() * c.w, Math.random() * c.h, Math.random() ** 3 * maxR + 0.8, L.pick(colors)]);
    c.onResize = () => {
      c.g.clearRect(0, 0, c.w, c.h);
      for (const [x, y, r, cl] of pts) { c.g.fillStyle = cl; c.g.beginPath(); c.g.arc(x, y, r, 0, 7); c.g.fill(); }
    };
    return pts;
  };


  // ---------- layout audit (dev only: run by tools/lcars-shot.swift, never by the saver) ----------
  // Every piece of text, measured by its glyphs, against every static shape and every other text.
  // Returns a list of problems in plain words; an empty list is a pass.
  L.audit = (gap = 14, curves = false) => {
    const z = L.zoom, sr = stage.getBoundingClientRect();
    const cv = document.createElement("canvas").getContext("2d");
    cv.font = '100px "LCARS"';
    // LCARS text is all capitals: measure by the capitals and figures, not the tails of Q and J
    const m = cv.measureText("0123456789ABCDEFGHIKLMNOPRSTUVWXYZ");
    const fa = m.fontBoundingBoxAscent, ca = m.actualBoundingBoxAscent, cd = Math.max(0, m.actualBoundingBoxDescent);
    const ink = (el) => {                               // glyph boxes, one per line, in design px
      const out = [], fs = parseFloat(getComputedStyle(el).fontSize) / 1;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        const k = parseFloat(getComputedStyle(n.parentElement).fontSize) / 100;
        const lines = new Map();                        // WebKit can split one line into several rects
        for (const b of r.getClientRects()) {
          const key = Math.round(b.top), l = lines.get(key);
          if (!l) lines.set(key, { left: b.left, right: b.right, top: b.top });
          else { l.left = Math.min(l.left, b.left); l.right = Math.max(l.right, b.right); }
        }
        for (const b of lines.values()) {
          const top = (b.top - sr.top) / z;
          out.push({ x: (b.left - sr.left) / z, y: top + (fa - ca) * k, w: (b.right - b.left) / z, h: (ca + cd) * k, txt: n.textContent.trim() });
        }
      }
      return out;
    };
    const hit = (a, b, g = 0) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
    const name = (t) => `"${t.txt.slice(0, 28)}"`;
    const issues = [];
    const inLayer = (e) => !!e.closest(".layer");
    const texts = [];
    for (const e of stage.querySelectorAll(".t, .bx, .num")) {
      if (inLayer(e)) continue;
      for (const t of ink(e)) texts.push(Object.assign(t, { el: e, bx: e.classList.contains("bx"), on: e.dataset.on, num: e.closest(".num") }));
    }
    for (const t of texts) {
      if (t.x < 16 || t.y < 8 || t.x + t.w > W - 16 || t.y + t.h > H - 8) issues.push(`${name(t)} runs off the screen`);
      if (t.bx) {                                       // a label must sit inside its button with room
        const b = shapes.find((s) => s.el === t.el);
        const rr = parseFloat(getComputedStyle(t.el).borderTopRightRadius) || 0;     // a rounded end eats room
        if (b && (t.x < b.x + 10 || t.x + t.w > b.x + b.w - Math.max(10, rr * 0.7) || t.y < b.y + 3 || t.y + t.h > b.y + b.h - 3))
          issues.push(`${name(t)} does not fit its button (${Math.round(b.w)}×${Math.round(b.h)})`);
        continue;
      }
      if (!t.on) for (const s of shapes) {
        if (s.el === t.el) continue;
        if (s.panel && hit(t, s)) {                     // inside a panel: keep a margin from its edges
          const m = Math.min(t.x - s.x, s.x + s.w - t.x - t.w, t.y - s.y, s.y + s.h - t.y - t.h);
          if (m < 16) issues.push(`${name(t)} is ${m < 0 ? "outside the edge of" : "within 16px of the edge of"} its panel at ${Math.round(s.x)},${Math.round(s.y)}`);
          continue;
        }
        if (hit(t, s)) { issues.push(`${name(t)} overlaps a shape at ${Math.round(s.x)},${Math.round(s.y)}`); break; }
        if (hit(t, s, gap)) { issues.push(`${name(t)} is within ${gap}px of a shape at ${Math.round(s.x)},${Math.round(s.y)}`); break; }
      }
    }
    // Filled SVG paths and polygons (rings, arcs, sectors) are not in `shapes`: test the text's box
    // against their real outline, point by point. Tactical's AFT sat on its shield oval unseen (2026-11-06).
    // Opt-in (LCARS_AUDIT_CURVES=1) until the other screens it flags are reviewed — some put figures
    // inside gauges on purpose.
    const svgFills = !curves ? [] : [...stage.querySelectorAll("svg path, svg polygon")].filter((e) =>
      !inLayer(e) && getComputedStyle(e).fill !== "none" && getComputedStyle(e).visibility !== "hidden");
    const svgHit = (e, x0, y0, x1, y1) => {             // design-px box; any sample point inside the fill?
      const ctm = e.getScreenCTM(); if (!ctm) return false;
      const inv = ctm.inverse();
      for (let y = y0; y <= y1 + 0.01; y += Math.min(6, y1 - y0 || 6)) for (let x = x0; x <= x1 + 0.01; x += Math.min(6, x1 - x0 || 6)) {
        const p = new DOMPoint(sr.left + x * z, sr.top + y * z).matrixTransform(inv);
        if (e.isPointInFill(p)) return true;
      }
      return false;
    };
    for (const t of texts) {
      if (t.on || t.bx) continue;
      for (const e of svgFills) {
        const b = e.getBoundingClientRect();
        const bb = { x: (b.left - sr.left) / z, y: (b.top - sr.top) / z, w: b.width / z, h: b.height / z };
        if (!hit(t, bb, gap)) continue;
        if (svgHit(e, t.x, t.y, t.x + t.w, t.y + t.h)) { issues.push(`${name(t)} overlaps a curved shape near ${Math.round(bb.x)},${Math.round(bb.y)}`); break; }
        if (svgHit(e, t.x - gap, t.y - gap, t.x + t.w + gap, t.y + t.h + gap)) { issues.push(`${name(t)} is within ${gap}px of a curved shape near ${Math.round(bb.x)},${Math.round(bb.y)}`); break; }
      }
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.el === b.el || (a.num && a.num === b.num && Math.abs(a.y - b.y) > 2)) continue;   // rows of one table
      const g = a.num && a.num === b.num ? 6 : 10;
      if (hit(a, b, g)) issues.push(`${name(a)} and ${name(b)} ${hit(a, b) ? "overlap" : "are too close"}`);
    }
    for (const e of stage.querySelectorAll(".num span")) {   // a reading wider than its column
      if (e.scrollWidth > e.clientWidth + 1) issues.push(`"${e.textContent}" is wider than its column`);
    }
    // ---- titles sit exactly one gap from the bar beside them ----
    // A title is text set in a row of bars: bars on both sides of it, at its height. (Made with
    // L.title or not — the rule is about what is on screen.)
    const inRow = (t, s) => Math.min(t.y + t.h, s.y + s.h) - Math.max(t.y, s.y) >= 0.8 * t.h;
    // Its capitals fill the bars' height, and the bars either side of it are the same height.
    for (const t of texts) {
      if (t.bx || t.num || t.on || t.el.dataset.title || !/[A-Za-z]/.test(t.txt)) continue;   // a title has words
      const row = shapes.filter((s) => inRow(t, s) && t.h >= 0.8 * s.h && t.h <= 1.25 * s.h);
      const l = row.filter((s) => s.x + s.w <= t.x + 1 && t.x - (s.x + s.w) < 400);
      const r = row.filter((s) => s.x >= t.x + t.w - 1 && s.x - (t.x + t.w) < 400);
      if (l.some((a) => r.some((b) => Math.abs(a.h - b.h) <= 0.2 * Math.max(a.h, b.h)))) t.el.dataset.title = "1";
    }
    for (const t of texts) {
      if (!t.el.dataset.title) continue;
      const row = shapes.filter((s) => s.y < t.y + t.h && t.y < s.y + s.h);
      const left = row.filter((s) => s.x + s.w <= t.x + 1).sort((a, b) => b.x + b.w - (a.x + a.w))[0];
      const right = row.filter((s) => s.x >= t.x + t.w - 1).sort((a, b) => a.x - b.x)[0];
      for (const [side, s, g] of [["before", left, left && t.x - (left.x + left.w)], ["after", right, right && right.x - (t.x + t.w)]])
        if (s && Math.abs(g - L.GAP) > 6) issues.push(`title ${name(t)} has ${Math.round(g)}px ${side} it (should be ${L.GAP})`);
    }
    // ---- stacked edges that almost line up: nearly always a mistake ----
    // Blocks directly above one another in the same column whose left or right edges miss by a
    // little. Centred pairs are deliberate; text inside a panel is the panel rule's business.
    const inPanel = (t) => shapes.some((s) => s.panel && hit(t, s));
    // Pieces that sit side by side on one row (an end cap and its bar, a title and its bars) are
    // one block for alignment. Shapes that bleed off the screen are left out.
    const pieces = [
      ...shapes.filter((s) => s.w >= 20 && s.h >= 8 && s.x > 0 && s.x + s.w < W && !s.noalign)
        .map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, what: `shape at ${Math.round(s.x)},${Math.round(s.y)}` })),
      ...texts.filter((t) => t.el.dataset.title).map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h, what: name(t) })),
    ].sort((a, b) => a.x - b.x);
    const groups = [];
    for (const p of pieces) {
      const g = groups.find((g) => p.x - (g.x + g.w) <= 32 && p.x >= g.x &&
        Math.min(p.y + p.h, g.y + g.h) - Math.max(p.y, g.y) >= 0.8 * Math.min(p.h, g.h));
      if (g) { const r = Math.max(g.x + g.w, p.x + p.w); g.y = Math.min(g.y, p.y); g.h = Math.max(g.y + g.h, p.y + p.h) - g.y; g.w = r - g.x; }
      else groups.push({ ...p });
    }
    const blocks = [...groups,
      ...texts.filter((t) => !t.bx && !t.num && !t.on && !t.el.dataset.title && !t.el.dataset.legend && !inPanel(t))
        .map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h, what: name(t), text: true }))];
    // (text is compared only with blocks at least as wide as itself: a caption under its bar, not a
    // line of text that happens to pass over a row of small boxes)
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.text && b.text) continue;                             // text against text: a table's own business
      if ((a.text && a.w > 1.3 * b.w) || (b.text && b.w > 1.3 * a.w)) continue;   // a caption, not a line passing over small boxes
      const [up, dn] = a.y < b.y ? [a, b] : [b, a];
      const vgap = dn.y - (up.y + up.h);
      if (vgap < 0 || vgap > 60) continue;                        // directly above and below each other
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (overlap < 0.5 * Math.min(a.w, b.w)) continue;           // the same column
      if (Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) <= 4) continue; // centred on each other: deliberate
      const tol = a.text || b.text ? 5 : 2;                       // glyph side-bearings
      for (const [edge, d] of [["left", a.x - b.x], ["right", a.x + a.w - b.x - b.w]])
        if (Math.abs(d) > tol && Math.abs(d) <= 120) issues.push(`${a.what} and ${b.what}: ${edge} edges almost line up (${Math.round(Math.abs(d))}px apart)`);
    }
    // ---- a section header runs exactly as far as the row directly beneath it ----
    // (From Starship Monitor: Tactical's purple headers and the Ship's Log's gold one stopped 24px
    // short of their rows, 2026-11-21.) Headers made with L.header.
    const layerBox = (e) => {                           // where a bar stands (rows move by transform), at full length
      const b = e.getBoundingClientRect();
      return { x: (b.left - sr.left) / z, y: (b.top - sr.top) / z, w: e.offsetWidth, h: b.height / z };
    };
    // A bar: a solid block stretched along x by its own transform (scaleX), lying flat
    const bars = [...stage.querySelectorAll("div")].filter((e) => e.isConnected && !e.closest("svg") && /scaleX\(|scale\([^,)]*,/.test(e.style.transform) && getComputedStyle(e).visibility !== "hidden" &&
      !e.children.length && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)")   // a solid fill, not a drawing
      .map((e) => Object.assign(layerBox(e), { el: e })).filter((b) => b.w >= 60 && b.h >= 8 && b.h <= 90 && b.w >= 3 * b.h);
    const faded = (e) => { for (let n = e; n && n !== stage; n = n.parentElement) if (parseFloat(getComputedStyle(n).opacity) < 0.05) return true; return false; };
    // every piece of free text, moving layers included (rows of logs and tables live in layers)
    const allTexts = [];
    for (const e of stage.querySelectorAll(".t")) {
      if (!e.isConnected || getComputedStyle(e).visibility === "hidden" || faded(e)) continue;
      for (const t of ink(e)) allTexts.push(Object.assign(t, { el: e, on: e.dataset.on }));
    }
    for (const hd of headers) {
      if (!hd.el.isConnected) continue;
      let hr = hd.x + hd.w;
      const y0 = hd.y + hd.h;
      for (let more = true; more; ) {                   // a count box, end cap or key row beside it continues the header
        const s = shapes.find((s) => s.el && s.el.isConnected && Math.abs(s.y - hd.y) <= 2 && s.el !== hd.el && s.w > 0 && s.x > hr && s.x - hr <= 96 && Math.abs(s.h - hd.h) <= 2);
        more = !!s; if (s) hr = s.x + s.w;
      }
      const under = [...shapes.filter((s) => s.el && s.el.isConnected && s.el !== hd.el && s.w >= 20 && !s.panel).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
        ...bars, ...allTexts.filter((t) => !t.el.dataset.legend)]
        .filter((b) => b.y >= y0 && b.y <= y0 + 150 && b.x >= hd.x - 8 && b.x < hr && b.x + b.w > hd.x);
      if (!under.length) continue;
      const top = Math.min(...under.map((b) => b.y));
      const row = under.filter((b) => b.y <= top + 40);
      const r = Math.max(...row.map((b) => b.x + b.w));
      if (r - hr > 4) issues.push(`header "${String(hd.label).slice(0, 28)}" stops ${Math.round(r - hr)}px short of the row beneath it`);
    }
    // ---- a bar runs on to its words ----
    // A bar and the words after it on its row (a figure, a state): never touching (under 16px), and
    // never a wide black gap (over 72px). Bars run up to their numbers; never shorten one to dodge
    // the alignment rule. (From Starship Monitor: Ship Status's bars stopped ~180px short, 2026-11-21.)
    for (const br of bars) {
      const bx = br.x + br.w;
      const next = allTexts.filter((t) => !t.on && !t.el.dataset.legend && t.txt && t.el.style.right !== "" && t.x + t.w > bx - 4 && t.x - bx < 600 &&
        t.y + t.h / 2 >= br.y - 20 && t.y + t.h / 2 <= br.y + br.h + 20 && t.x > br.x + br.w / 2 &&
        !shapes.some((s) => s.el && s.el.isConnected && !s.panel && s.w < 1200 && hit(t, s)))      // free text, not printed on a cell
        .sort((a, b) => a.x - b.x)[0];
      if (!next) continue;
      // a blank number slot between them (a row still filling, a number faded out): the bar's own words are missing
      if ([...stage.querySelectorAll(".t")].some((e) => e.style.right !== "" && (!e.textContent.trim() || faded(e)) && (() => {
        const b = e.getBoundingClientRect(), r = (b.right - sr.left) / z, y = (b.top + b.bottom) / 2 / z - sr.top / z;
        return r > bx + 8 && r < next.x + next.w - 8 && y >= br.y - 30 && y <= br.y + br.h + 30;
      })())) continue;
      // anything else between the bar and that number (its own words left-aligned after it, a status pill,
      // the next column's first words): the number belongs to something else
      const between = (b) => b.x >= bx + 4 && b.x + b.w <= next.x - 4 && b.y + b.h > br.y - 20 && b.y < br.y + br.h + 20;
      if (allTexts.some((t) => t.el !== next.el && between(t)) || shapes.some((s) => s.el && s.el.isConnected && !s.panel && s.h >= 16 && between(s))) continue;
      const g = next.x - bx, at = `the bar at ${Math.round(br.x)},${Math.round(br.y)}`;
      if (g < 16) issues.push(`${at} ${g < 0 ? "runs under" : "comes within " + Math.round(g) + "px of"} its words ${name(next)} (at least 16)`);
      else if (/[?&]bargaps\b/.test(location.search) && !br.el.closest('[data-gap="free"]')) issues.push(`bargap ${Math.round(br.x)},${Math.round(br.y)},${Math.round(br.w)} ${Math.round(g)} ${Math.round(next.x + next.w)}`);
    }
    // ---- type large enough to read across a room ----
    for (const t of texts) {
      if (t.on || t.el.dataset.legend) continue;
      const fs = parseFloat(getComputedStyle(t.el).fontSize);
      const min = t.bx ? 24 : t.num ? 30 : 36;
      if (fs < min - 0.5) issues.push(`${name(t)} is set at ${Math.round(fs)}px (smallest allowed here: ${min})`);
    }
    return [...new Set(issues)];
  };

  // ---------- the boot cascade: panels light up in sequence, as on the ship ----------
  L.start = (opts = {}) => {
    fit();
    const els = [...stage.querySelectorAll(".boot")];
    const key = (e) => { const b = e.getBoundingClientRect(); return b.left * 0.35 + b.top + Math.random() * 120; };
    const order = els.map((e) => [key(e), e]).sort((a, b) => a[0] - b[0]);
    const span = opts.boot ?? 1.6, max = order.length ? order[order.length - 1][0] : 1;
    let i = 0;
    L.tick((t) => {
      while (i < order.length && (order[i][0] / max) * span <= t) order[i++][1].classList.remove("boot");
    });
    requestAnimationFrame(loop);
  };
})();
