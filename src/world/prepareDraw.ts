// Getting an object ready to be drawn without drawing it: its textures are uploaded and its shader programs start
// compiling for the current render state. three.js otherwise does both on the frame the object is first drawn, on the
// main thread: V8.1 profiling measured 150-300 ms per standard-material program on an integrated GPU, which made a
// 1-1.3 s freeze when the V7 street section first came into view from a car 1.3 km away.
import * as THREE from 'three';

/**
 * Upload the textures of `object` and start compiling its programs as they will be drawn into `target` (null: the
 * canvas) with the lights, fog and environment of `scene`. Program link status is not queried until first use, so the
 * GPU process compiles in the background. Returns the materials involved (for `whenCompiled`).
 */
export function prepareForDraw(renderer: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene, target: THREE.WebGLRenderTarget | null = null): Set<THREE.Material> {
  object.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) renderer.initTexture(v as THREE.Texture);
      const uniforms = (mat as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture | null)?.isTexture) renderer.initTexture(u.value as THREE.Texture);
    }
  });
  const prev = renderer.getRenderTarget();
  // Program variants depend on the bound target (output colour space, tone mapping).
  renderer.setRenderTarget(target);
  try { return renderer.compile(object, camera, scene) as Set<THREE.Material>; } finally { renderer.setRenderTarget(prev); }
}

/** Resolves once every program of these materials has finished compiling (at once without KHR_parallel_shader_compile). */
export function whenCompiled(renderer: THREE.WebGLRenderer, materials: Set<THREE.Material>): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      for (const m of materials) {
        const p = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
        if (!p || p.isReady()) materials.delete(m);
      }
      if (materials.size) window.setTimeout(check, 10); else resolve();
    };
    check();
  });
}
