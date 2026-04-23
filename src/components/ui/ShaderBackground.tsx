import { useEffect, useRef } from "react";
import { createShader, createProgram } from "../../lib/shaderUtils";

// ---------------------------------------------------------------------------
// Shader sources
// ---------------------------------------------------------------------------

const VERTEX_SOURCE = /* glsl */ `#version 300 es
  in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SOURCE = /* glsl */ `#version 300 es
  precision mediump float;

  uniform float u_time;
  uniform vec2  u_resolution;
  uniform float u_intensity;
  uniform float u_speed;
  uniform vec3  u_primaryColor;
  uniform vec3  u_secondaryColor;

  out vec4 fragColor;

  // ---- Simplex-style 2D noise (hash-based, no textures) ----

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
       0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
       0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
      -0.577350269189626,   // -1.0 + 2.0 * C.x
       0.024390243902439    // 1.0 / 41.0
    );

    // First corner
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);

    // Other corners
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 x1 = x0 + C.xx - i1;
    vec2 x2 = x0 + C.zz;

    // Permutations
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    m = m * m;
    m = m * m;

    vec3 x  = 2.0 * fract(p * C.www) - 1.0;
    vec3 h  = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.y = a0.y * x1.x + h.y * x1.y;
    g.z = a0.z * x2.x + h.z * x2.y;

    return 130.0 * dot(m, g);
  }

  // ---- Fractal Brownian Motion (2 octaves — cheap) ----

  float fbm(vec2 p) {
    float v = 0.0;
    v += 0.5  * snoise(p);
    v += 0.25 * snoise(p * 2.0 + vec2(1.7, 9.2));
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float t = u_time * u_speed;

    // Aspect-corrected coordinates for noise sampling
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 st = uv * aspect;

    // Two independent drifting noise fields — large scale, slow motion
    float n1 = fbm(st * 1.2 + vec2(t * 0.08, t * 0.06));
    float n2 = fbm(st * 1.5 + vec2(-t * 0.07, t * 0.09) + vec2(5.3, 1.2));

    // Map noise to 0..1 range
    n1 = n1 * 0.5 + 0.5;
    n2 = n2 * 0.5 + 0.5;

    // Blend two color channels independently
    vec3 col = u_primaryColor * n1 * 0.6 + u_secondaryColor * n2 * 0.6;

    // Vignette — darker at edges, brighter in center
    vec2 vc = uv - 0.5;
    float vignette = 1.0 - dot(vc, vc) * 1.8;
    vignette = clamp(vignette, 0.0, 1.0);

    col *= vignette;

    // Output with intensity controlling opacity
    fragColor = vec4(col, u_intensity);
  }
`;

// ---------------------------------------------------------------------------
// Fullscreen quad geometry (two triangles covering clip space)
// ---------------------------------------------------------------------------

const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]);

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface ShaderBackgroundProps {
  /** Overall brightness / opacity (0-1). Default 0.15 */
  intensity?: number;
  /** Primary color as normalized RGB. Default: green (#39FF14) */
  primaryColor?: [number, number, number];
  /** Secondary color as normalized RGB. Default: purple (#9146FF) */
  secondaryColor?: [number, number, number];
  /** Animation speed multiplier. Default 0.3 */
  speed?: number;
}

// Normalized defaults for #39FF14 and #9146FF
const DEFAULT_PRIMARY: [number, number, number] = [
  0x39 / 255,
  0xff / 255,
  0x14 / 255,
];
const DEFAULT_SECONDARY: [number, number, number] = [
  0x91 / 255,
  0x46 / 255,
  0xff / 255,
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShaderBackground({
  intensity = 0.15,
  primaryColor = DEFAULT_PRIMARY,
  secondaryColor = DEFAULT_SECONDARY,
  speed = 0.3,
}: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store mutable values in refs so the render loop always sees latest props
  // without needing to restart the animation.
  const propsRef = useRef({ intensity, primaryColor, secondaryColor, speed });
  useEffect(() => {
    propsRef.current = { intensity, primaryColor, secondaryColor, speed };
  }, [intensity, primaryColor, secondaryColor, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });

    if (!gl) {
      console.warn("[ShaderBackground] WebGL2 not available");
      return;
    }

    // --- Build shader program ---
    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    if (!vs || !fs) return;

    const program = createProgram(gl, vs, fs);
    if (!program) return;

    // --- Geometry ---
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // --- Uniform locations ---
    const uTime = gl.getUniformLocation(program, "u_time");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");
    const uSpeed = gl.getUniformLocation(program, "u_speed");
    const uPrimary = gl.getUniformLocation(program, "u_primaryColor");
    const uSecondary = gl.getUniformLocation(program, "u_secondaryColor");

    // --- Resize handler ---
    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    resize();
    window.addEventListener("resize", resize);

    // --- Render loop ---
    let rafId = 0;
    const startTime = performance.now();

    function frame() {
      rafId = requestAnimationFrame(frame);
      if (!gl || !canvas) return;

      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.bindVertexArray(vao);

      const elapsed = (performance.now() - startTime) / 1000;
      const p = propsRef.current;

      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uIntensity, p.intensity);
      gl.uniform1f(uSpeed, p.speed);
      gl.uniform3f(uPrimary, p.primaryColor[0], p.primaryColor[1], p.primaryColor[2]);
      gl.uniform3f(uSecondary, p.secondaryColor[0], p.secondaryColor[1], p.secondaryColor[2]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    rafId = requestAnimationFrame(frame);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      // Lose the context so the GPU resources are freed immediately
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }, []); // mount once — props flow through propsRef

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
