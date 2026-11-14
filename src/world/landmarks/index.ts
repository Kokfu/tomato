import type { LandmarkManager } from '../LandmarkManager.ts';

/**
 * Register custom landmark models (overrides for generic generated buildings).
 * Called once at start-up, before any chunk is built.
 */
export function registerLandmarks(_manager: LandmarkManager): void {
  // Landmark model overrides are registered here.
}
