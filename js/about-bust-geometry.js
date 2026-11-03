// Module worker preparation; the main-thread fallback uses this same implementation.
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

  function buildPointCloud(glb, pointBudget) {
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


export function prepareBust(buffer, budget) {
  const glb = parseGlb(buffer);
  const cloud = buildPointCloud(glb, budget);
  const image = glb.json.images?.[0];
  let textureImage = null;
  if (budget.useTexture && image?.bufferView !== undefined) {
    const view = glb.json.bufferViews[image.bufferView];
    const offset = view.byteOffset || 0;
    textureImage = {
      bytes: glb.binary.slice(offset, offset + view.byteLength),
      mimeType: image.mimeType || "image/jpeg"
    };
  }
  return { cloud, textureImage };
}

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data: { buffer, budget } }) => {
    try {
      const result = prepareBust(buffer, budget);
      const transfers = ["positions", "normals", "uvs", "cavities", "randoms"]
        .map(key => result.cloud[key].buffer);
      if (result.textureImage) transfers.push(result.textureImage.bytes);
      self.postMessage(result, transfers);
    } catch (error) {
      self.postMessage({ error: error.message || "Bust geometry preparation failed" });
    }
  };
}

