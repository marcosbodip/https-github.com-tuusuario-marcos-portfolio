const titleBrushTargets = document.querySelectorAll(
  [
    ".project-card-info h2",
    ".project-intro h1",
    ".project-summary",
    ".project-meta h2",
    ".project-concept h2",
    ".project-copy-block p",
    ".details-list dt",
    ".details-list dd",
    ".about-hey-line",
    ".about-name-line",
    ".about-copy p",
    ".main-nav a",
    ".site-footer a"
  ].join(", ")
);
const canBrushTitles = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (canBrushTitles) {
  titleBrushTargets.forEach((title) => {
    title.classList.add("title-brush");
    title.dataset.brushText = title.innerText || title.textContent;
    const brush = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      currentScale: 0,
      targetScale: 0,
      frame: null,
    };

    const animateBrush = () => {
      brush.currentX += (brush.targetX - brush.currentX) * 0.22;
      brush.currentY += (brush.targetY - brush.currentY) * 0.22;
      brush.currentScale += (brush.targetScale - brush.currentScale) * 0.18;

      title.style.setProperty("--brush-x", `${brush.currentX}px`);
      title.style.setProperty("--brush-y", `${brush.currentY}px`);
      title.style.setProperty("--brush-scale", brush.currentScale.toFixed(3));

      if (
        Math.abs(brush.targetX - brush.currentX) > 0.1 ||
        Math.abs(brush.targetY - brush.currentY) > 0.1 ||
        Math.abs(brush.targetScale - brush.currentScale) > 0.01
      ) {
        brush.frame = requestAnimationFrame(animateBrush);
      } else {
        brush.frame = null;

        if (brush.targetScale === 0) {
          title.classList.remove("is-brushed");
        }
      }
    };

    const requestBrushFrame = () => {
      if (!brush.frame) {
        brush.frame = requestAnimationFrame(animateBrush);
      }
    };

    const moveBrush = (event) => {
      const rect = title.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      brush.targetX = x;
      brush.targetY = y;
      brush.targetScale = 1;
      title.classList.add("is-brushed");
      requestBrushFrame();
    };

    title.addEventListener("pointerenter", (event) => {
      const rect = title.getBoundingClientRect();
      brush.currentX = event.clientX - rect.left;
      brush.currentY = event.clientY - rect.top;
      brush.targetX = brush.currentX;
      brush.targetY = brush.currentY;
      brush.currentScale = 0;
      moveBrush(event);
    });

    title.addEventListener("pointermove", moveBrush);

    title.addEventListener("pointerleave", () => {
      brush.targetScale = 0;
      requestBrushFrame();
    });
  });
}
