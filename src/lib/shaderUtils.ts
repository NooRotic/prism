/**
 * WebGL utility functions for shader compilation and program linking.
 */

/**
 * Compiles a WebGL shader from source code.
 * Returns null and logs a warning on failure.
 */
export function createShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.warn("[ShaderUtils] Failed to create shader object");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    console.warn(
      `[ShaderUtils] Shader compilation failed:\n${info ?? "Unknown error"}`
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

/**
 * Links a vertex and fragment shader into a WebGL program.
 * Returns null and logs a warning on failure.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) {
    console.warn("[ShaderUtils] Failed to create program object");
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    console.warn(
      `[ShaderUtils] Program linking failed:\n${info ?? "Unknown error"}`
    );
    gl.deleteProgram(program);
    return null;
  }

  return program;
}
