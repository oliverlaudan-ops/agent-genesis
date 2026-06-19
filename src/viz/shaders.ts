/**
 * Shader source for the WebGL particle cloud renderer.
 *
 * Each particle carries the same fields as the Canvas2D implementation:
 * angle, radius, speed, size, alpha, motion and color.  The vertex shader
 * recreates the four ISEPS motion branches in GLSL so the visual matches
 * the 2D fallback.
 */

export const vertexShaderSource = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aMotion;
  attribute vec3 aColor;

  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uBaseSize;
  uniform float uPopulation;
  uniform float uTrainingPulse;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Same effective radius as the Canvas2D renderer:
    // baseSize * 0.4 + baseSize * 0.6 * radius + population * 0.4
    float pulse = 1.0 + 0.15 * uTrainingPulse;
    float baseSize = uBaseSize * pulse;
    float r = baseSize * 0.4 + baseSize * 0.6 * aRadius + uPopulation * 0.4;
    float phase = uTime * aSpeed;

    vec2 pos;
    int motion = int(aMotion);

    if (motion == 0) {
      // orbit
      pos.x = uCenter.x + cos(aAngle + phase) * r;
      pos.y = uCenter.y + sin(aAngle + phase) * r;
    } else if (motion == 1) {
      // drift
      pos.x = uCenter.x + cos(aAngle * 2.0 + phase * 0.5) * r + sin(phase + aAngle) * 4.0;
      pos.y = uCenter.y + sin(aAngle * 3.0 + phase * 0.3) * r + cos(phase + aAngle) * 4.0;
    } else if (motion == 2) {
      // pulse
      float s = 0.7 + 0.3 * sin(phase * 2.0 + aAngle * 4.0);
      pos.x = uCenter.x + cos(aAngle + phase) * r * s;
      pos.y = uCenter.y + sin(aAngle + phase) * r * s;
    } else {
      // spiral
      float sX = 0.5 + 0.5 * sin(aAngle + phase * 0.5);
      float sY = 0.5 + 0.5 * cos(aAngle + phase * 0.5);
      pos.x = uCenter.x + cos(aAngle * 3.0 + phase) * r * sX;
      pos.y = uCenter.y + sin(aAngle * 3.0 + phase) * r * sY;
    }

    vAlpha = min(1.0, aAlpha + 0.3 * uTrainingPulse);
    vColor = aColor;

    // Map CSS-pixel coordinates to clip space. uCenter is the canvas centre,
    // so pos / uCenter ranges from 0..2 around the centre.
    vec2 clip = vec2(
      (pos.x / uCenter.x) - 1.0,
      -((pos.y / uCenter.y) - 1.0)
    );
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = aSize;
  }
`;

export const fragmentShaderSource = /* glsl */ `
  precision mediump float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;
