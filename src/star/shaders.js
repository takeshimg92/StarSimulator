export const starVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  void main() {
    vObjPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const starFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLimbDarkeningCoeff;
  uniform float uSpotsVisible;
  uniform float uBrightness;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  // --- Procedural 3D noise for sunspot generation ---
  // Hash function
  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  // Worley (cellular) noise — returns distance to nearest feature point
  // Perfect for sunspot-like patterns: each cell can host a spot
  float worley(vec3 p, float scale) {
    vec3 sp = p * scale;
    vec3 id = floor(sp);
    vec3 fd = fract(sp);

    float minDist = 1.0;

    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 offset = vec3(float(x), float(y), float(z));
          vec3 neighbor = id + offset;
          vec3 featurePoint = hash3(neighbor);
          vec3 diff = offset + featurePoint - fd;
          float dist = length(diff);
          minDist = min(minDist, dist);
        }
      }
    }
    return minDist;
  }

  void main() {
    float cosTheta = dot(vNormal, vViewDir);

    // Limb darkening
    float limbDarkening = 1.0 - uLimbDarkeningCoeff * (1.0 - cosTheta);
    limbDarkening = max(limbDarkening, 0.0);

    // Procedural sunspots
    float spotDarkening = 1.0;
    if (uSpotsVisible > 0.5) {
      vec3 surfaceDir = normalize(vObjPos);

      // Two octaves of Worley noise at different scales
      float w1 = worley(surfaceDir, 4.0);   // large spots
      float w2 = worley(surfaceDir, 8.0);   // smaller spots

      // smoothstep returns 0.0 at cell centers (spot), 1.0 far away (bright surface)
      float spot1 = smoothstep(0.08, 0.35, w1);  // large spots
      float spot2 = smoothstep(0.05, 0.25, w2);  // smaller spots

      // Combine: spots are black (0.1), surface is full brightness (1.0)
      spotDarkening = 0.1 + 0.9 * spot1 * spot2;
    }

    vec3 color = uColor * limbDarkening * spotDarkening * uBrightness;

    gl_FragColor = vec4(color, 1.0);
  }
`;
