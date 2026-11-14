import type { CharacterVisual } from './CharacterAnimator.ts';

/**
 * Optionally load a GLB character to replace the procedural humanoid.
 * Resolve to null when no model is available: the procedural humanoid then stays in use.
 */
export async function loadCharacter(): Promise<CharacterVisual | null> {
  return null;
}
