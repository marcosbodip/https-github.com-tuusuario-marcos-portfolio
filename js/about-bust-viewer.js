(() => {
  const canvas = document.querySelector("[data-about-bust]");

  if (!canvas) {
    return;
  }

  const shell = canvas.closest(".about-pointcloud-shell") || canvas;
  const compactViewport = window.matchMedia("(max-width: 1180px), (hover: none) and (pointer: coarse)");

  if (compactViewport.matches) {
    shell.remove();
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const source = canvas.dataset.src || "assets/about/marcos-bust.glb";
  let accentRgb = getColorRgb(
    getComputedStyle(document.documentElement).getPropertyValue("--bust-accent").trim()
      || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff3b30"
  );
  let baseRgb = getColorRgb(
    getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f2eee7"
  );
  let isLightMode = document.documentElement.dataset.theme === "light";
  const contextOptions = {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: "high-performance"
  };
  const gl = canvas.getContext("webgl2", contextOptions) || canvas.getContext("webgl", contextOptions);

  if (!gl) {
    return;
  }

  const mouse = {
    active: false,
    hover: 0,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    clientX: null,
    clientY: null
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
  let previousTime = 0;
  let elapsedTime = 0;
  let onScreen = true;
  let program = null;
  let texture = null;
  let hasTexture = false;
  let pointBudget = null;
  let dynamics = null;

  function syncAccentColor() {
    isLightMode = document.documentElement.dataset.theme === "light";
    baseRgb = getColorRgb(
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f2eee7"
    );
    accentRgb = getColorRgb(
      getComputedStyle(document.documentElement).getPropertyValue("--bust-accent").trim()
        || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff3b30"
    );
    requestDraw();
  }

  window.addEventListener("portfolio:themechange", syncAccentColor);

  const vertexShader = `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    attribute float aCavity;
    attribute float aRandom;
    attribute vec3 aDisplacement;
    attribute vec3 aVelocity;
    uniform mat4 uMatrix;
    uniform float uTime;
    uniform float uHover;
    uniform float uMotion;
    uniform float uDynamics;
    uniform float uPixelRatio;
    uniform float uPointScale;
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
      float time = uTime * 0.00065;
      // Coherent surface currents keep the portrait alive without losing its silhouette.
      vec3 flow = vec3(
        sin(position.y * 10.0 + position.z * 6.0 + time),
        sin(position.z * 9.0 - position.x * 7.0 + time * 0.83),
        cos(position.x * 10.0 + position.y * 5.0 - time * 0.72)
      );
      position += mix(flow * 0.009 * uHover, aDisplacement, uDynamics) * uMotion;
      vec4 projected = uMatrix * vec4(position, 1.0);
      float influence = smoothstep(0.001, 0.006, length(aVelocity)) * uDynamics * uMotion;
      gl_Position = projected;
      gl_PointSize = clamp((0.42 + aRandom * 0.24 + influence * 0.1) * uPixelRatio * uPointScale / max(projected.w * 0.42, 0.72), 0.56, 3.1);

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
    uniform float uAlphaScale;
    uniform float uLightMode;
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
      float scan = 0.035 + form + detail * 0.58 - textureShadow * 0.68 - cavity * 0.86 + vRandom * 0.035 + vInfluence * 0.1;
      float darkInfluence = smoothstep(0.02, 0.86, vInfluence);
      float lightInfluence = smoothstep(0.02, 0.7, vInfluence);
      float colorInfluence = mix(darkInfluence, lightInfluence, uLightMode);
      vec3 color = mix(uBase, uAccent, clamp(colorInfluence, 0.0, 1.0));
      float alpha = (0.016 + vLight * 0.32 + detail * 0.14 + frontalDetail * 0.1 + cavity * 0.16 + vInfluence * 0.05) * vFacing * fade * uAlphaScale;
      // Keep ink coverage stable on hover; only the local color changes in light mode.
      float lightFade = smoothstep(0.46, 0.16, length(point));
      float lightCoverage = (0.016 + vLight * 0.32 + detail * 0.14 + frontalDetail * 0.1 + cavity * 0.16) * vFacing * lightFade * uAlphaScale;
      float lightAlpha = clamp(lightCoverage * 2.2, 0.0, 0.94);
      vec3 shadedColor = mix(color * clamp(scan, 0.025, 1.28), color, uLightMode);
      gl_FragColor = vec4(shadedColor, mix(alpha, lightAlpha, uLightMode));
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
    if (gl.createTransformFeedback) {
      sourceCode = "#version 300 es\n" + sourceCode
        .replace(/attribute /g, "in ")
        .replace(/varying /g, type === gl.VERTEX_SHADER ? "out " : "in ")
        .replace(/texture2D\(/g, "texture(");
      if (type === gl.FRAGMENT_SHADER) {
        sourceCode = sourceCode.replace("precision mediump float;", "precision mediump float;\nout vec4 fragmentColor;")
          .replace(/gl_FragColor/g, "fragmentColor");
      }
    }
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
        maxVertexCount: 90000,
        maxSurfaceCount: 120000,
        surfaceSamples: 1,
        pointScale: 2.25,
        alphaScale: 1.8,
        computeCavities: false,
        useTexture: false
      };
    }

    if (width <= 980) {
      return {
        maxVertexCount: 220000,
        maxSurfaceCount: 280000,
        surfaceSamples: 2,
        pointScale: 1.45,
        alphaScale: 1.35,
        computeCavities: false,
        useTexture: false
      };
    }

    return {
      maxVertexCount: 720000,
      maxSurfaceCount: 850000,
      surfaceSamples: 5,
      pointScale: 1,
      alphaScale: 1,
      computeCavities: true,
      useTexture: true
    };
  }

  function buildPointCloud(glb) {
    pointBudget = getPointBudget();
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
        const sourceCavities = pointBudget.computeCavities
          ? computeVertexCavities(sourcePositions.data, sourceIndices, sourceNormals)
          : new Float32Array(sourcePositions.count);
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
    frame = null;
    if (!buffers.count || document.hidden || !onScreen || compactViewport.matches) {
      previousTime = 0;
      return;
    }
    const dt = previousTime ? Math.min(3, Math.max(0, (time - previousTime) / 16.67)) : 1;
    previousTime = time;
    const ease = (rate) => 1 - Math.pow(1 - rate, dt);
    if (!reduceMotion.matches) elapsedTime += dt * 16.67;
    const motionTime = elapsedTime;
    touchRotation.x += (touchRotation.targetX - touchRotation.x) * ease(0.16);
    touchRotation.y += (touchRotation.targetY - touchRotation.y) * ease(0.16);
    mouse.x += (mouse.targetX - mouse.x) * ease(0.14);
    mouse.y += (mouse.targetY - mouse.y) * ease(0.14);
    const pointerDistance = Math.hypot(
      (mouse.targetX - view.width * 0.5) / (view.width * 0.3),
      (mouse.targetY - view.height * 0.5) / (view.height * 0.38)
    );
    const proximity = mouse.active ? 1 / (1 + Math.max(0, pointerDistance - 1) ** 2 * 1.8) : 0;
    mouse.hover += (proximity - mouse.hover) * ease(mouse.active ? 0.085 : 0.045);

    // Keep the original pose at rest; only an explicit drag may change its orientation.
    rotation.targetY = baseRotationY + (mouse.active ? touchRotation.y : 0);
    rotation.targetX = -0.08 + (mouse.active ? touchRotation.x : 0);

    rotation.x += (rotation.targetX - rotation.x) * ease(0.06);
    rotation.y += (rotation.targetY - rotation.y) * ease(0.06);

    const aspect = view.width / Math.max(view.height, 1);
    const matrix = multiply(
      perspective(Math.PI / 4.4, aspect, 0.1, 100),
      multiply(translate(-2.08), multiply(rotateX(rotation.x), multiply(rotateY(rotation.y), scale(aspect < 0.82 ? 2.05 : 1))))
    );

    if (dynamics && !reduceMotion.matches) {
      dynamics.step({dt, time:motionTime, matrix,
        pointer:{x:mouse.targetX / view.width, y:1 - mouse.targetY / view.height, active:mouse.active, aspect, proximity},
        rotationX:rotation.x, rotationY:rotation.y});
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.depthMask(false);
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMatrix"), false, matrix);
    gl.uniform1f(gl.getUniformLocation(program, "uTime"), motionTime);
    gl.uniform1f(gl.getUniformLocation(program, "uMotion"), reduceMotion.matches ? 0 : 1);
    gl.uniform1f(gl.getUniformLocation(program, "uDynamics"), dynamics ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, "uHover"), mouse.hover);
    gl.uniform1f(gl.getUniformLocation(program, "uRotationX"), rotation.x);
    gl.uniform1f(gl.getUniformLocation(program, "uRotationY"), rotation.y);
    gl.uniform1f(gl.getUniformLocation(program, "uPointScale"), (pointBudget?.pointScale || 1) * (isLightMode ? 1.08 : 1));
    gl.uniform1f(gl.getUniformLocation(program, "uPixelRatio"), view.dpr);
    gl.uniform3fv(gl.getUniformLocation(program, "uBase"), baseRgb);
    gl.uniform3fv(gl.getUniformLocation(program, "uAccent"), accentRgb);
    gl.uniform1f(gl.getUniformLocation(program, "uHasTexture"), hasTexture ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, "uAlphaScale"), pointBudget?.alphaScale || 1);
    gl.uniform1f(gl.getUniformLocation(program, "uLightMode"), isLightMode ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture || createFallbackTexture());
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
    setAttribute("aPosition", buffers.positions, 3);
    setAttribute("aNormal", buffers.normals, 3);
    setAttribute("aUv", buffers.uvs, 2);
    setAttribute("aCavity", buffers.cavities, 1);
    setAttribute("aRandom", buffers.randoms, 1);
    if (dynamics) dynamics.bind(program);
    gl.drawArrays(gl.POINTS, 0, buffers.count);
    gl.depthMask(true);

    if (!reduceMotion.matches) {
      frame = requestAnimationFrame(draw);
    }
  }

  function requestDraw() {
    if (!frame && buffers.count && !document.hidden && onScreen && !compactViewport.matches) {
      frame = requestAnimationFrame(draw);
    }
  }

  function syncAnimation() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    previousTime = 0;
    requestDraw();
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

    dynamics = window.PORTFOLIO_ABOUT_DYNAMICS?.create(gl, buffers) || null;
    canvas.dataset.dynamics = dynamics ? "fluid" : "ambient";

    draw();

    if (pointBudget.useTexture) {
      createGlbTexture(glb)
        .then((nextTexture) => {
          gl.deleteTexture(texture);
          texture = nextTexture;
          requestDraw();
        })
        .catch(() => {
          hasTexture = false;
        });
    }
  }

  function updatePointer(event) {
    if (event.pointerType === "touch") return;
    const rect = shell.getBoundingClientRect();
    mouse.active = true;
    mouse.clientX = event.clientX;
    mouse.clientY = event.clientY;
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
    touchRotation.targetX = touchRotation.targetY = 0;
    updatePointer(event);
    shell.releasePointerCapture?.(event.pointerId);
  }

  shell.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointermove", updatePointer, { passive: true });

  shell.addEventListener("pointerleave", () => {
    if (drag.active) {
      return;
    }

    touchRotation.targetX = touchRotation.targetY = 0;
  });

  function releasePointer() {
    mouse.active = false;
    touchRotation.targetX = touchRotation.targetY = 0;
  }
  window.addEventListener("blur", releasePointer);
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) releasePointer();
  });
  window.addEventListener("scroll", () => {
    if (mouse.active) updatePointer(mouse);
  }, { passive: true });

  shell.addEventListener("pointerdown", beginDrag);
  shell.addEventListener("pointerup", endDrag);
  shell.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    resize();
    syncAnimation();
  });
  reduceMotion.addEventListener("change", syncAnimation);
  document.addEventListener("visibilitychange", syncAnimation);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncAnimation();
    }).observe(shell);
  }
  init().catch((error) => {
    console.error("About bust viewer failed:", error);
    canvas.dataset.error = error.message || "unknown";
    canvas.hidden = true;
  });
})();
