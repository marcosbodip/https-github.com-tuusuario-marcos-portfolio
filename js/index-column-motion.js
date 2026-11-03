(() => {
  const grid = document.querySelector("[data-index-reactive]");
  if (!grid) return;
  const desktop = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1000px) and (orientation: landscape)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let columns = [];
  let frame = 0;
  let lastTime = 0;
  let travel = 0;
  let targetY = 0;
  let horizontal = 0;
  let horizontalTarget = 0;
  let horizontalLimit = 20;

  function enabled() { return desktop.matches && !reducedMotion.matches && !document.hidden; }
  function requestFrame() {
    if (!frame && enabled()) frame = requestAnimationFrame(draw);
  }
  function clear() {
    cancelAnimationFrame(frame);
    frame = lastTime = 0;
    horizontal = horizontalTarget = 0;
    grid.classList.remove("has-column-motion");
    grid.style.removeProperty("--column-grid-height");
    Array.from(grid.children).forEach((card) => {
      card.style.removeProperty("--column-motion-x");
      card.style.removeProperty("--column-motion-y");
    });
  }
  function measure() {
    clear();
    if (!enabled()) return;
    const groups = new Map();
    Array.from(grid.children).forEach((card) => {
      const left = Math.round(card.offsetLeft);
      if (!groups.has(left)) groups.set(left, []);
      groups.get(left).push(card);
    });
    // Reclaim the extra vertical travel rather than leaving an empty area at the footer.
    travel = Math.max(0, document.documentElement.scrollHeight - innerHeight) / 3;
    grid.style.setProperty("--column-grid-height", `${Math.max(1, grid.offsetHeight - travel)}px`);
    horizontalLimit = Math.min(32, parseFloat(getComputedStyle(grid).paddingLeft) * 0.8);
    targetY = -clamp(scrollY * 0.5, 0, travel);
    columns = Array.from(groups).sort((a, b) => a[0] - b[0]).map(([, cards], index) => ({
      cards,
      duration: [500, 800, 200][index % 3],
      y: targetY
    }));
    grid.classList.add("has-column-motion");
    requestFrame();
  }
  function draw(time) {
    frame = 0;
    if (!enabled()) { clear(); return; }
    const dt = Math.min(48, lastTime ? time - lastTime : 16.67);
    lastTime = time;
    horizontal += (horizontalTarget - horizontal) * (1 - Math.pow(0.95, dt / 16.67));
    let moving = Math.abs(horizontalTarget - horizontal) > 0.02;
    if (!moving) horizontal = horizontalTarget;
    columns.forEach((column) => {
      // One destination, distinct arrival times: a scrolling ribbon, not opposite parallax.
      column.y += (targetY - column.y) * (1 - Math.exp(-4 * dt / column.duration));
      const settling = Math.abs(targetY - column.y) > 0.02;
      if (!settling) column.y = targetY;
      moving ||= settling;
      column.cards.forEach((card) => {
        card.style.setProperty("--column-motion-x", `${horizontal.toFixed(3)}px`);
        card.style.setProperty("--column-motion-y", `${column.y.toFixed(3)}px`);
      });
    });
    if (moving) requestFrame();
    else lastTime = 0;
  }
  window.addEventListener("scroll", () => {
    targetY = -clamp(scrollY * 0.5, 0, travel);
    requestFrame();
  }, { passive: true });
  grid.addEventListener("pointermove", (event) => {
    if (!enabled() || event.pointerType === "touch") return;
    const rect = grid.getBoundingClientRect();
    const position = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    horizontalTarget = (0.5 - position) * horizontalLimit * 2;
    requestFrame();
  });
  grid.addEventListener("pointerleave", () => {
    horizontalTarget = 0;
    requestFrame();
  });
  grid.addEventListener("wheel", (event) => {
    if (!enabled() || event.ctrlKey || !event.deltaX) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerWidth : 1;
    horizontalTarget = clamp(horizontalTarget - event.deltaX * unit * 0.35, -horizontalLimit, horizontalLimit);
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && event.cancelable) event.preventDefault();
    requestFrame();
  }, { passive: false });
  new ResizeObserver(measure).observe(grid);
  desktop.addEventListener("change", measure);
  reducedMotion.addEventListener("change", measure);
  window.addEventListener("resize", measure);
  window.addEventListener("pageshow", measure);
  document.addEventListener("visibilitychange", () => document.hidden ? clear() : measure());
  document.fonts?.ready.then(measure);
  requestAnimationFrame(measure);
})();
