import type { CharacterVisual } from './CharacterAnimator.ts';
import type { CharacterSource, GlbCharacterOptions } from './GlbCharacter.ts';

/** CC0 "Casual Character" by Quaternius (see docs/ASSETS.md). Served from public/, fetched on demand. */
export const CHARACTER_MODEL = 'models/characters/casual-character.glb';

/** Fetch and parse a character GLB (`url` is relative to the app base). The glTF loader is imported lazily. */
export async function loadGltf(url: string, onProgress?: (e: ProgressEvent) => void): Promise<CharacterSource> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${url}`, onProgress);
}

/**
 * Build the animated character from a parsed glTF (the character code is imported lazily). Throws on a bad model. With
 * `yieldToMain` the build runs in steps with a yield between them (CHAR-P5), otherwise in one go.
 */
export async function buildCharacter(src: CharacterSource, opts?: GlbCharacterOptions, yieldToMain?: () => Promise<void>): Promise<CharacterVisual> {
  const { GlbCharacter } = await import('./GlbCharacter.ts');
  return yieldToMain ? GlbCharacter.buildStaged(src, opts ?? {}, yieldToMain) : new GlbCharacter(src, opts);
}

/**
 * Load the GLB character that replaces the procedural humanoid, exactly as before CHAR: the glTF loader and the character
 * code are fetched first, then the model; nothing is cloned or cached. `opts` come from the profile (the default
 * profile's options reproduce `new GlbCharacter(gltf)`). Rejects on any failure (missing file, parse error, missing
 * clips): the caller then keeps the procedural humanoid.
 */
export async function loadCharacter(url: string = CHARACTER_MODEL, opts?: GlbCharacterOptions): Promise<CharacterVisual> {
  const [{ GLTFLoader }, { GlbCharacter }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('./GlbCharacter.ts'),
  ]);
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${url}`);
  return new GlbCharacter(gltf, opts);
}
