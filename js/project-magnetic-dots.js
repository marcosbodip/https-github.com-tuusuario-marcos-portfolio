const magneticProjectRoot = document.querySelector("[data-project-root]");

if (magneticProjectRoot) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const pointer = {
    x: 0,
    y: 0,
    active: false
  };
  const supportsPointerMagnet = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const introSection = magneticProjectRoot.querySelector(".project-intro");
  const gallerySection = magneticProjectRoot.querySelector(".project-gallery");
  let dots = [];
  let width = 0;
  let height = 0;
  let animationFrame = 0;
  let baseDotColor = [242, 238, 231];
  let accentDotColor = [255, 59, 48];

  canvas.className = "magnetic-dots";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  function getSettings() {
    const compact = window.innerWidth <= 760;
    const spacingX = compact ? 19 : 22;

    return {
      spacingX,
      spacingY: spacingX * 0.76,
      radius: compact ? 132 : 198,
      pull: compact ? 0.28 : 0.34,
      dotSize: compact ? 1.15 : 1.34,
      ease: 0.13
    };
  }

  function parseCssColor(value, fallback) {
    const normalizedValue = String(value || "").trim();

    if (/^#([0-9a-f]{3}){1,2}$/i.test(normalizedValue)) {
      const hex = normalizedValue.slice(1);
      const expandedHex = hex.length === 3
        ? hex.split("").map((char) => `${char}${char}`).join("")
        : hex;

      return [
        Number.parseInt(expandedHex.slice(0, 2), 16),
        Number.parseInt(expandedHex.slice(2, 4), 16),
        Number.parseInt(expandedHex.slice(4, 6), 16)
      ];
    }

    const rgbMatch = normalizedValue.match(/rgba?\(([^)]+)\)/i);

    if (rgbMatch) {
      const channels = rgbMatch[1]
        .split(",")
        .slice(0, 3)
        .map((channel) => Number.parseFloat(channel.trim()));

      if (channels.every((channel) => Number.isFinite(channel))) {
        return channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))));
      }
    }

    return fallback;
  }

  function updateDotPalette() {
    const rootStyles = window.getComputedStyle(document.documentElement);
    baseDotColor = parseCssColor(rootStyles.getPropertyValue("--text"), baseDotColor);
    accentDotColor = parseCssColor(rootStyles.getPropertyValue("--accent"), accentDotColor);
  }

  function mixDotColor(mixAmount) {
    const clampedMix = Math.max(0, Math.min(1, mixAmount));
    const red = Math.round(baseDotColor[0] + (accentDotColor[0] - baseDotColor[0]) * clampedMix);
    const green = Math.round(baseDotColor[1] + (accentDotColor[1] - baseDotColor[1]) * clampedMix);
    const blue = Math.round(baseDotColor[2] + (accentDotColor[2] - baseDotColor[2]) * clampedMix);

    return `rgb(${red} ${green} ${blue})`;
  }

  function getMediaRects() {
    return Array.from(document.querySelectorAll(".project-page .project-media-item img, .project-page .project-media-item video"))
      .map((media) => media.getBoundingClientRect())
      .filter((rect) => {
        return rect.width > 0 &&
          rect.height > 0 &&
          rect.right >= 0 &&
          rect.bottom >= 0 &&
          rect.left <= width &&
          rect.top <= height;
      });
  }

  function isInsideMediaRect(x, y, mediaRects) {
    return mediaRects.some((rect) => {
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }

  function getIntroWaveState(now) {
    if (prefersReducedMotion || !introSection || !gallerySection) {
      return null;
    }

    const introRect = introSection.getBoundingClientRect();
    const galleryRect = gallerySection.getBoundingClientRect();

    if (
      introRect.bottom <= 0 ||
      introRect.top >= height ||
      introRect.bottom <= height * 0.58 ||
      galleryRect.top <= height * 0.68
    ) {
      return null;
    }

    const bandSize = Math.max(92, Math.min(introRect.height * 0.18, 210));
    const travel = introRect.height + bandSize * 2;
    const motionDuration = 2820;
    const pauseDuration = 1040;
    const cycleDuration = motionDuration + pauseDuration;
    const cyclePosition = now % cycleDuration;

    if (cyclePosition > motionDuration) {
      return {
        active: false,
        bandReach: bandSize * 1.85,
        bandY: introRect.top - bandSize,
        introRect,
        progress: 1,
        strength: 0
      };
    }

    const progress = cyclePosition / motionDuration;
    const strength = Math.pow(Math.sin(progress * Math.PI), 1.08);

    return {
      active: true,
      bandReach: bandSize * 1.85,
      bandY: introRect.top - bandSize + travel * progress,
      introRect,
      progress,
      strength
    };
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    updateDotPalette();
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
          influence: 0,
          scaleInfluence: 0
        });
      }
    }
  }

  function drawDots() {
    const settings = getSettings();
    const mediaRects = getMediaRects();
    const introWave = getIntroWaveState(performance.now());
    context.clearRect(0, 0, width, height);

    dots.forEach((dot) => {
      let targetX = dot.baseX;
      let targetY = dot.baseY;
      let influence = 0;
      let scaleInfluence = 0;
      let colorMix = 0;
      let hoverInfluence = 0;

      if (pointer.active) {
        const pointerRadius = settings.radius * 0.94;
        const pointerPull = settings.pull * 0.98;
        const pointerDrift = 1.04;
        const pointerEase = 0.94;
        const dx = pointer.x - dot.baseX;
        const dy = pointer.y - dot.baseY;
        const distance = Math.hypot(dx, dy);

        if (distance < pointerRadius) {
          const pointerInfluence = Math.pow(1 - distance / pointerRadius, 1.8) * pointerEase;
          targetX += dx * pointerInfluence * pointerPull * pointerDrift;
          targetY += dy * pointerInfluence * pointerPull * pointerDrift;
          hoverInfluence = Math.max(hoverInfluence, pointerInfluence);
          influence = Math.max(influence, pointerInfluence * 0.82);
          scaleInfluence = Math.max(scaleInfluence, pointerInfluence * 0.82);
        }
      }

      if (introWave?.active) {
        const insideIntroBand = dot.baseY >= introWave.introRect.top - introWave.bandReach
          && dot.baseY <= introWave.introRect.bottom + introWave.bandReach;

        if (insideIntroBand) {
          const verticalDistance = Math.abs(dot.baseY - introWave.bandY);

          if (verticalDistance < introWave.bandReach) {
            const waveFalloff = Math.pow(1 - verticalDistance / introWave.bandReach, 1.8);
            const waveRipple = 0.76 + 0.3 * Math.sin(
              (dot.baseX / Math.max(width, 1)) * Math.PI * 2.6 + introWave.progress * Math.PI * 3.2
            );
            const waveInfluence = waveFalloff * waveRipple * introWave.strength;
            const waveScaleProgress = Math.max(0, Math.min(1, (introWave.progress - 0.08) / 0.5));
            const waveScaleRamp = waveScaleProgress * waveScaleProgress * (3 - 2 * waveScaleProgress);
            const waveScaleFactor = 0.3 + waveScaleRamp * 0.7;
            const pointerWaveShield = Math.pow(1 - Math.min(1, hoverInfluence * 1.4), 2);
            const visibleWaveInfluence = waveInfluence * pointerWaveShield;

            targetX += Math.sin(dot.baseY * 0.018 + introWave.progress * Math.PI * 6.1) * visibleWaveInfluence * 7;
            targetY += visibleWaveInfluence * 11;
            influence = Math.max(influence, Math.min(1.04, visibleWaveInfluence * 0.92));
            scaleInfluence = Math.max(
              scaleInfluence,
              Math.min(1.04, visibleWaveInfluence * 0.92 * waveScaleFactor)
            );
            const delayedColorProgress = Math.max(0, Math.min(1, (introWave.progress - 0.38) / 0.42));
            colorMix = Math.max(
              colorMix,
              Math.min(1, Math.pow(delayedColorProgress, 1.05) * 0.9 + visibleWaveInfluence * 0.16) * pointerWaveShield
            );
          }
        }
      }

      dot.x += (targetX - dot.x) * settings.ease;
      dot.y += (targetY - dot.y) * settings.ease;
      dot.influence += (influence - dot.influence) * 0.19;
      dot.scaleInfluence += (scaleInfluence - dot.scaleInfluence) * 0.19;

      if (isInsideMediaRect(dot.x, dot.y, mediaRects)) {
        return;
      }

      const hoverScaleBoost = hoverInfluence * 0.12;
      const size = settings.dotSize + dot.scaleInfluence * 2.45 + hoverScaleBoost;
      context.globalAlpha = Math.min(1, 0.34 + dot.influence * 0.6 + hoverInfluence * 0.03);
      context.fillStyle = colorMix > 0.01 ? mixDotColor(colorMix) : `rgb(${baseDotColor[0]} ${baseDotColor[1]} ${baseDotColor[2]})`;
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

  updateDotPalette();
  resizeCanvas();
  drawDots();

  if (supportsPointerMagnet) {
    window.addEventListener("pointermove", updatePointer);
    window.addEventListener("pointerleave", () => {
      pointer.active = false;
    });
  }
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
