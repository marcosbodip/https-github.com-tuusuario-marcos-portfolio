(() => {
  const canvas = document.querySelector("[data-about-bust]");

  if (!canvas) {
    return;
  }

  const shell = canvas.closest(".about-pointcloud-shell") || canvas;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const source = canvas.dataset.src || "assets/about/marcos-bust.glb";
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ccff00";
  const accentRgb = getColorRgb(accent);
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: "high-performance"
  });

  if (!gl) {
    return;
  }

  const mouse = {
    active: false,
    hover: 0,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };
  const rotation = {
    x: -0.08,
    y: 0.38,
    targetX: -0.08,
    targetY: 0.38
  };
  const touchRotation = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };
  const drag = {
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };
  const baseRotationY = 0.38;
  const hoverRotationRangeY = Math.PI * 0.72;
  const buffers = {
    positions: null,
    normals: null,
    uvs: null,
    cavities: null,
    randoms: null,
    count: 0
  };
  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    scale: 1,
    center: [0, 0, 0]
  };
  let frame = null;
  let startTime = performance.now();
  let program = null;
  let texture = null;
  let hasTexture = false;

  const vertexShader = `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    attribute float aCavity;
    attribute float aRandom;
    uniform mat4 uMatrix;
    uniform float uTime;
    uniform float uHover;
    uniform vec2 uPointer;
    uniform float uPixelRatio;
    uniform float uRotationX;
    uniform float uRotationY;
    varying float vLight;
    varying float vDepth;
    varying float vFacing;
    varying float vRandom;
    varying float vInfluence;
    varying float vCavity;
    varying vec2 vUv;

    void main() {
      vec3 position = aPosition;
      position += aNormal * (sin(uTime * 0.0016 + aRandom * 11.0) * 0.004);
      vec4 projected = uMatrix * vec4(position, 1.0);
      vec2 screenPosition = projected.xy / projected.w;
      vec2 pointerDelta = screenPosition - uPointer;
      float pointerDistance = length(pointerDelta);
      float influence = smoothstep(0.58, 0.0, pointerDistance) * uHover;
      vec2 direction = normalize(pointerDelta + vec2(0.0001));
      position += aNormal * influence * influence * (0.01 + aRandom * 0.012);
      projected = uMatrix * vec4(position, 1.0);
      projected.xy += direction * influence * influence * 0.006 * projected.w;
      projected.z += influence * 0.01 * projected.w;
      gl_Position = projected;
      gl_PointSize = clamp((0.42 + aRandom * 0.24 + influence * 0.24) * uPixelRatio / max(projected.w * 0.42, 0.72), 0.56, 2.18);

      float cosY = cos(uRotationY);
      float sinY = sin(uRotationY);
      float cosX = cos(uRotationX);
      float sinX = sin(uRotationX);
      vec3 normal = normalize(aNormal);
      vec3 normalY = vec3(
        normal.x * cosY + normal.z * sinY,
        normal.y,
        -normal.x * sinY + normal.z * cosY
      );
      vec3 viewNormal = normalize(vec3(
        normalY.x,
        normalY.y * cosX - normalY.z * sinX,
        normalY.y * sinX + normalY.z * cosX
      ));
      float keyLight = max(dot(viewNormal, normalize(vec3(-0.5, 0.36, 0.8))), 0.0);
      float rimLight = pow(max(1.0 - abs(viewNormal.z), 0.0), 2.3);
      float shadowCut = smoothstep(-0.36, 0.62, viewNormal.z);
      vLight = clamp(keyLight * 1.2 + rimLight * 0.34, 0.0, 1.0) * (0.18 + shadowCut * 0.82);
      vFacing = smoothstep(-0.1, 0.86, viewNormal.z);
      vDepth = clamp((projected.z / projected.w + 1.0) * 0.5, 0.0, 1.0);
      vRandom = aRandom;
      vInfluence = influence;
      vCavity = aCavity;
      vUv = aUv;
    }
  `;
  const fragmentShader = `
    precision mediump float;
    uniform vec3 uBase;
    uniform vec3 uAccent;
    uniform sampler2D uTexture;
    uniform float uHasTexture;
    uniform float uHover;
    varying float vLight;
    varying float vDepth;
    varying float vFacing;
    varying float vRandom;
    varying float vInfluence;
    varying float vCavity;
    varying vec2 vUv;

    void main() {
      vec2 point = gl_PointCoord - vec2(0.5);
      float fade = smoothstep(0.5, 0.18, length(point));
      vec3 texel = texture2D(uTexture, vec2(vUv.x, 1.0 - vUv.y)).rgb;
      float textureLight = mix(0.72, dot(texel, vec3(0.2126, 0.7152, 0.0722)), uHasTexture);
      float textureContrast = clamp((textureLight - 0.5) * 1.42 + 0.5, 0.0, 1.0);
      float textureShadow = 1.0 - smoothstep(0.18, 0.66, textureContrast);
      float detail = smoothstep(0.06, 0.84, textureContrast);
      float depthShade = smoothstep(0.08, 0.92, vDepth);
      float frontalDetail = smoothstep(0.22, 0.9, vFacing);
      float cavity = pow(smoothstep(0.035, 0.62, vCavity), 0.72);
      float form = vLight * 1.26 + depthShade * 0.24 + frontalDetail * 0.12;
      float scan = 0.035 + form + detail * 0.58 - textureShadow * 0.68 - cavity * 0.86 + vRandom * 0.035 + uHover * 0.1;
      float colorInfluence = smoothstep(0.02, 0.86, vInfluence) + smoothstep(0.35, 1.0, uHover) * 0.22;
      vec3 color = mix(uBase, uAccent, clamp(colorInfluence, 0.0, 1.0));
      float alpha = (0.016 + vLight * 0.32 + detail * 0.14 + frontalDetail * 0.1 + cavity * 0.16 + vInfluence * 0.05) * vFacing * fade;
      gl_FragColor = vec4(color * clamp(scan, 0.025, 1.28), alpha);
    }
  `;

  function getColorRgb(color) {
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const full = hex.length === 3
        ? hex.split("").map((item) => item + item).join("")
        : hex;

      return [
        parseInt(full.slice(0, 2), 16) / 255,
        parseInt(full.slice(2, 4), 16) / 255,
        parseInt(full.slice(4, 6), 16) / 255
      ];
    }

    return [204 / 255, 255 / 255, 0];
  }

  function compileShader(type, sourceCode) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }

    return shader;
  }

  function createProgram() {
    const nextProgram = gl.createProgram();
    gl.attachShader(nextProgram, compileShader(gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(nextProgram, compileShader(gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(nextProgram);

    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(nextProgram) || "Program link failed");
    }

    return nextProgram;
  }

  function parseGlb(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    const magic = dataView.getUint32(0, true);

    if (magic !== 0x46546c67) {
      throw new Error("Invalid GLB");
    }

    const jsonLength = dataView.getUint32(12, true);
    const jsonType = dataView.getUint32(16, true);
    const jsonStart = 20;

    if (jsonType !== 0x4e4f534a) {
      throw new Error("Missing GLB JSON chunk");
    }

    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, jsonStart, jsonLength)));
    const binHeader = jsonStart + jsonLength;
    const binLength = dataView.getUint32(binHeader, true);
    const binType = dataView.getUint32(binHeader + 4, true);

    if (binType !== 0x004e4942) {
      throw new Error("Missing GLB binary chunk");
    }

    return {
      json,
      binary: arrayBuffer.slice(binHeader + 8, binHeader + 8 + binLength)
    };
  }

  function componentCount(type) {
    return {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
      MAT4: 16
    }[type] || 1;
  }

  function componentSize(componentType) {
    return {
      5120: 1,
      5121: 1,
      5122: 2,
      5123: 2,
      5125: 4,
      5126: 4
    }[componentType] || 4;
  }

  function readComponent(viewData, offset, componentType) {
    if (componentType === 5120) return viewData.getInt8(offset);
    if (componentType === 5121) return viewData.getUint8(offset);
    if (componentType === 5122) return viewData.getInt16(offset, true);
    if (componentType === 5123) return viewData.getUint16(offset, true);
    if (componentType === 5125) return viewData.getUint32(offset, true);
    return viewData.getFloat32(offset, true);
  }

  function accessorToArray(glb, accessorIndex) {
    const accessor = glb.json.accessors[accessorIndex];
    const bufferView = glb.json.bufferViews[accessor.bufferView];
    const componentLength = componentSize(accessor.componentType);
    const itemSize = componentCount(accessor.type);
    const stride = bufferView.byteStride || componentLength * itemSize;
    const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const dataView = new DataView(glb.binary);
    const result = new Float32Array(accessor.count * itemSize);

    for (let index = 0; index < accessor.count; index += 1) {
      for (let component = 0; component < itemSize; component += 1) {
        result[index * itemSize + component] = readComponent(
          dataView,
          offset + index * stride + component * componentLength,
          accessor.componentType
        );
      }
    }

    return {
      data: result,
      count: accessor.count,
      itemSize
    };
  }

  function indexAccessorToArray(glb, accessorIndex) {
    if (accessorIndex === undefined) {
      return null;
    }

    return accessorToArray(glb, accessorIndex).data;
  }

  function getPointBudget() {
    const width = window.innerWidth;

    if (width <= 640) {
      return {
        maxVertexCount: 360000,
        maxSurfaceCount: 440000,
        surfaceSamples: 2
      };
    }

    if (width <= 980) {
      return {
        maxVertexCount: 520000,
        maxSurfaceCount: 620000,
        surfaceSamples: 3
      };
    }

    return {
      maxVertexCount: 720000,
      maxSurfaceCount: 850000,
      surfaceSamples: 5
    };
  }

  function buildPointCloud(glb) {
    const pointBudget = getPointBudget();
    const positions = [];
    const normals = [];
    const uvs = [];
    const cavities = [];

    (glb.json.meshes || []).forEach((mesh) => {
      (mesh.primitives || []).forEach((primitive) => {
        const positionAccessor = primitive.attributes?.POSITION;

        if (positionAccessor === undefined) {
          return;
        }

        const sourcePositions = accessorToArray(glb, positionAccessor);
        const sourceIndices = indexAccessorToArray(glb, primitive.indices);
        const sourceNormals = primitive.attributes?.NORMAL !== undefined
          ? accessorToArray(glb, primitive.attributes.NORMAL).data
          : computeVertexNormals(sourcePositions.data, sourceIndices);
        const sourceCavities = computeVertexCavities(sourcePositions.data, sourceIndices, sourceNormals);
        const sourceUvs = primitive.attributes?.TEXCOORD_0 !== undefined
          ? accessorToArray(glb, primitive.attributes.TEXCOORD_0).data
          : null;
        const vertexStep = Math.max(1, Math.ceil(sourcePositions.count / pointBudget.maxVertexCount));

        for (let vertexIndex = 0; vertexIndex < sourcePositions.count; vertexIndex += vertexStep) {
          pushSourceVertex(positions, normals, uvs, cavities, sourcePositions.data, sourceNormals, sourceUvs, sourceCavities, vertexIndex);
        }

        if (!sourceIndices) {
          return;
        }

        const triangleCount = Math.floor(sourceIndices.length / 3);
        const triangleStep = Math.max(1, Math.ceil(triangleCount / pointBudget.maxSurfaceCount));
        const surfaceSamples = triangleStep === 1 ? pointBudget.surfaceSamples : 1;

        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += triangleStep) {
          const indexOffset = triangleIndex * 3;

          for (let sample = 0; sample < surfaceSamples; sample += 1) {
            pushTriangleSample(
              positions,
              normals,
              uvs,
              cavities,
              sourcePositions.data,
              sourceNormals,
              sourceUvs,
              sourceCavities,
              sourceIndices[indexOffset],
              sourceIndices[indexOffset + 1],
              sourceIndices[indexOffset + 2],
              triangleIndex + sample * 9973
            );
          }
        }
      });
    });

    return normalizePointCloud(new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), new Float32Array(cavities));
  }


  function computeVertexNormals(sourcePositions, sourceIndices) {
    const normals = new Float32Array(sourcePositions.length);

    if (!sourceIndices) {
      for (let index = 0; index < normals.length; index += 3) {
        normals[index + 2] = 1;
      }

      return normals;
    }

    for (let index = 0; index < sourceIndices.length; index += 3) {
      const a = sourceIndices[index] * 3;
      const b = sourceIndices[index + 1] * 3;
      const c = sourceIndices[index + 2] * 3;
      const abX = sourcePositions[b] - sourcePositions[a];
      const abY = sourcePositions[b + 1] - sourcePositions[a + 1];
      const abZ = sourcePositions[b + 2] - sourcePositions[a + 2];
      const acX = sourcePositions[c] - sourcePositions[a];
      const acY = sourcePositions[c + 1] - sourcePositions[a + 1];
      const acZ = sourcePositions[c + 2] - sourcePositions[a + 2];
      const normalX = abY * acZ - abZ * acY;
      const normalY = abZ * acX - abX * acZ;
      const normalZ = abX * acY - abY * acX;

      normals[a] += normalX;
      normals[a + 1] += normalY;
      normals[a + 2] += normalZ;
      normals[b] += normalX;
      normals[b + 1] += normalY;
      normals[b + 2] += normalZ;
      normals[c] += normalX;
      normals[c + 1] += normalY;
      normals[c + 2] += normalZ;
    }

    for (let index = 0; index < normals.length; index += 3) {
      const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
      normals[index] /= length;
      normals[index + 1] /= length;
      normals[index + 2] /= length;
    }

    return normals;
  }

  function computeVertexCavities(sourcePositions, sourceIndices, sourceNormals) {
    const cavities = new Float32Array(sourcePositions.length / 3);
    const counts = new Float32Array(cavities.length);

    if (!sourceIndices) {
      return cavities;
    }

    for (let index = 0; index < sourceIndices.length; index += 3) {
      const a = sourceIndices[index];
      const b = sourceIndices[index + 1];
      const c = sourceIndices[index + 2];
      addNormalDelta(cavities, counts, sourceNormals, a, b);
      addNormalDelta(cavities, counts, sourceNormals, b, c);
      addNormalDelta(cavities, counts, sourceNormals, c, a);
    }

    for (let index = 0; index < cavities.length; index += 1) {
      const average = counts[index] ? cavities[index] / counts[index] : 0;
      cavities[index] = Math.min(Math.pow(average * 2.2, 1.35), 1);
    }

    return cavities;
  }

  function addNormalDelta(cavities, counts, sourceNormals, a, b) {
    const offsetA = a * 3;
    const offsetB = b * 3;
    const dot =
      sourceNormals[offsetA] * sourceNormals[offsetB]
      + sourceNormals[offsetA + 1] * sourceNormals[offsetB + 1]
      + sourceNormals[offsetA + 2] * sourceNormals[offsetB + 2];
    const delta = Math.max(0, 1 - dot);

    cavities[a] += delta;
    cavities[b] += delta;
    counts[a] += 1;
    counts[b] += 1;
  }

  function pushSourceVertex(positions, normals, uvs, cavities, sourcePositions, sourceNormals, sourceUvs, sourceCavities, vertexIndex) {
    const positionOffset = vertexIndex * 3;
    const uvOffset = vertexIndex * 2;

    positions.push(
      sourcePositions[positionOffset],
      sourcePositions[positionOffset + 1],
      sourcePositions[positionOffset + 2]
    );

    normals.push(
      sourceNormals[positionOffset],
      sourceNormals[positionOffset + 1],
      sourceNormals[positionOffset + 2]
    );

    if (sourceUvs) {
      uvs.push(sourceUvs[uvOffset], sourceUvs[uvOffset + 1]);
    } else {
      uvs.push(0.5, 0.5);
    }

    cavities.push(sourceCavities[vertexIndex] || 0);
  }

  function pushTriangleSample(positions, normals, uvs, cavities, sourcePositions, sourceNormals, sourceUvs, sourceCavities, a, b, c, seed) {
    const randomA = randomFrom(seed + 19);
    const randomB = randomFrom(seed + 41);
    const sqrtA = Math.sqrt(randomA);
    const weightA = 1 - sqrtA;
    const weightB = sqrtA * (1 - randomB);
    const weightC = sqrtA * randomB;
    const offsetA = a * 3;
    const offsetB = b * 3;
    const offsetC = c * 3;
    const uvOffsetA = a * 2;
    const uvOffsetB = b * 2;
    const uvOffsetC = c * 2;

    positions.push(
      sourcePositions[offsetA] * weightA + sourcePositions[offsetB] * weightB + sourcePositions[offsetC] * weightC,
      sourcePositions[offsetA + 1] * weightA + sourcePositions[offsetB + 1] * weightB + sourcePositions[offsetC + 1] * weightC,
      sourcePositions[offsetA + 2] * weightA + sourcePositions[offsetB + 2] * weightB + sourcePositions[offsetC + 2] * weightC
    );

    const normalX = sourceNormals[offsetA] * weightA + sourceNormals[offsetB] * weightB + sourceNormals[offsetC] * weightC;
    const normalY = sourceNormals[offsetA + 1] * weightA + sourceNormals[offsetB + 1] * weightB + sourceNormals[offsetC + 1] * weightC;
    const normalZ = sourceNormals[offsetA + 2] * weightA + sourceNormals[offsetB + 2] * weightB + sourceNormals[offsetC + 2] * weightC;
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;

    normals.push(normalX / normalLength, normalY / normalLength, normalZ / normalLength);

    if (sourceUvs) {
      uvs.push(
        sourceUvs[uvOffsetA] * weightA + sourceUvs[uvOffsetB] * weightB + sourceUvs[uvOffsetC] * weightC,
        sourceUvs[uvOffsetA + 1] * weightA + sourceUvs[uvOffsetB + 1] * weightB + sourceUvs[uvOffsetC + 1] * weightC
      );
    } else {
      uvs.push(0.5, 0.5);
    }

    cavities.push(
      (sourceCavities[a] || 0) * weightA
        + (sourceCavities[b] || 0) * weightB
        + (sourceCavities[c] || 0) * weightC
    );
  }

  function getBounds(positions) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions[index + axis]);
        max[axis] = Math.max(max[axis], positions[index + axis]);
      }
    }

    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;

    return { center, size };
  }

  function normalizePointCloud(positions, normals, uvs, cavities) {
    const bounds = getBounds(positions);
    const normalized = new Float32Array(positions.length);
    const randoms = new Float32Array(positions.length / 3);

    for (let index = 0; index < positions.length; index += 3) {
      normalized[index] = (positions[index] - bounds.center[0]) / bounds.size;
      normalized[index + 1] = (positions[index + 1] - bounds.center[1]) / bounds.size;
      normalized[index + 2] = (positions[index + 2] - bounds.center[2]) / bounds.size;
      randoms[index / 3] = randomFrom(index * 0.217);
    }

    return {
      positions: normalized,
      normals,
      uvs,
      cavities,
      randoms,
      count: normalized.length / 3,
      bounds
    };
  }

  function randomFrom(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function makeBuffer(data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  function createFallbackTexture() {
    const fallbackTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fallbackTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([184, 184, 184, 255])
    );
    return fallbackTexture;
  }

  async function createGlbTexture(glb) {
    const image = glb.json.images?.[0];

    if (!image || image.bufferView === undefined) {
      hasTexture = false;
      return createFallbackTexture();
    }

    const bufferView = glb.json.bufferViews[image.bufferView];
    const byteOffset = bufferView.byteOffset || 0;
    const imageBytes = glb.binary.slice(byteOffset, byteOffset + bufferView.byteLength);
    const bitmap = await createImageBitmap(new Blob([imageBytes], { type: image.mimeType || "image/jpeg" }));
    const nextTexture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, nextTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    bitmap.close?.();
    hasTexture = true;

    return nextTexture;
  }

  function setAttribute(name, buffer, size, shaderProgram = program) {
    const location = gl.getAttribLocation(shaderProgram, name);

    if (location < 0) {
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function resize() {
    const rect = shell.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, Math.floor(rect.width));
    view.height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(view.width * view.dpr);
    canvas.height = Math.floor(view.height * view.dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (!mouse.targetX && !mouse.targetY) {
      mouse.x = view.width / 2;
      mouse.y = view.height / 2;
      mouse.targetX = mouse.x;
      mouse.targetY = mouse.y;
    }
  }

  function multiply(a, b) {
    const result = new Float32Array(16);

    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        result[column * 4 + row] =
          a[0 * 4 + row] * b[column * 4 + 0]
          + a[1 * 4 + row] * b[column * 4 + 1]
          + a[2 * 4 + row] * b[column * 4 + 2]
          + a[3 * 4 + row] * b[column * 4 + 3];
      }
    }

    return result;
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);

    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * range, -1,
      0, 0, near * far * range * 2, 0
    ]);
  }

  function translate(z) {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, -0.02, z, 1
    ]);
  }

  function rotateX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Float32Array([
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1
    ]);
  }

  function rotateY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Float32Array([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1
    ]);
  }

  function scale(value) {
    return new Float32Array([
      value, 0, 0, 0,
      0, value, 0, 0,
      0, 0, value, 0,
      0, 0, 0, 1
    ]);
  }

  function draw(time = performance.now()) {
    if (!buffers.count) {
      return;
    }

    touchRotation.x += (touchRotation.targetX - touchRotation.x) * 0.16;
    touchRotation.y += (touchRotation.targetY - touchRotation.y) * 0.16;
    mouse.x += (mouse.targetX - mouse.x) * 0.11;
    mouse.y += (mouse.targetY - mouse.y) * 0.11;
    mouse.hover += ((mouse.active ? 1 : 0) - mouse.hover) * 0.12;

    if (drag.active) {
      rotation.targetY = baseRotationY + touchRotation.y;
      rotation.targetX = -0.08 + touchRotation.x;
    } else {
      rotation.targetY = mouse.active
        ? baseRotationY + touchRotation.y + (mouse.x / Math.max(view.width, 1) - 0.5) * hoverRotationRangeY
        : baseRotationY + touchRotation.y + Math.sin(time * 0.00034) * 0.16;
      rotation.targetX = mouse.active
        ? -0.08 + touchRotation.x - (mouse.y / Math.max(view.height, 1) - 0.5) * 0.92
        : -0.08 + touchRotation.x + Math.cos(time * 0.00028) * 0.08;
    }

    rotation.x += (rotation.targetX - rotation.x) * 0.09;
    rotation.y += (rotation.targetY - rotation.y) * 0.09;

    const aspect = view.width / Math.max(view.height, 1);
    const matrix = multiply(
      perspective(Math.PI / 4.4, aspect, 0.1, 100),
      multiply(translate(-2.08), multiply(rotateX(rotation.x), multiply(rotateY(rotation.y), scale(aspect < 0.82 ? 2.05 : 1))))
    );

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.depthMask(false);
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMatrix"), false, matrix);
    gl.uniform1f(gl.getUniformLocation(program, "uTime"), time - startTime);
    gl.uniform1f(gl.getUniformLocation(program, "uHover"), mouse.hover);
    gl.uniform1f(gl.getUniformLocation(program, "uRotationX"), rotation.x);
    gl.uniform1f(gl.getUniformLocation(program, "uRotationY"), rotation.y);
    gl.uniform2f(
      gl.getUniformLocation(program, "uPointer"),
      (mouse.x / Math.max(view.width, 1)) * 2 - 1,
      1 - (mouse.y / Math.max(view.height, 1)) * 2
    );
    gl.uniform1f(gl.getUniformLocation(program, "uPixelRatio"), view.dpr);
    gl.uniform3fv(gl.getUniformLocation(program, "uBase"), [242 / 255, 238 / 255, 231 / 255]);
    gl.uniform3fv(gl.getUniformLocation(program, "uAccent"), accentRgb);
    gl.uniform1f(gl.getUniformLocation(program, "uHasTexture"), hasTexture ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture || createFallbackTexture());
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
    setAttribute("aPosition", buffers.positions, 3);
    setAttribute("aNormal", buffers.normals, 3);
    setAttribute("aUv", buffers.uvs, 2);
    setAttribute("aCavity", buffers.cavities, 1);
    setAttribute("aRandom", buffers.randoms, 1);
    gl.drawArrays(gl.POINTS, 0, buffers.count);
    gl.depthMask(true);

    if (!reduceMotion.matches) {
      frame = requestAnimationFrame(draw);
    }
  }

  async function init() {
    program = createProgram();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    resize();

    const response = await fetch(source);
    const glb = parseGlb(await response.arrayBuffer());
    texture = createFallbackTexture();
    const pointCloud = buildPointCloud(glb);
    buffers.positions = makeBuffer(pointCloud.positions);
    buffers.normals = makeBuffer(pointCloud.normals);
    buffers.uvs = makeBuffer(pointCloud.uvs);
    buffers.cavities = makeBuffer(pointCloud.cavities);
    buffers.randoms = makeBuffer(pointCloud.randoms);
    buffers.count = pointCloud.count;

    draw();

    createGlbTexture(glb)
      .then((nextTexture) => {
        texture = nextTexture;
      })
      .catch(() => {
        hasTexture = false;
      });
  }

  function updatePointer(event) {
    const rect = shell.getBoundingClientRect();
    mouse.active = true;
    mouse.targetX = event.clientX - rect.left;
    mouse.targetY = event.clientY - rect.top;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function beginDrag(event) {
    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    updatePointer(event);
    shell.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    touchRotation.targetY = clamp(touchRotation.targetY + deltaX * 0.0046, -1.08, 1.08);
    touchRotation.targetX = clamp(touchRotation.targetX - deltaY * 0.0012, -0.22, 0.24);
    updatePointer(event);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) {
      return;
    }

    drag.active = false;
    drag.pointerId = null;
    mouse.active = false;
    mouse.targetX = view.width / 2;
    mouse.targetY = view.height / 2;
    shell.releasePointerCapture?.(event.pointerId);
  }

  shell.addEventListener("pointerenter", (event) => {
    updatePointer(event);
  });

  shell.addEventListener("pointermove", (event) => {
    moveDrag(event);

    if (drag.active) {
      return;
    }

    updatePointer(event);
  });

  shell.addEventListener("pointerleave", () => {
    if (drag.active) {
      return;
    }

    mouse.active = false;
    mouse.targetX = view.width / 2;
    mouse.targetY = view.height / 2;
  });

  shell.addEventListener("pointerdown", beginDrag);
  shell.addEventListener("pointerup", endDrag);
  shell.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion.matches) {
      draw();
    }
  });

  init().catch((error) => {
    console.error("About bust viewer failed:", error);
    canvas.dataset.error = error.message || "unknown";
    canvas.hidden = true;
  });
})();
