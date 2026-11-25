// Photographic ground textures (N1-M2): CC0 scans from Poly Haven, recorded in docs/ASSETS.md. They are laid in world
// space (no UVs), each divided by its own mean colour in the shader, so the photograph supplies the texture and the
// land-use map or the vertex colour still supplies the hue.
import * as THREE from 'three';

export interface GroundTextures {
  /** Sparse tropical grass over red soil, 2 m scan. */
  grass: THREE.Texture;
  /** Red laterite soil with gravel, 2 m scan. */
  laterite: THREE.Texture;
  /** Worn concrete slab, 3 m scan. */
  concrete: THREE.Texture;
  /** Worn asphalt, 2.05 m scan: the same photograph as the Jalan China section's road, at half its resolution. */
  asphalt: THREE.Texture;
}

/** Mean linear colour of each shipped texture (what a far mip level, or a missing file, shows). */
export const GROUND_MEAN = {
  grass: [0.0806, 0.0486, 0.0081], laterite: [0.1306, 0.0498, 0.028], concrete: [0.0927, 0.0952, 0.0887], asphalt: [0.0842, 0.0571, 0.0402],
} as const;

/** A 1 x 1 texture of the mean colour: the shader then shows the plain hue. Used when a file cannot be loaded. */
function flat(mean: readonly number[]): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([...mean.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)), 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function flatGroundTextures(): GroundTextures {
  return { grass: flat(GROUND_MEAN.grass), laterite: flat(GROUND_MEAN.laterite), concrete: flat(GROUND_MEAN.concrete), asphalt: flat(GROUND_MEAN.asphalt) };
}

/** Fetch the four ground textures (about 230 KB together). A file that fails to load is replaced by its mean colour. */
export async function loadGroundTextures(baseUrl: string): Promise<GroundTextures> {
  const loader = new THREE.TextureLoader();
  const one = async (name: keyof GroundTextures): Promise<THREE.Texture> => {
    try {
      const t = await loader.loadAsync(`${baseUrl}textures/ground/${name}.webp`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    } catch {
      console.warn(`Ground texture "${name}" is unavailable; using its plain colour`);
      return flat(GROUND_MEAN[name]);
    }
  };
  const [grass, laterite, concrete, asphalt] = await Promise.all([one('grass'), one('laterite'), one('concrete'), one('asphalt')]);
  return { grass, laterite, concrete, asphalt };
}
