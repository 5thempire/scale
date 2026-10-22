// A detented hardware-style slider: drag the cap, click a label, or use the arrow keys.

export function createSlider(root, { labels, value = 0, name, describe = (i) => labels[i], onChange }) {
  const n = labels.length;
  root.classList.add("slider");
  root.innerHTML = `
    <div class="slider__groove" tabindex="0" role="slider" aria-label="${name}"
         aria-valuemin="0" aria-valuemax="${n - 1}">
      <div class="slider__track"></div>
      <div class="slider__cap"><span></span></div>
    </div>
    <ol class="slider__labels">${labels.map((l, i) => `<li data-i="${i}"><span>${l}</span></li>`).join("")}</ol>`;

  const groove = root.querySelector(".slider__groove");
  const cap = root.querySelector(".slider__cap");
  const items = [...root.querySelectorAll(".slider__labels li")];
  let current = -1;

  function set(i, notify = true) {
    i = Math.max(0, Math.min(n - 1, i));
    if (i === current) return;
    current = i;
    root.style.setProperty("--pos", (i + 0.5) / n);
    groove.setAttribute("aria-valuenow", i);
    groove.setAttribute("aria-valuetext", describe(i));
    items.forEach((li, j) => li.classList.toggle("is-active", j === i));
    if (notify) onChange(i);
  }

  // Positions are laid out on the same grid as the labels, so the cap sits above its label.
  function indexAt(clientX) {
    const r = groove.getBoundingClientRect();
    return Math.round(((clientX - r.left) / r.width) * n - 0.5);
  }

  groove.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    groove.focus();
    groove.setPointerCapture(e.pointerId);
    set(indexAt(e.clientX));
  });
  groove.addEventListener("pointermove", (e) => {
    if (groove.hasPointerCapture(e.pointerId)) set(indexAt(e.clientX));
  });
  groove.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step) set(current + step);
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(n - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  items.forEach((li, i) => li.addEventListener("click", () => set(i)));

  set(value, false);
  return { set, get value() { return current; } };
}
