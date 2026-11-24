// Uploading a model's textures one at a time (CHAR-P5): `renderer.initTexture` decodes-and-uploads a 1024 x 1024 texture
// plus its mipmaps in one go (a few ms on a desktop, several times that on a phone), and `prepareForDraw` does every
// texture of the model in one task. Doing them here first, one per step, leaves `prepareForDraw` only the cheap part (its
// own `initTexture` calls find the texture already uploaded and return at once).
import * as THREE from 'three';

/** Textures of every material under `root`, each once. */
export function texturesOf(root: THREE.Object3D): THREE.Texture[] {
  const seen = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) seen.add(v as THREE.Texture);
    }
  });
  return [...seen];
}

/** Upload the textures of `root` to the GPU, one per step. */
export async function uploadTexturesStaged(renderer: THREE.WebGLRenderer, root: THREE.Object3D, yieldToMain: () => Promise<void>): Promise<void> {
  for (const tex of texturesOf(root)) {
    renderer.initTexture(tex);
    await yieldToMain();
  }
}
