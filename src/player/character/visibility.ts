/** Where the camera and the character are, as far as the visibility of the player's body is concerned. */
export interface BodyState {
  /** First-person camera at the eyes. */
  firstPerson: boolean;
  /** The character is in the car (the body is hidden whatever the camera does). */
  driving: boolean;
  /** OP / developer fly mode: a free camera; the avatar stays visible where it stands (as before CHAR). */
  flying: boolean;
}

/**
 * The single rule for showing the player's body: hidden in the car, and in first-person except in OP fly mode
 * (which never used the walking camera, and shows the avatar where it stands). Every place that changes one of the
 * three states, and every code path that installs a character model (first load, swap), applies this, so a model
 * that finishes loading while driving stays hidden.
 */
export function bodyVisible(s: BodyState): boolean {
  return !s.driving && (s.flying || !s.firstPerson);
}
