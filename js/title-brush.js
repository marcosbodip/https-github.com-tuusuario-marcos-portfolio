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
const brushPositionSpring = 0.04;
const brushPositionDamping = 0.79;
const brushScaleSpring = 0.069;
const brushScaleDamping = 0.75;

if (canBrushTitles) {
  titleBrushTargets.forEach((title) => {
    title.classList.add("title-brush");
    title.dataset.brushText = title.innerText || title.textContent;
    const aboutHeading = title.matches(".about-hey-line") ? title.closest(".about-heading") : null;
    const aboutHeyWrap = title.matches(".about-hey-line") ? title.closest(".about-hey-wrap") : null;
    const brush = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      currentScale: 0,
      targetScale: 0,
      velocityX: 0,
      velocityY: 0,
      velocityScale: 0,
      frame: null,
    };

    const animateBrush = () => {
      brush.velocityX = (brush.velocityX + (brush.targetX - brush.currentX) * brushPositionSpring) * brushPositionDamping;
      brush.velocityY = (brush.velocityY + (brush.targetY - brush.currentY) * brushPositionSpring) * brushPositionDamping;
      brush.velocityScale = (brush.velocityScale + (brush.targetScale - brush.currentScale) * brushScaleSpring) * brushScaleDamping;

      brush.currentX += brush.velocityX;
      brush.currentY += brush.velocityY;
      brush.currentScale += brush.velocityScale;

      title.style.setProperty("--brush-x", `${brush.currentX}px`);
      title.style.setProperty("--brush-y", `${brush.currentY}px`);
      title.style.setProperty("--brush-scale", brush.currentScale.toFixed(3));

      if (
        Math.abs(brush.targetX - brush.currentX) > 0.1 ||
        Math.abs(brush.targetY - brush.currentY) > 0.1 ||
        Math.abs(brush.targetScale - brush.currentScale) > 0.01 ||
        Math.abs(brush.velocityX) > 0.03 ||
        Math.abs(brush.velocityY) > 0.03 ||
        Math.abs(brush.velocityScale) > 0.002
      ) {
        brush.frame = requestAnimationFrame(animateBrush);
      } else {
        brush.frame = null;
        brush.velocityX = 0;
        brush.velocityY = 0;
        brush.velocityScale = 0;

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

    if (aboutHeading && aboutHeyWrap) {
      let collapseAboutHeyTimer = 0;
      const activateAboutHey = () => {
        if (collapseAboutHeyTimer) {
          window.clearTimeout(collapseAboutHeyTimer);
          collapseAboutHeyTimer = 0;
        }

        aboutHeading.classList.add("is-hey-expanded");
      };
      const deactivateAboutHey = () => {
        if (collapseAboutHeyTimer) {
          window.clearTimeout(collapseAboutHeyTimer);
        }

        collapseAboutHeyTimer = window.setTimeout(() => {
          aboutHeading.classList.remove("is-hey-expanded");
          collapseAboutHeyTimer = 0;
        }, 120);
      };

      title.addEventListener("pointerenter", activateAboutHey);
      title.addEventListener("pointermove", activateAboutHey);
      aboutHeyWrap.addEventListener("pointerenter", activateAboutHey);
      aboutHeading.addEventListener("pointerleave", deactivateAboutHey);
    }

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
      brush.velocityX = 0;
      brush.velocityY = 0;
      brush.velocityScale = 0;
      moveBrush(event);
    });

    title.addEventListener("pointermove", moveBrush);

    title.addEventListener("pointerleave", () => {
      brush.targetScale = 0;
      requestBrushFrame();
    });
  });
}
