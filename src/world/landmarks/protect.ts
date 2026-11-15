// Guard between the landmark registry and the generic building generators. Pure (no three.js).
//
// A building record that carries a landmark id (`lm`) is drawn by its dedicated model only. Every
// generic generator calls assertGeneric() first, so a protected landmark that is ever routed into
// one fails loudly (and is counted for the automated tests) instead of quietly turning back into
// a shophouse.
import { ARCH_CLASSES, SHOPFRONT_CLASSES } from '../types.ts';

export interface Protectable { id: number; lm?: string; ac?: number; a?: { f: number[] } }

/** Protected landmarks that reached a generic generator (should stay empty). */
export const guardViolations: { id: number; lm: string; renderer: string }[] = [];

export function isProtectedLandmark(b: Protectable): boolean {
  return b.lm !== undefined;
}

/** Call at the top of every generic building generator. */
export function assertGeneric(b: Protectable, renderer: string): void {
  if (b.lm === undefined) return;
  guardViolations.push({ id: b.id, lm: b.lm, renderer });
  throw new Error(`Protected landmark "${b.lm}" (building ${b.id}) was passed to the generic ${renderer} renderer`);
}

/** True when the shophouse-row generator may be applied to this building's architectural class. */
export function mayHaveShopfront(b: Protectable): boolean {
  return b.lm === undefined && SHOPFRONT_CLASSES.has(ARCH_CLASSES[b.ac ?? 0]);
}
