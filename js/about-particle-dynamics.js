(() => {
  class SurfaceFlow {
    constructor(size = 48) {
      this.size = size;
      this.x = new Float32Array(size * size);
      this.y = new Float32Array(size * size);
      this.nextX = this.x.slice();
      this.nextY = this.y.slice();
      this.pressure = this.x.slice();
      this.nextPressure = this.x.slice();
      this.divergence = this.x.slice();
      this.pixels = new Uint8Array(size * size * 4);
      this.previous = null;
    }
    sample(field, x, y) {
      const n = this.size;
      x = Math.max(0, Math.min(n - 1.001, x));
      y = Math.max(0, Math.min(n - 1.001, y));
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const i = iy * n + ix;
      return (field[i] * (1 - fx) + field[i + 1] * fx) * (1 - fy)
        + (field[i + n] * (1 - fx) + field[i + n + 1] * fx) * fy;
    }
    update(pointer, dt) {
      const n = this.size;
      const previous = this.previous || pointer;
      const dx = pointer.active && previous.active ? pointer.x - previous.x : 0;
      const dy = pointer.active && previous.active ? pointer.y - previous.y : 0;
      this.previous = { ...pointer };
      const damping = Math.pow(0.975, dt);
      const aspect = pointer.aspect || 1;
      // Semi-Lagrangian transport keeps the wake alive after the pointer has passed.
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const px = x - this.x[i] * dt * 1.8, py = y - this.y[i] * dt * 1.8;
        const radius = n * 0.075 * Math.min(aspect, 1);
        const rx = (x - pointer.x * (n - 1)) * aspect, ry = y - pointer.y * (n - 1);
        const distanceSquared = rx * rx + ry * ry;
        // A weak, long tail carries distant gestures without a boundary at the canvas edge.
        const local = Math.exp(-distanceSquared / (radius * radius));
        const distant = 0.035 / (1 + distanceSquared / ((n * 0.35) ** 2));
        const splat = (local + distant) / 1.035;
        this.nextX[i] = Math.max(-1, Math.min(1, this.sample(this.x, px, py) * damping + dx * 100 * splat));
        this.nextY[i] = Math.max(-1, Math.min(1, this.sample(this.y, px, py) * damping + dy * 100 * splat));
      }
      [this.x, this.nextX] = [this.nextX, this.x];
      [this.y, this.nextY] = [this.nextY, this.y];
      this.pressure.fill(0);
      this.nextPressure.fill(0);
      // Project out divergence: strokes roll into currents instead of pushing a circular hole.
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        this.divergence[i] = (this.x[i + 1] - this.x[i - 1] + this.y[i + n] - this.y[i - n]) * 0.5;
      }
      for (let iteration = 0; iteration < 14; iteration++) {
        for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          this.nextPressure[i] = (this.pressure[i - 1] + this.pressure[i + 1]
            + this.pressure[i - n] + this.pressure[i + n] - this.divergence[i]) * 0.25;
        }
        [this.pressure, this.nextPressure] = [this.nextPressure, this.pressure];
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (x === 0 || y === 0 || x === n - 1 || y === n - 1) {
          this.x[i] = this.y[i] = 0;
        } else {
          this.x[i] -= (this.pressure[i + 1] - this.pressure[i - 1]) * 0.5;
          this.y[i] -= (this.pressure[i + n] - this.pressure[i - n]) * 0.5;
        }
        this.pixels[i * 4] = Math.round(128 + Math.max(-1, Math.min(1, this.x[i])) * 127);
        this.pixels[i * 4 + 1] = Math.round(128 + Math.max(-1, Math.min(1, this.y[i])) * 127);
        this.pixels[i * 4 + 3] = 255;
      }
      return this.pixels;
    }
  }

  function create(gl, buffers) {
    if (!gl.createTransformFeedback) return null;
    const vertex = `#version 300 es
      precision highp float;
      in vec3 aOrigin;
      in vec3 aNormal;
      in vec3 aOffset;
      in vec3 aVelocity;
      in float aSeed;
      uniform mat4 uMatrix;
      uniform sampler2D uFlow;
      uniform vec3 uRight, uUp;
      uniform float uStep, uTime, uActivation, uProximity;
      out vec3 nextOffset;
      out vec3 nextVelocity;
      vec3 curl(vec3 p, float t) {
        return vec3(
          sin(p.x + t) * cos(p.y - t * 0.6) - cos(p.z - t) * sin(p.x + 0.7),
          sin(p.y + t) * cos(p.z + 0.4) - cos(p.x + t) * sin(p.y - t * 0.6),
          sin(p.z - t) * cos(p.x + 0.7) - cos(p.y + t) * sin(p.z + 0.4)
        );
      }
      void main() {
        vec3 position = aOrigin + aOffset;
        vec4 screen = uMatrix * vec4(position, 1.0);
        vec2 uv = screen.xy / screen.w * 0.5 + 0.5;
        vec2 flow = (texture(uFlow, clamp(uv, 0.0, 1.0)).rg * 255.0 - 128.0) / 127.0;
        float agitation = min(length(flow), 1.0);
        vec3 current = uRight * flow.x + uUp * flow.y;
        // Decorrelated currents give neighbouring grains independent flight, not a rubber sheet.
        vec3 phase = vec3(aSeed * 7.3, aSeed * 13.7, aSeed * 19.1);
        vec3 noise = curl(position * 15.0 + phase, uTime * 0.45);
        float response = 0.5 + aSeed * 1.3;
        vec3 acceleration = current * 0.0011 * response;
        acceleration += (noise * 0.000325 + aNormal * (0.000125 * response)) * agitation;
        acceleration *= uActivation;
        // Low drag while interacting lets the released particles coast in three dimensions.
        float returnForce = mix(0.0032, 0.00045, uProximity);
        acceleration -= aOffset * returnForce;
        float offsetLength = length(aOffset);
        acceleration -= aOffset * max(0.0, offsetLength - 0.14) * 0.035;
        nextVelocity = (aVelocity + acceleration * uStep) * pow(mix(0.90, 0.982, uProximity), uStep);
        nextOffset = aOffset + nextVelocity * uStep;
        float distance = length(nextOffset);
        if (distance > 0.20) {
          vec3 outward = nextOffset / distance;
          nextOffset = outward * 0.20;
          nextVelocity -= outward * max(0.0, dot(nextVelocity, outward));
        }
        gl_Position = vec4(0.0);
      }`;
    const fragment = `#version 300 es
      precision mediump float;
      out vec4 color;
      void main() { color = vec4(0.0); }`;
    const shaders = [vertex, fragment].map((source, i) => {
      const shader = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    });
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.transformFeedbackVaryings(program, ["nextOffset", "nextVelocity"], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = Object.fromEntries(["uMatrix", "uFlow", "uRight", "uUp", "uStep", "uTime", "uActivation", "uProximity"].map(name => [name, gl.getUniformLocation(program, name)]));
    const attributes = Object.fromEntries(["aOrigin", "aNormal", "aOffset", "aVelocity", "aSeed"].map(name => [name, gl.getAttribLocation(program, name)]));
    const state = [0, 1].map(() => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buffers.count * 6), gl.DYNAMIC_COPY);
      return buffer;
    });
    const vao = gl.createVertexArray();
    const feedback = gl.createTransformFeedback();
    const flow = new SurfaceFlow();
    const flowTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, flowTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, flow.size, flow.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, flow.update({x:0.5,y:0.5,active:false}, 1));
    let current = 0;
    function attribute(location, buffer, size, stride = 0, offset = 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    }
    return {
      step({dt, time, matrix, pointer, rotationX, rotationY}) {
        gl.bindVertexArray(vao);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, flowTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, flow.size, flow.size, gl.RGBA, gl.UNSIGNED_BYTE, flow.update(pointer, dt));
        gl.uniform1i(uniforms.uFlow, 0);
        gl.uniformMatrix4fv(uniforms.uMatrix, false, matrix);
        gl.uniform1f(uniforms.uStep, Math.min(dt, 2));
        gl.uniform1f(uniforms.uActivation, pointer.active ? 1 : 0);
        gl.uniform1f(uniforms.uProximity, pointer.active ? pointer.proximity ?? 1 : 0);
        gl.uniform1f(uniforms.uTime, time * 0.001);
        gl.uniform3f(uniforms.uRight, Math.cos(rotationY), 0, Math.sin(rotationY));
        gl.uniform3f(uniforms.uUp, Math.sin(rotationX) * Math.sin(rotationY), Math.cos(rotationX), -Math.sin(rotationX) * Math.cos(rotationY));
        attribute(attributes.aOrigin, buffers.positions, 3);
        attribute(attributes.aNormal, buffers.normals, 3);
        attribute(attributes.aSeed, buffers.randoms, 1);
        attribute(attributes.aOffset, state[current], 3, 24, 0);
        attribute(attributes.aVelocity, state[current], 3, 24, 12);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, state[1 - current]);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, buffers.count);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindVertexArray(null);
        current = 1 - current;
      },
      bind(renderProgram) {
        attribute(gl.getAttribLocation(renderProgram, "aDisplacement"), state[current], 3, 24, 0);
        attribute(gl.getAttribLocation(renderProgram, "aVelocity"), state[current], 3, 24, 12);
      }
    };
  }
  window.PORTFOLIO_ABOUT_DYNAMICS = {create};
})();
