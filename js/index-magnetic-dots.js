const magneticDotsGrid = document.querySelector("[data-project-grid]");

if (magneticDotsGrid) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const pointer = {
    x: 0,
    y: 0,
    active: false
  };
  let dots = [];
  let width = 0;
  let height = 0;
  let animationFrame = 0;

  canvas.className = "magnetic-dots";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  function getSettings() {
    const compact = window.innerWidth <= 760;
    const spacingX = compact ? 24 : 28;

    return {
      spacingX,
      spacingY: spacingX * 0.78,
      radius: compact ? 140 : 210,
      pull: compact ? 0.3 : 0.36,
      dotSize: compact ? 1.35 : 1.55,
      ease: 0.13
    };
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { spacingX, spacingY } = getSettings();
    const cols = Math.ceil(width / spacingX) + 3;
    const rows = Math.ceil(height / spacingY) + 3;
    const startX = -spacingX;
    const startY = -spacingY;

    dots = [];

    for (let row = 0; row < rows; row += 1) {
      const rowOffset = row % 2 === 0 ? 0 : spacingX * 0.5;

      for (let col = 0; col < cols; col += 1) {
        const x = startX + rowOffset + col * spacingX;
        const y = startY + row * spacingY;
        dots.push({
          baseX: x,
          baseY: y,
          x,
          y,
          influence: 0
        });
      }
    }
  }

  function drawDots() {
    const settings = getSettings();
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f2eee7";

    dots.forEach((dot) => {
      let targetX = dot.baseX;
      let targetY = dot.baseY;
      let influence = 0;

      if (pointer.active) {
        const dx = pointer.x - dot.baseX;
        const dy = pointer.y - dot.baseY;
        const distance = Math.hypot(dx, dy);

        if (distance < settings.radius) {
          influence = Math.pow(1 - distance / settings.radius, 1.8);
          targetX = dot.baseX + dx * influence * settings.pull;
          targetY = dot.baseY + dy * influence * settings.pull;
        }
      }

      dot.x += (targetX - dot.x) * settings.ease;
      dot.y += (targetY - dot.y) * settings.ease;
      dot.influence += (influence - dot.influence) * 0.18;

      const size = settings.dotSize + dot.influence * 2.15;
      context.globalAlpha = 0.34 + dot.influence * 0.58;
      context.fillRect(dot.x - size / 2, dot.y - size / 2, size, size);
    });

    context.globalAlpha = 1;
    animationFrame = window.requestAnimationFrame(drawDots);
  }

  function updatePointer(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  resizeCanvas();
  drawDots();

  window.addEventListener("pointermove", updatePointer);
  window.addEventListener("pointerdown", updatePointer);
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  window.addEventListener("blur", () => {
    pointer.active = false;
  });
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(animationFrame);
      return;
    }

    drawDots();
  });
}
