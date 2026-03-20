export const starVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpotsVisible;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;
  varying vec3 vWorldPos;

  // Simple hash for vertex displacement
  float vhash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = vhash(i);
    float b = vhash(i + vec3(1, 0, 0));
    float c = vhash(i + vec3(0, 1, 0));
    float d = vhash(i + vec3(1, 1, 0));
    float e = vhash(i + vec3(0, 0, 1));
    float ff = vhash(i + vec3(1, 0, 1));
    float g = vhash(i + vec3(0, 1, 1));
    float h = vhash(i + vec3(1, 1, 1));
    return mix(
      mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
      mix(mix(e, ff, f.x), mix(g, h, f.x), f.y),
      f.z
    );
  }

  void main() {
    vObjPos = position;

    // Surface displacement — subtle bumps from noise
    vec3 dir = normalize(position);
    float displacement = 0.0;
    if (uSpotsVisible > 0.5) {
      // Multi-octave displacement, animated
      float n1 = vnoise(dir * 6.0 + uTime * 0.04) - 0.5;
      float n2 = vnoise(dir * 12.0 + uTime * 0.08) - 0.5;
      float n3 = vnoise(dir * 24.0 + uTime * 0.12) - 0.5;
      displacement = n1 * 0.015 + n2 * 0.008 + n3 * 0.004;
    }

    vec3 displaced = position + normal * displacement;

    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const starFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLimbDarkeningCoeff;
  uniform float uSpotsVisible;
  uniform float uSpotDensity;  // 0 = no spots, 1 = heavy coverage
  uniform float uSpotSize;     // 0 = tiny, 1 = large
  uniform float uBrightness;
  uniform vec3 uTint; // color tint (1,1,1 = none, warm = sunglasses)
  uniform float uTime;
  uniform float uSliceEnabled;
  uniform float uGranScale;  // Worley frequency for granulation (lower = larger cells)

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;
  varying vec3 vWorldPos;

  // ---- Noise toolkit ----

  // Hash for Worley and value noise
  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  float hash1(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  // Worley noise — returns (dist to closest, dist to second closest)
  vec2 worley2(vec3 p, float scale) {
    vec3 sp = p * scale;
    vec3 id = floor(sp);
    vec3 fd = fract(sp);

    float d1 = 1.0;
    float d2 = 1.0;

    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 offset = vec3(float(x), float(y), float(z));
          vec3 neighbor = id + offset;
          vec3 featurePoint = hash3(neighbor);
          vec3 diff = offset + featurePoint - fd;
          float dist = length(diff);
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
          } else if (dist < d2) {
            d2 = dist;
          }
        }
      }
    }
    return vec2(d1, d2);
  }

  // Simple 3D value noise
  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash1(i);
    float b = hash1(i + vec3(1, 0, 0));
    float c = hash1(i + vec3(0, 1, 0));
    float d = hash1(i + vec3(1, 1, 0));
    float e = hash1(i + vec3(0, 0, 1));
    float ff = hash1(i + vec3(1, 0, 1));
    float g = hash1(i + vec3(0, 1, 1));
    float h = hash1(i + vec3(1, 1, 1));

    return mix(
      mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
      mix(mix(e, ff, f.x), mix(g, h, f.x), f.y),
      f.z
    );
  }

  // FBM (fractal Brownian motion) for turbulent surface detail
  float fbm(vec3 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      val += amp * valueNoise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return val;
  }

  void main() {
    // Slice: discard fragments behind the z=0 world plane
    if (uSliceEnabled > 0.5 && vWorldPos.z > 0.0) discard;

    float cosTheta = dot(vNormal, vViewDir);

    // Limb darkening — quadratic law for more realism
    float mu = max(cosTheta, 0.0);
    float limbDarkening = 1.0 - uLimbDarkeningCoeff * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
    limbDarkening = max(limbDarkening, 0.0);

    vec3 surfaceDir = normalize(vObjPos);
    float t = uTime;

    // Start with base color
    vec3 baseColor = uColor;
    float brightness = 1.0;

    if (uSpotsVisible > 0.5) {
      // ---- Granulation (convection cells) ----
      // Animated: cells bubble and reshape over time
      vec3 granPos = surfaceDir + vec3(t * 0.08, t * 0.05, t * -0.06);
      vec2 gran = worley2(granPos, uGranScale);
      float cellEdge = gran.y - gran.x;
      float granulation = smoothstep(0.0, 0.25, cellEdge);
      brightness *= 0.90 + 0.10 * granulation;

      // Shimmer: faster turbulent flicker
      float granShimmer = fbm(surfaceDir * 22.0 + vec3(t * 0.15, t * -0.12, t * 0.1), 3);
      brightness *= 0.95 + 0.05 * granShimmer;

      // ---- Sunspots ----
      // Spot parameters driven by uSpotDensity and uSpotSize.
      // density controls the smoothstep threshold (lower inner = more spots visible)
      // size controls the Worley cell scale (lower scale = larger cells = bigger spots)

      // Worley scale: small uSpotSize → many tiny cells, large → fewer big cells
      float wScale1 = mix(8.0, 2.5, uSpotSize);
      float wScale2 = mix(12.0, 5.0, uSpotSize);

      // Threshold: controls what fraction of Worley cells become spots.
      // Worley distances cluster around 0.05–0.5. A spot appears where
      // w.x < innerThresh (smoothstepped to outerThresh).
      // At density=0: nothing passes. At density~0.14 (Sun): ~1% coverage.
      // At density=1: heavy coverage (M dwarf).
      float d = uSpotDensity;
      float innerThresh1 = mix(0.02, 0.08, d);
      float outerThresh1 = mix(0.06, 0.25, d);
      float innerThresh2 = mix(0.01, 0.06, d);
      float outerThresh2 = mix(0.04, 0.18, d);

      vec3 spotDrift1 = surfaceDir + vec3(t * 0.012, t * -0.008, t * 0.01);
      vec2 w1 = worley2(spotDrift1, wScale1);
      float spotMask1 = smoothstep(innerThresh1, outerThresh1, w1.x);

      vec3 spotDrift2 = surfaceDir + vec3(5.23 + t * 0.015, 1.87 - t * 0.01, 3.41 + t * 0.008);
      vec2 w2 = worley2(spotDrift2, wScale2);
      float spotMask2 = smoothstep(innerThresh2, outerThresh2, w2.x);

      float spotMask = spotMask1 * spotMask2;

      // Penumbra (slightly wider than umbra)
      float penumbra1 = smoothstep(max(innerThresh1 - 0.03, 0.0), outerThresh1 + 0.08, w1.x);
      float penumbra2 = smoothstep(max(innerThresh2 - 0.02, 0.0), outerThresh2 + 0.05, w2.x);
      float penumbraMask = penumbra1 * penumbra2;

      float spotDarkening = mix(0.08, 1.0, spotMask);
      float inPenumbra = max(penumbraMask - spotMask, 0.0);

      brightness *= spotDarkening;

      // Penumbra color shift
      baseColor = mix(baseColor, baseColor * vec3(0.7, 0.4, 0.2), inPenumbra * 0.6);

      // ---- Faculae ----
      float facInner1 = outerThresh1 - 0.07;
      float facOuter1 = outerThresh1 + 0.18;
      float faculae1 = smoothstep(facInner1, facOuter1, w1.x) * (1.0 - smoothstep(facOuter1, facOuter1 + 0.20, w1.x));
      float facInner2 = outerThresh2 - 0.05;
      float facOuter2 = outerThresh2 + 0.15;
      float faculae2 = smoothstep(facInner2, facOuter2, w2.x) * (1.0 - smoothstep(facOuter2, facOuter2 + 0.20, w2.x));
      float faculaeBright = max(faculae1, faculae2) * 0.15 * uSpotDensity;
      brightness += faculaeBright;

      // ---- Surface turbulence ----
      float turbulence = fbm(surfaceDir * 5.0 + vec3(t * 0.06, t * -0.04, t * 0.05), 4);
      brightness *= 0.88 + 0.12 * turbulence;
    }

    // ---- Limb brightening for faculae (they appear brighter near the limb) ----
    float limbFaculae = 1.0 + (1.0 - mu) * 0.05;

    vec3 color = baseColor * limbDarkening * brightness * limbFaculae * uBrightness * uTint;

    gl_FragColor = vec4(color, 1.0);
  }
`;
