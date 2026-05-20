(() => {
  const canvas = document.querySelector("[data-about-pointcloud]");

  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d", { alpha: true });
  const shell = canvas.closest(".about-pointcloud-shell") || canvas;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const imageSource = canvas.dataset.src || "";
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ccff00";
  const accentRgb = getColorRgb(accent);
  const mouse = {
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };
  const rotation = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };
  const particles = [];
  let sourceData = createFallbackSource();
  let width = 0;
  let height = 0;
  let dpr = 1;
  let centerX = 0;
  let centerY = 0;
  let modelWidth = 0;
  let modelHeight = 0;
  let depthScale = 0;
  let cameraDistance = 0;
  let frame = null;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const gaussian = (value, center, widthValue) => {
    const distance = (value - center) / widthValue;
    return Math.exp(-distance * distance);
  };
  const randomFrom = (seed) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  };

  function createFallbackSource() {
    const offscreen = document.createElement("canvas");
    const sourceWidth = 280;
    const sourceHeight = 360;
    offscreen.width = sourceWidth;
    offscreen.height = sourceHeight;
    const sourceContext = offscreen.getContext("2d");

    sourceContext.fillStyle = "#000";
    sourceContext.fillRect(0, 0, sourceWidth, sourceHeight);

    const gradient = sourceContext.createRadialGradient(142, 154, 18, 142, 154, 132);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.62, "#d8d8d8");
    gradient.addColorStop(1, "#444");
    sourceContext.fillStyle = gradient;
    sourceContext.beginPath();
    sourceContext.ellipse(142, 152, 86, 112, 0, 0, Math.PI * 2);
    sourceContext.fill();

    sourceContext.fillStyle = "#eee";
    sourceContext.fillRect(98, 224, 88, 66);
    sourceContext.beginPath();
    sourceContext.ellipse(142, 298, 112, 70, 0, Math.PI, Math.PI * 2);
    sourceContext.fill();

    sourceContext.fillStyle = "#111";
    sourceContext.beginPath();
    sourceContext.ellipse(110, 138, 17, 8, 0, 0, Math.PI * 2);
    sourceContext.ellipse(172, 138, 17, 8, 0, 0, Math.PI * 2);
    sourceContext.fill();
    sourceContext.beginPath();
    sourceContext.ellipse(142, 206, 38, 13, 0, 0, Math.PI * 2);
    sourceContext.fill();

    sourceContext.fillStyle = "#f6f6f6";
    sourceContext.fillRect(56, 50, 168, 36);
    sourceContext.beginPath();
    sourceContext.ellipse(142, 82, 94, 36, 0, Math.PI, Math.PI * 2);
    sourceContext.fill();

    return {
      data: sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data,
      width: sourceWidth,
      height: sourceHeight,
      isFallback: true
    };
  }

  function createImageSource(image) {
    const crop = {
      x: 0.14,
      y: 0.2,
      width: 0.72,
      height: 0.76
    };
    const cropWidth = image.naturalWidth * crop.width;
    const cropHeight = image.naturalHeight * crop.height;
    const sourceWidth = 320;
    const sourceHeight = Math.round(sourceWidth * (cropHeight / cropWidth));
    const offscreen = document.createElement("canvas");
    const sourceContext = offscreen.getContext("2d", { willReadFrequently: true });

    offscreen.width = sourceWidth;
    offscreen.height = sourceHeight;
    sourceContext.drawImage(
      image,
      image.naturalWidth * crop.x,
      image.naturalHeight * crop.y,
      cropWidth,
      cropHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    return {
      data: sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data,
      width: sourceWidth,
      height: sourceHeight,
      isFallback: false
    };
  }

  function getLuminanceAt(source, x, y) {
    const safeX = clamp(x, 0, source.width - 1);
    const safeY = clamp(y, 0, source.height - 1);
    const index = (safeY * source.width + safeX) * 4;
    const red = source.data[index];
    const green = source.data[index + 1];
    const blue = source.data[index + 2];

    return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  }

  function getPortraitMask(nx, ny) {
    const head = Math.pow(nx / 0.82, 2) + Math.pow((ny + 0.14) / 0.78, 2) < 1.05;
    const cap = Math.pow(nx / 0.9, 2) + Math.pow((ny + 0.74) / 0.18, 2) < 1.08;
    const neck = Math.abs(nx) < 0.34 && ny > 0.34 && ny < 0.72;
    const shoulders = ny > 0.5 && Math.abs(nx) < 1.08 - (ny - 0.5) * 0.42;

    return head || cap || neck || shoulders;
  }

  function getDepth(nx, ny, luminance, edge, seed) {
    const headBulge = clamp(1 - Math.pow(nx / 0.82, 2) - Math.pow((ny + 0.1) / 0.84, 2), 0, 1);
    const cheekBulge = (gaussian(nx, -0.36, 0.34) + gaussian(nx, 0.36, 0.34))
      * gaussian(ny, 0.06, 0.44)
      * 0.5;
    const noseRidge = gaussian(nx, 0, 0.12) * gaussian(ny, 0.02, 0.32);
    const browRidge = gaussian(ny, -0.23, 0.11) * gaussian(Math.abs(nx), 0.34, 0.34) * 0.5;
    const eyeValley = (gaussian(nx, -0.34, 0.18) + gaussian(nx, 0.34, 0.18))
      * gaussian(ny, -0.18, 0.08)
      * 0.5;
    const mouthValley = gaussian(nx, 0, 0.34) * gaussian(ny, 0.28, 0.1);
    const shoulderDrop = clamp((ny - 0.48) / 0.5, 0, 1);
    const sideFalloff = Math.pow(Math.abs(nx), 1.75) * clamp(1 - shoulderDrop * 0.6, 0.35, 1);
    const detailDepth = edge * 0.36 + (1 - luminance) * 0.08;

    return clamp(
      headBulge * 0.74
        + cheekBulge * 0.2
        + noseRidge * 0.42
        + browRidge * 0.12
        + detailDepth
        - eyeValley * 0.22
        - mouthValley * 0.2
        - shoulderDrop * 0.3
        - sideFalloff * 0.3
        + randomFrom(seed + 9) * 0.05,
      0,
      1
    );
  }

  function makeParticles() {
    particles.length = 0;

    if (!width || !height) {
      return;
    }

    const source = sourceData;
    const isCompact = width < 620;
    const step = source.isFallback ? (isCompact ? 4 : 3) : (isCompact ? 4 : 2);
    const maxParticles = source.isFallback ? 7600 : (isCompact ? 6000 : 9600);
    const sourceAspect = source.width / source.height;
    modelWidth = Math.min(width * (isCompact ? 0.82 : 0.9), height * 0.92 * sourceAspect);
    modelHeight = modelWidth / sourceAspect;
    depthScale = modelWidth * 0.48;
    cameraDistance = modelWidth * 2.35;
    centerX = width * (isCompact ? 0.5 : 0.54);
    centerY = height * 0.52;

    for (let y = 0; y < source.height; y += step) {
      for (let x = 0; x < source.width; x += step) {
        const px = x / source.width;
        const py = y / source.height;
        const nx = (px - 0.5) * 2;
        const ny = (py - 0.5) * 2;

        if (!getPortraitMask(nx, ny)) {
          continue;
        }

        const index = (y * source.width + x) * 4;
        const red = source.data[index];
        const green = source.data[index + 1];
        const blue = source.data[index + 2];
        const alpha = source.data[index + 3] / 255;

        if (alpha < 0.2) {
          continue;
        }

        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        const maxChannel = Math.max(red, green, blue) / 255;
        const minChannel = Math.min(red, green, blue) / 255;
        const saturation = maxChannel - minChannel;
        const edge = Math.abs(luminance - getLuminanceAt(source, x + step, y))
          + Math.abs(luminance - getLuminanceAt(source, x, y + step));
        const score = source.isFallback
          ? clamp(luminance * 0.82 + edge * 1.8, 0, 1)
          : clamp((1 - luminance) * 0.36 + saturation * 0.34 + edge * 1.65, 0, 1);
        const density = source.isFallback
          ? clamp(score * 0.92 + edge * 1.5, 0, 1)
          : clamp(score * 1.82, 0, 1);
        const seed = x * 0.733 + y * 1.127;

        if (score < (source.isFallback ? 0.18 : 0.13) || randomFrom(seed) > density) {
          continue;
        }

        const depth = getDepth(nx, ny, luminance, edge, seed);
        const jitter = step * (0.34 + randomFrom(seed + 15) * 0.28);
        const modelX = (px - 0.5) * modelWidth + (randomFrom(seed + 2) - 0.5) * jitter;
        const modelY = (py - 0.5) * modelHeight + (randomFrom(seed + 4) - 0.5) * jitter;
        const modelZ = (depth - 0.34) * depthScale;
        const projected = projectPoint(modelX, modelY, modelZ);

        particles.push({
          modelX,
          modelY,
          modelZ,
          x: projected.x,
          y: projected.y,
          depth,
          edge,
          size: source.isFallback ? 1.2 + score * 1.2 : 0.75 + score * 1.65,
          alpha: source.isFallback ? 0.34 + score * 0.5 : 0.26 + score * 0.72,
          phase: randomFrom(seed + 12) * Math.PI * 2,
          wobble: 0.3 + randomFrom(seed + 20) * 1.25
        });

        if (particles.length >= maxParticles) {
          return;
        }
      }
    }
  }

  function projectPoint(x, y, z) {
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const rotatedX = x * cosY + z * sinY;
    const zAfterY = -x * sinY + z * cosY;
    const rotatedY = y * cosX - zAfterY * sinX;
    const rotatedZ = y * sinX + zAfterY * cosX;
    const perspective = cameraDistance / (cameraDistance - rotatedZ);

    return {
      x: centerX + rotatedX * perspective,
      y: centerY + rotatedY * perspective,
      z: rotatedZ,
      scale: perspective
    };
  }

  function resize() {
    const rect = shell.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    mouse.x = width / 2;
    mouse.y = height / 2;
    mouse.targetX = mouse.x;
    mouse.targetY = mouse.y;
    makeParticles();
  }

  function draw(time = 0) {
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    mouse.x += (mouse.targetX - mouse.x) * 0.12;
    mouse.y += (mouse.targetY - mouse.y) * 0.12;
    rotation.targetY = mouse.active
      ? clamp((mouse.x / width - 0.5) * 0.9, -0.46, 0.46)
      : Math.sin(time * 0.00028) * 0.14;
    rotation.targetX = mouse.active
      ? clamp(-(mouse.y / height - 0.5) * 0.52, -0.28, 0.28)
      : Math.cos(time * 0.00022) * 0.05;
    rotation.x += (rotation.targetX - rotation.x) * 0.075;
    rotation.y += (rotation.targetY - rotation.y) * 0.075;

    const radius = Math.min(width, height) * 0.36;
    const renderItems = [];

    particles.forEach((particle) => {
      const floatX = Math.sin(time * 0.001 + particle.phase) * particle.wobble;
      const floatY = Math.cos(time * 0.00088 + particle.phase) * particle.wobble;
      const baseProjected = projectPoint(
        particle.modelX + floatX,
        particle.modelY + floatY,
        particle.modelZ
      );
      const toMouseX = mouse.x - baseProjected.x;
      const toMouseY = mouse.y - baseProjected.y;
      const distance = Math.hypot(toMouseX, toMouseY) || 1;
      const influence = mouse.active ? Math.max(0, 1 - distance / radius) : 0;
      const force = influence * influence;
      const zPush = force * depthScale * (0.22 + particle.depth * 0.34);
      const projected = projectPoint(
        particle.modelX + floatX,
        particle.modelY + floatY,
        particle.modelZ + zPush
      );
      const repel = (38 + particle.depth * 118 + particle.edge * 220) * projected.scale;
      const targetX = projected.x - (toMouseX / distance) * force * repel;
      const targetY = projected.y - (toMouseY / distance) * force * repel;

      particle.x += (targetX - particle.x) * 0.09;
      particle.y += (targetY - particle.y) * 0.09;

      const depthLight = clamp((projected.z + depthScale * 0.32) / (depthScale * 1.35), 0, 1);
      const size = particle.size * projected.scale * (0.82 + depthLight * 0.78 + force * 1.25);
      const alpha = clamp(particle.alpha * (0.42 + depthLight * 0.74) + force * 0.36, 0.08, 1);

      renderItems.push({
        x: particle.x,
        y: particle.y,
        z: projected.z,
        size,
        alpha
      });
    });

    renderItems
      .sort((left, right) => left.z - right.z)
      .forEach((item) => {
        context.fillStyle = `rgba(${accentRgb.red}, ${accentRgb.green}, ${accentRgb.blue}, ${item.alpha})`;
        context.fillRect(item.x - item.size / 2, item.y - item.size / 2, item.size, item.size);
      });

    context.globalCompositeOperation = "source-over";

    if (!reduceMotion.matches) {
      frame = requestAnimationFrame(draw);
    }
  }

  function getColorRgb(color) {
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const full = hex.length === 3
        ? hex.split("").map((item) => item + item).join("")
        : hex;

      return {
        red: parseInt(full.slice(0, 2), 16),
        green: parseInt(full.slice(2, 4), 16),
        blue: parseInt(full.slice(4, 6), 16)
      };
    }

    return { red: 204, green: 255, blue: 0 };
  }

  function start() {
    if (frame) {
      cancelAnimationFrame(frame);
    }

    resize();
    draw();
  }

  if (imageSource) {
    const image = new Image();
    image.onload = () => {
      sourceData = createImageSource(image);
      start();
    };
    image.onerror = start;
    image.src = imageSource;
  } else {
    start();
  }

  shell.addEventListener("pointerenter", () => {
    mouse.active = true;
  });

  shell.addEventListener("pointermove", (event) => {
    const rect = shell.getBoundingClientRect();
    mouse.active = true;
    mouse.targetX = event.clientX - rect.left;
    mouse.targetY = event.clientY - rect.top;
  });

  shell.addEventListener("pointerleave", () => {
    mouse.active = false;
    mouse.targetX = width / 2;
    mouse.targetY = height / 2;
  });

  window.addEventListener("resize", resize);
})();
