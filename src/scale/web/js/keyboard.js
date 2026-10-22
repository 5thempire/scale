// The two-row, 24-key keyboard drawn as SVG, modelled on the Scale Pocket's interlocking keycaps.
// Bottom row is the lower octave (keys 0–11), top row the upper octave (keys 12–23).

import { NOTE_NAMES, FLAT_NAMES, isBlack, KEY_COUNT } from "./theory.js";

const SVG = "http://www.w3.org/2000/svg";

// Geometry in units of one white-key width. Each row has three bands:
// black-key tops, black-key tabs interleaved with white-key "ears", and white-key bodies.
const GAP = 0.09;
const RADIUS = 0.08;
const Y_TAB = 0.62; // black tops end, tabs + ears begin
const Y_BODY = 0.9; // white bodies begin
const ROW_H = 2.0;
const ROW_SPACING = 0.22;
const TAB_W = 0.62;

// Black key top extents [x0, x1]; the tab is centred on the boundary between the two white keys.
const BLACK_TOPS = { 1: [0, 1.38], 3: [1.48, 2.92], 6: [3.02, 4.36], 8: [4.46, 5.32], 10: [5.42, 7] };
const BLACK_CENTER = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
const WHITE_COLUMN = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

function roundedPath(points, r) {
  const n = points.length;
  const f = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2] = [points[(i + n - 1) % n], points[i], points[(i + 1) % n]];
    const l1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + ((p0[0] - p1[0]) / l1) * rr, p1[1] + ((p0[1] - p1[1]) / l1) * rr];
    const b = [p1[0] + ((p2[0] - p1[0]) / l2) * rr, p1[1] + ((p2[1] - p1[1]) / l2) * rr];
    d += `${i ? "L" : "M"}${f(a)}Q${f(p1)} ${f(b)}`;
  }
  return d + "Z";
}

function blackShape(pc) {
  const h = GAP / 2;
  const [t0, t1] = BLACK_TOPS[pc];
  const c = BLACK_CENTER[pc];
  const [b0, b1] = [c - TAB_W / 2, c + TAB_W / 2];
  const points = [
    [t0 + h, h], [t1 - h, h], [t1 - h, Y_TAB - h], [b1 - h, Y_TAB - h],
    [b1 - h, Y_BODY - h], [b0 + h, Y_BODY - h], [b0 + h, Y_TAB - h], [t0 + h, Y_TAB - h],
  ];
  const label = { x: (t0 + t1) / 2, y: Y_TAB / 2 };
  return { d: roundedPath(points, RADIUS), label, bounds: [0, Y_BODY] };
}

function whiteShape(pc) {
  const h = GAP / 2;
  const col = WHITE_COLUMN[pc];
  // The ear fills whatever the neighbouring black tabs leave free in this column.
  const left = [1, 3, 6, 8, 10].map((b) => BLACK_CENTER[b]).includes(col) ? col + TAB_W / 2 : col;
  const right = [1, 3, 6, 8, 10].map((b) => BLACK_CENTER[b]).includes(col + 1) ? col + 1 - TAB_W / 2 : col + 1;
  const points = [[left + h, Y_TAB + h], [right - h, Y_TAB + h]];
  if (right < col + 1) points.push([right - h, Y_BODY + h], [col + 1 - h, Y_BODY + h]);
  points.push([col + 1 - h, ROW_H - h], [col + h, ROW_H - h]);
  if (left > col) points.push([col + h, Y_BODY + h], [left + h, Y_BODY + h]);
  const label = { x: col + 0.5, y: (Y_BODY + ROW_H) / 2 + 0.06 };
  return { d: roundedPath(points, RADIUS), label, bounds: [Y_TAB, ROW_H] };
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

/**
 * Render the keyboard into `svg` and wire up pointer input.
 * onPress(index, velocity) / onRelease(index) receive key indices 0..23.
 */
export function createKeyboard(svg, { onPress, onRelease }) {
  const height = ROW_H * 2 + ROW_SPACING;
  svg.setAttribute("viewBox", `0 0 7 ${height}`);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Keyboard, two octaves");

  const defs = el("defs", {}, svg);
  const blur = el("filter", { id: "halo-blur", x: "-1", y: "-1", width: "3", height: "3" }, defs);
  el("feGaussianBlur", { stdDeviation: "0.07" }, blur);

  const keys = [];
  for (let i = 0; i < KEY_COUNT; i++) {
    const pc = i % 12;
    const upper = i >= 12;
    const black = isBlack(pc);
    const shape = black ? blackShape(pc) : whiteShape(pc);
    const yOffset = upper ? 0 : ROW_H + ROW_SPACING;
    const g = el("g", {
      class: `key ${black ? "key--black" : "key--white"} ${upper ? "key--upper" : "key--lower"}`,
      "data-key": i,
      transform: `translate(0 ${yOffset})`,
    }, svg);
    const cap = el("g", { class: "key__cap" }, g);
    el("path", { class: "key__shadow", d: shape.d }, cap);
    el("path", { class: "key__face", d: shape.d }, cap);
    el("circle", { class: "key__halo", cx: shape.label.x, cy: shape.label.y, r: black ? 0.26 : 0.3, filter: "url(#halo-blur)" }, cap);
    const text = el("text", { class: "key__label", x: shape.label.x, y: shape.label.y }, cap);
    if (black) {
      el("tspan", { x: shape.label.x, dy: "-0.55em" }, text).textContent = NOTE_NAMES[pc];
      el("tspan", { x: shape.label.x, dy: "1.1em" }, text).textContent = FLAT_NAMES[pc];
    } else {
      text.textContent = NOTE_NAMES[pc];
    }
    keys.push({ g, yOffset, bounds: shape.bounds });
  }

  // Velocity from where the key is struck: towards the front edge is louder,
  // unless the pointer reports real pressure (pen, force touch).
  function velocityAt(e, index) {
    if (e.pointerType !== "mouse" && e.pressure > 0 && e.pressure !== 0.5) {
      return Math.round(20 + 107 * Math.min(1, e.pressure));
    }
    const ctm = svg.getScreenCTM();
    if (!ctm) return 100;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const { yOffset, bounds } = keys[index];
    const depth = (p.y - yOffset - bounds[0]) / (bounds[1] - bounds[0]);
    return Math.round(45 + 82 * Math.min(1, Math.max(0, depth)));
  }

  function keyAt(x, y) {
    const node = document.elementFromPoint(x, y)?.closest?.("[data-key]");
    return node && svg.contains(node) ? Number(node.dataset.key) : null;
  }

  // Each pointer (finger, mouse) can hold one key and glide across others.
  const pointers = new Map();

  svg.addEventListener("pointerdown", (e) => {
    const index = keyAt(e.clientX, e.clientY);
    if (index === null) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, index);
    onPress(index, velocityAt(e, index));
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const index = keyAt(e.clientX, e.clientY);
    const current = pointers.get(e.pointerId);
    if (index === current) return;
    if (current !== null) onRelease(current);
    pointers.set(e.pointerId, index);
    if (index !== null) onPress(index, velocityAt(e, index));
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const index = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (index !== null) onRelease(index);
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("lostpointercapture", end);
  svg.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    setLights(lights) {
      keys.forEach(({ g }, i) => {
        g.classList.remove("lit-red", "lit-green", "lit-blue");
        if (lights[i]) g.classList.add(`lit-${lights[i]}`);
      });
    },
    setPressed(index, down) {
      keys[index]?.g.classList.toggle("is-down", down);
    },
  };
}
