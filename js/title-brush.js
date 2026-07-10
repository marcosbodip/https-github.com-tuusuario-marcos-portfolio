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
const brushPositionSpring = 0.028;
const brushPositionDamping = 0.84;
const brushScaleSpring = 0.061;
const brushScaleDamping = 0.78;
const brushStretchSpring = 0.078;
const brushStretchDamping = 0.76;
const brushStretchReleaseDelay = 92;
const brushStretchVelocityFloor = 0.08;
const brushStretchVelocityCeiling = 0.56;
const brushMaxStretch = 0.64;
const brushMaxSquash = 0.3;
const brushTrailFactor = 0.24;
const brushTrailClamp = 24;

function clampBrushValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
      currentStretchX: 1,
      currentStretchY: 1,
      targetStretchX: 1,
      targetStretchY: 1,
      velocityX: 0,
      velocityY: 0,
      velocityScale: 0,
      velocityStretchX: 0,
      velocityStretchY: 0,
      lastPointerX: 0,
      lastPointerY: 0,
      lastMoveTime: 0,
      frame: null,
    };

    const animateBrush = () => {
      if (
        brush.lastMoveTime &&
        performance.now() - brush.lastMoveTime > brushStretchReleaseDelay
      ) {
        brush.targetStretchX = 1;
        brush.targetStretchY = 1;
      }

      brush.velocityX = (brush.velocityX + (brush.targetX - brush.currentX) * brushPositionSpring) * brushPositionDamping;
      brush.velocityY = (brush.velocityY + (brush.targetY - brush.currentY) * brushPositionSpring) * brushPositionDamping;
      brush.velocityScale = (brush.velocityScale + (brush.targetScale - brush.currentScale) * brushScaleSpring) * brushScaleDamping;
      brush.velocityStretchX = (brush.velocityStretchX + (brush.targetStretchX - brush.currentStretchX) * brushStretchSpring) * brushStretchDamping;
      brush.velocityStretchY = (brush.velocityStretchY + (brush.targetStretchY - brush.currentStretchY) * brushStretchSpring) * brushStretchDamping;

      brush.currentX += brush.velocityX;
      brush.currentY += brush.velocityY;
      brush.currentScale += brush.velocityScale;
      brush.currentStretchX += brush.velocityStretchX;
      brush.currentStretchY += brush.velocityStretchY;

      title.style.setProperty("--brush-x", `${brush.currentX}px`);
      title.style.setProperty("--brush-y", `${brush.currentY}px`);
      title.style.setProperty("--brush-scale", brush.currentScale.toFixed(3));
      title.style.setProperty("--brush-stretch-x", brush.currentStretchX.toFixed(3));
      title.style.setProperty("--brush-stretch-y", brush.currentStretchY.toFixed(3));

      if (
        Math.abs(brush.targetX - brush.currentX) > 0.1 ||
        Math.abs(brush.targetY - brush.currentY) > 0.1 ||
        Math.abs(brush.targetScale - brush.currentScale) > 0.01 ||
        Math.abs(brush.targetStretchX - brush.currentStretchX) > 0.01 ||
        Math.abs(brush.targetStretchY - brush.currentStretchY) > 0.01 ||
        Math.abs(brush.velocityX) > 0.03 ||
        Math.abs(brush.velocityY) > 0.03 ||
        Math.abs(brush.velocityScale) > 0.002 ||
        Math.abs(brush.velocityStretchX) > 0.002 ||
        Math.abs(brush.velocityStretchY) > 0.002
      ) {
        brush.frame = requestAnimationFrame(animateBrush);
      } else {
        brush.frame = null;
        brush.velocityX = 0;
        brush.velocityY = 0;
        brush.velocityScale = 0;
        brush.velocityStretchX = 0;
        brush.velocityStretchY = 0;

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
      const now = performance.now();
      const elapsed = brush.lastMoveTime ? Math.max(16, now - brush.lastMoveTime) : 16;
      const deltaX = event.clientX - brush.lastPointerX;
      const deltaY = event.clientY - brush.lastPointerY;
      const pointerVelocity = Math.hypot(deltaX, deltaY) / elapsed;
      const velocityRatio = clampBrushValue(
        (pointerVelocity - brushStretchVelocityFloor) /
          (brushStretchVelocityCeiling - brushStretchVelocityFloor),
        0,
        1
      );
      const totalAxisMotion = Math.abs(deltaX) + Math.abs(deltaY) || 1;
      const horizontalShare = Math.abs(deltaX) / totalAxisMotion;
      const verticalShare = Math.abs(deltaY) / totalAxisMotion;
      const trailX = clampBrushValue(-deltaX * velocityRatio * brushTrailFactor, -brushTrailClamp, brushTrailClamp);
      const trailY = clampBrushValue(-deltaY * velocityRatio * brushTrailFactor, -brushTrailClamp, brushTrailClamp);

      brush.targetX = clampBrushValue(x + trailX, -brushTrailClamp, rect.width + brushTrailClamp);
      brush.targetY = clampBrushValue(y + trailY, -brushTrailClamp, rect.height + brushTrailClamp);
      brush.targetScale = 1;
      brush.targetStretchX = clampBrushValue(
        1 + horizontalShare * velocityRatio * brushMaxStretch - verticalShare * velocityRatio * brushMaxSquash,
        0.76,
        1.72
      );
      brush.targetStretchY = clampBrushValue(
        1 + verticalShare * velocityRatio * brushMaxStretch - horizontalShare * velocityRatio * brushMaxSquash,
        0.76,
        1.72
      );
      brush.lastPointerX = event.clientX;
      brush.lastPointerY = event.clientY;
      brush.lastMoveTime = now;
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
      brush.currentStretchX = 1;
      brush.currentStretchY = 1;
      brush.targetStretchX = 1;
      brush.targetStretchY = 1;
      brush.velocityX = 0;
      brush.velocityY = 0;
      brush.velocityScale = 0;
      brush.velocityStretchX = 0;
      brush.velocityStretchY = 0;
      brush.lastPointerX = event.clientX;
      brush.lastPointerY = event.clientY;
      brush.lastMoveTime = performance.now();
      moveBrush(event);
    });

    title.addEventListener("pointermove", moveBrush);

    title.addEventListener("pointerleave", () => {
      brush.targetScale = 0;
      brush.targetStretchX = 1;
      brush.targetStretchY = 1;
      brush.lastMoveTime = 0;
      requestBrushFrame();
    });
  });
}
