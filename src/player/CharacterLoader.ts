import type { CharacterVisual } from './CharacterAnimator.ts';

/** CC0 "Casual Character" by Quaternius (see docs/ASSETS.md). Served from public/, fetched on demand. */
export const CHARACTER_MODEL = 'models/characters/casual-character.glb';

/**
 * Load the GLB character that replaces the procedural humanoid.
 * The glTF loader, the character code and the model are all fetched lazily, after start-up.
 * Rejects on any failure (missing file, parse error, missing clips): the caller then keeps
 * the procedural humanoid.
 */
export async function loadCharacter(): Promise<CharacterVisual | null> {
  const [{ GLTFLoader }, { GlbCharacter }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('./GlbCharacter.ts'),
  ]);
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${CHARACTER_MODEL}`);
  return new GlbCharacter(gltf);
}
