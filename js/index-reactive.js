(() => {
  const grid = document.querySelector("[data-index-reactive]");
  if (!grid) return;
  const desktop = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1000px) and (orientation: landscape)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const steps = 28;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  let renderer, active;
  const states = new Map();
  let failed = false;
  let frame = 0;
  let previousTime = 0;

  function createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.className = "index-reactive-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL unavailable");
    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error("Shader unavailable");
      return result;
    }
    const program = gl.createProgram();
    const vertex = shader(gl.VERTEX_SHADER, `
      attribute vec2 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position / 1.16, 0.0, 1.0);
      }
    `);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D image;
      uniform vec2 pointer, crop, offset, resolution, texel;
      uniform float radius;
      uniform float strength, glitch, time;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        vec2 p = vUv;
        vec2 delta = p - pointer;
        float distance = length(delta * resolution) / radius;
        float falloff = exp(-distance * distance * 2.0) * strength;
        p -= delta * falloff * 0.069;
        float band = floor(p.y * 140.0);
        float tick = floor(time * 15.0);
        float tear = step(0.83, hash(band + tick));
        p.x += (hash(band * 3.0 + tick) - 0.5) * tear * glitch * falloff * 0.045;
        p = (p - 0.5) * crop + offset;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0)
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        else {
          // A soft halo blends the lens into the untouched image, with no hard rim.
          float halo = exp(-pow((distance - 0.7) / 0.38, 2.0)) * strength;
          vec2 blur = texel * halo * 0.8;
          vec4 colour = texture2D(image, p) * 0.4;
          colour += texture2D(image, p + vec2(blur.x, 0.0)) * 0.15;
          colour += texture2D(image, p - vec2(blur.x, 0.0)) * 0.15;
          colour += texture2D(image, p + vec2(0.0, blur.y)) * 0.15;
          colour += texture2D(image, p - vec2(0.0, blur.y)) * 0.15;
          gl_FragColor = colour;
        }
      }
    `);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Program unavailable");
    gl.useProgram(program);
    const vertices = new Float32Array((steps + 1) ** 2 * 4);
    const rest = new Float32Array((steps + 1) ** 2 * 2);
    const velocity = new Float32Array(rest.length);
    const indices = [];
    for (let y = 0; y <= steps; y++) for (let x = 0; x <= steps; x++) {
      const i = y * (steps + 1) + x;
      vertices.set([x / steps * 2 - 1, y / steps * 2 - 1, x / steps, y / steps], i * 4);
      rest.set([vertices[i * 4], vertices[i * 4 + 1]], i * 2);
      if (x < steps && y < steps) indices.push(i, i + 1, i + steps + 1, i + 1, i + steps + 2, i + steps + 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [["position", 0], ["uv", 8]]) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const uniforms = Object.fromEntries(["pointer", "crop", "offset", "resolution", "texel", "radius", "strength", "glitch", "time"].map((name) => [name, gl.getUniformLocation(program, name)]));
    canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); failed = true; stop(); });
    return { canvas, gl, vertices, rest, velocity, uniforms, count: indices.length };
  }

  function release(state) {
    state.card.classList.remove("is-reactive-hover", "is-reactive-pointer");
    state.card.style.removeProperty("--caption-x");
    state.card.style.removeProperty("--caption-y");
    state.canvas.remove();
    states.delete(state.card);
    if (active === state) active = null;
  }
  function stop() {
    states.forEach(release);
    cancelAnimationFrame(frame);
    frame = previousTime = 0;
  }
  function requestFrame() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function draw(time) {
    frame = 0;
    const dt = Math.min(2, previousTime ? (time - previousTime) / 16.67 : 1);
    previousTime = time;
    let moving = false;
    states.forEach((state) => { moving = drawState(state, time, dt) || moving; });
    if (moving) requestFrame();
    else previousTime = 0;
  }
  function drawState(active, time, dt) {
    const ease = 1 - Math.pow(0.86, dt);
    const shapeEase = active.inside ? ease : 1 - Math.pow(0.83, dt);
    active.amount += ((active.inside ? 1 : 0) - active.amount) * shapeEase;
    active.x += (active.targetX - active.x) * ease;
    active.y += (active.targetY - active.y) * ease;
    active.glitch *= Math.pow(0.88, dt);
    const { gl, rest, uniforms } = renderer;
    const { canvas, context, vertices, velocity } = active;
    const rect = active.frame.getBoundingClientRect();
    const radius = clamp(Math.min(rect.width, rect.height) * 0.48, 80, 160);
    const captionTime = dt / 60;
    const captionRate = 8.5;
    const captionDecay = Math.exp(-captionRate * captionTime);
    // Critical damping eases acceleration and arrival without overshooting the cursor.
    for (const [position, velocity, target] of [["captionX", "captionVX", "targetX"], ["captionY", "captionVY", "targetY"]]) {
      const offset = active[position] - active[target];
      const momentum = active[velocity] + captionRate * offset;
      active[position] = active[target] + (offset + momentum * captionTime) * captionDecay;
      active[velocity] = (active[velocity] - captionRate * momentum * captionTime) * captionDecay;
    }
    active.card.style.setProperty("--caption-x", `${active.captionX * rect.width}px`);
    active.card.style.setProperty("--caption-y", `${(1 - active.captionY) * rect.height}px`);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width * 1.16 * ratio));
    const height = Math.max(1, Math.round(rect.height * 1.16 * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    if (renderer.canvas.width !== width || renderer.canvas.height !== height) {
      renderer.canvas.width = width; renderer.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    let energy = 0;
    // Deform the image mesh locally, rather than merely clipping its outline.
    const substeps = Math.ceil(dt / 0.5);
    const step = dt / substeps;
    for (let n = 0; n < substeps; n++) for (let i = 0; i < rest.length / 2; i++) {
      const dx = rest[i * 2] - (active.x * 2 - 1);
      const dy = rest[i * 2 + 1] - (active.y * 2 - 1);
      const distance = Math.hypot(dx * rect.width / 2, dy * rect.height / 2) / radius;
      const edgeDistance = Math.min(1 - Math.abs(rest[i * 2]), 1 - Math.abs(rest[i * 2 + 1]));
      const edgeT = clamp(edgeDistance / 0.32, 0, 1);
      const edgeWeight = 1 - edgeT * edgeT * (3 - 2 * edgeT);
      // Keep the image interior fixed; only the soft border band follows the spring.
      const influence = Math.exp(-distance * distance * 2.0) * active.amount * edgeWeight;
      for (let axis = 0; axis < 2; axis++) {
        const index = i * 4 + axis;
        const target = rest[i * 2 + axis] + (axis ? dy : dx) * influence * 0.31;
        const v = i * 2 + axis;
        velocity[v] += ((target - vertices[index]) * 0.105 - velocity[v] * 0.16) * step;
        vertices[index] += velocity[v] * step;
        energy = Math.max(energy, Math.abs(velocity[v]), Math.abs(target - vertices[index]));
      }
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    const media = active.media;
    const mediaWidth = media.videoWidth || media.naturalWidth;
    const mediaHeight = media.videoHeight || media.naturalHeight;
    const style = getComputedStyle(media);
    const fit = style.objectFit === "contain" ? Math.min : Math.max;
    const scale = fit(rect.width / mediaWidth, rect.height / mediaHeight) * (parseFloat(style.scale) || 1) * (parseFloat(media.style.transform.match(/scale\(([^)]+)\)/)?.[1]) || 1);
    const cropX = rect.width / (mediaWidth * scale);
    const cropY = rect.height / (mediaHeight * scale);
    const position = style.objectPosition.split(" ").map((part) => parseFloat(part) / 100);
    gl.uniform2f(uniforms.crop, cropX, cropY);
    gl.uniform2f(uniforms.resolution, rect.width, rect.height);
    gl.uniform2f(uniforms.texel, 1 / mediaWidth, 1 / mediaHeight);
    gl.uniform1f(uniforms.radius, radius);
    gl.uniform2f(uniforms.offset, 0.5 + (position[0] - 0.5) * (1 - cropX), 0.5 - (position[1] - 0.5) * (1 - cropY));
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
      active.card.classList.add("is-reactive-hover");
    } catch { failed = true; stop(); return false; }
    gl.uniform2f(uniforms.pointer, active.x, active.y);
    gl.uniform1f(uniforms.strength, active.amount);
    gl.uniform1f(uniforms.glitch, active.glitch);
    gl.uniform1f(uniforms.time, time / 1000);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, renderer.count, gl.UNSIGNED_SHORT, 0);
    // Share one GPU context while each departing card keeps its own settling mesh.
    context.clearRect(0, 0, width, height);
    context.drawImage(renderer.canvas, 0, 0);
    // Keep the departing label anchored until its full opacity transition finishes.
    const fading = !active.inside && time < active.fadeUntil;
    if (!active.inside && !fading && active.amount < 0.002 && energy < 0.001) { release(active); return false; }
    const captionEnergy = Math.abs(active.captionVX) + Math.abs(active.captionVY) + Math.abs(active.captionX - active.targetX) + Math.abs(active.captionY - active.targetY);
    return fading || media.tagName === "VIDEO" || energy > 0.001 || captionEnergy > 0.0002 || active.glitch > 0.001 || Math.abs((active.inside ? 1 : 0) - active.amount) > 0.002 || Math.abs(active.x - active.targetX) + Math.abs(active.y - active.targetY) > 0.002;
  }

  grid.querySelectorAll(".project-card").forEach((card) => {
    card.addEventListener("pointerenter", (event) => {
      if (!desktop.matches || reducedMotion.matches || failed || event.pointerType === "touch") return;
      const mediaFrame = card.querySelector(".index-media-frame");
      const media = mediaFrame.querySelector("video, img");
      if (media.tagName === "VIDEO" ? media.readyState < 2 : !media.naturalWidth) return;
      if (active && active.card !== card) {
        active.inside = false;
        active.fadeUntil = performance.now() + 1400;
        active.card.classList.remove("is-reactive-pointer");
      }
      try { renderer ||= createRenderer(); } catch { failed = true; return; }
      const rect = mediaFrame.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
      let state = states.get(card);
      if (!state) {
        const canvas = document.createElement("canvas");
        canvas.className = "index-reactive-canvas";
        canvas.setAttribute("aria-hidden", "true");
        const context = canvas.getContext("2d");
        if (!context) return;
        state = { card, frame: mediaFrame, media, canvas, context, vertices: renderer.vertices.slice(), velocity: new Float32Array(renderer.rest.length), amount: 0, x, y, captionX: x, captionY: y, captionVX: 0, captionVY: 0, glitch: 1 };
        states.set(card, state);
        mediaFrame.append(canvas);
        card.style.setProperty("--caption-x", `${x * rect.width}px`);
        card.style.setProperty("--caption-y", `${(1 - y) * rect.height}px`);
      }
      active = state;
      Object.assign(active, { inside: true, targetX: x, targetY: y, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now() });
      card.classList.add("is-reactive-pointer");
      requestFrame();
    });
    card.addEventListener("pointermove", (event) => {
      if (!active || active.card !== card || !active.inside) return;
      const rect = active.frame.getBoundingClientRect();
      const now = performance.now();
      const speed = Math.hypot(event.clientX - active.lastX, event.clientY - active.lastY) / Math.max(8, now - active.lastTime);
      active.targetX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      active.targetY = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
      active.glitch = Math.max(active.glitch, Math.min(1, speed * 0.45));
      active.lastX = event.clientX; active.lastY = event.clientY; active.lastTime = now;
      requestFrame();
    });
    card.addEventListener("pointerleave", () => {
      if (!active || active.card !== card) return;
      active.inside = false;
      active.fadeUntil = performance.now() + 1400;
      card.classList.remove("is-reactive-pointer");
      requestFrame();
    });
  });
  desktop.addEventListener("change", stop);
  reducedMotion.addEventListener("change", stop);
  window.addEventListener("blur", stop);
  window.addEventListener("resize", stop);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
})();
