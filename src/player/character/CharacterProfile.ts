// Playable-character profiles (CHAR-P2a): pure data, no three.js, safe to import anywhere and to unit-test in node.
// A profile describes how one character model is presented: which file, how tall, where the camera sits, which clips
// play for which role, and its licence. Gameplay physics never reads it: collision radius, speeds, jump and step
// height are the same constants for every character (CHAR plan, acceptance criterion 2).

export type ClipRole = 'idle' | 'walk' | 'run' | 'turnL' | 'turnR' | 'airborne';

export interface CharacterProfile {
  /** Stable id used by `?char=<id>` and persisted as `k3d.character`. */
  readonly id: string;
  /** UI name. */
  readonly label: string;
  /** GLB path relative to the app base (public/). */
  readonly url: string;
  /** Normalised standing height in metres (soles to crown). */
  readonly heightM: number;
  /** Third-person look-at pivot above the feet (m). */
  readonly pivotHeight: number;
  /** First-person eye above the feet (m). */
  readonly eyeHeight: number;
  /** Exact clip names per role; a missing role falls back to the word search in GlbCharacter. */
  readonly clips: Readonly<Partial<Record<ClipRole, string>>>;
  /** Extra uniform scale and offset (m) applied after the height normalisation. */
  readonly scale: number;
  readonly offset: readonly [number, number, number];
  /** Extra yaw (radians) when the automatic facing detection is not right for the model. */
  readonly yawFix: number;
  /** Playback-rate factor of the gait/idle/turn animation (1 = as authored). */
  readonly animRate: number;
  /** Turn on the spot while standing (turn clips if the profile names them, else a slowed walk cycle). */
  readonly turnInPlace: boolean;
  /** Exact foot bone names, only if the automatic match fails for the model. */
  readonly feet?: readonly [string, string];
  /** Licence identifier (see docs/ASSETS.md). */
  readonly licence: string;
  /** Developer-only profile: never offered by the cycle button, only reachable by `?char=<id>`. */
  readonly dev?: boolean;
  /**
   * CHAR-P5 G2: a retired test character (the CHAR-P2a Rocketbox prototypes). Not in the picker, not in the cycle and never
   * restored from the saved choice; still reachable by `?char=<id>` and the debug hook so the existing tests keep their reference
   * models. The GLB files stay in the repository.
   */
  readonly legacy?: boolean;
  /** CHAR-P5 G2: the picker card of a player-selectable character (only the six approved MPFB characters have one). */
  readonly picker?: { readonly name: string; readonly height: string };
}

/** The adult-man proportions the camera was tuned for: pivot 1.52 m and eye 1.62 m at 1.72 m. */
export const PIVOT_RATIO = 0.884;
export const EYE_RATIO = 0.942;

export function cameraHeights(heightM: number): { pivot: number; eye: number } {
  return { pivot: +(PIVOT_RATIO * heightM).toFixed(4), eye: +(EYE_RATIO * heightM).toFixed(4) };
}

/** Fill the defaults of a profile: camera heights from the height ratios, neutral scale/offset/rate. */
export function defineProfile(p: Pick<CharacterProfile, 'id' | 'label' | 'url' | 'heightM' | 'licence'> & Partial<CharacterProfile>): CharacterProfile {
  const cam = cameraHeights(p.heightM);
  return {
    clips: {}, scale: 1, offset: [0, 0, 0], yawFix: 0, animRate: 1, turnInPlace: false,
    pivotHeight: cam.pivot, eyeHeight: cam.eye,
    ...p,
  };
}

export const DEFAULT_CHARACTER_ID = 'default';
const BASE = 'models/characters/';
const ROCKETBOX_CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Run', turnL: 'TurnLeft', turnR: 'TurnRight' } as const;
const ROCKETBOX_FEET = ['Bip01_L_Foot', 'Bip01_R_Foot'] as const;
const MPFB_CLIPS = { ...ROCKETBOX_CLIPS, airborne: 'Jump' } as const;
const MPFB_FEET = ['foot_l', 'foot_r'] as const;
const MPFB_LICENCE = 'CC0-1.0+MIT-Rocketbox-clips';

/**
 * The registry data. "default" is the shipped Quaternius model, exactly as before (1.72 m; pivot 1.52 and eye 1.62
 * are stated, not derived, so the default view is bit-identical to the pre-CHAR camera).
 */
export const CHARACTER_PROFILES: readonly CharacterProfile[] = [
  defineProfile({
    id: DEFAULT_CHARACTER_ID, label: 'Default (Quaternius)', url: `${BASE}casual-character.glb`, heightM: 1.72,
    pivotHeight: 1.52, eyeHeight: 1.62, licence: 'CC0-1.0',
  }),
  // CHAR-P2a prototype adults (Microsoft Rocketbox, MIT), converted by Studio (docs/ASSETS.md). Heights: Malaysian averages
  // (man 1.70, woman 1.58). Clip names confirmed against the delivered GLBs: Idle, Walk, Run, TurnLeft, TurnRight (all in
  // place; the turn clips have their +-90 degree body rotation removed, so the controller's yaw supplies it). There is no
  // jump clip: the airborne pose comes from the run cycle. three.js sanitises the bone names ("Bip01 L Foot" becomes
  // "Bip01_L_Foot"), which the automatic foot finder does not match, so the feet are named here.
  defineProfile({ id: 'adult-man', label: 'Adult man', url: `${BASE}adult-man.glb`, heightM: 1.70, licence: 'MIT-Rocketbox', turnInPlace: true, clips: ROCKETBOX_CLIPS, feet: ROCKETBOX_FEET, legacy: true }),
  defineProfile({ id: 'adult-woman', label: 'Adult woman', url: `${BASE}adult-woman.glb`, heightM: 1.58, licence: 'MIT-Rocketbox', turnInPlace: true, clips: ROCKETBOX_CLIPS, feet: ROCKETBOX_FEET, legacy: true }),
  // CHAR-P4: the six MakeHuman/MPFB characters (Studio, docs/ASSETS.md). One rig and one clip set: Idle, Walk, Run,
  // TurnLeft, TurnRight, Jump (names read from the GLBs); feet foot_l / foot_r. The GLBs are authored in metres, so
  // heightM is their idle height with hair, trimmed by the measured hair offset (e2e, in-game) so that the body alone,
  // without hair, is 1.70 / 1.58 / 1.66 / 1.56 / 1.28 / 1.27 m; the whole figure with hair is 1.1-1.5 cm taller. The clips are retargeted Rocketbox (MIT)
  // plus the Quaternius CC0 jump; the turn clips are in place, so turnInPlace is on and the controller's yaw rotates the body.
  // CHAR-P5 G2 picker card (Studio): the short name and the body height without hair, above.
  ...[
    ['man', 'Adult Man', 'man.glb', 1.707, 'Man', '1.70 m'], ['woman', 'Adult Woman', 'woman.glb', 1.589, 'Woman', '1.58 m'],
    ['teen-boy', 'Teen Boy', 'teen-boy.glb', 1.666, 'Teen boy', '1.66 m'], ['teen-girl', 'Teen Girl', 'teen-girl.glb', 1.572, 'Teen girl', '1.56 m'],
    ['young-boy', 'Young Boy', 'young-boy.glb', 1.294, 'Young boy', '1.28 m'], ['young-girl', 'Young Girl', 'young-girl.glb', 1.277, 'Young girl', '1.27 m'],
  ].map(([id, label, file, h, name, height]) => defineProfile({
    id: id as string, label: label as string, url: `${BASE}${file}`, heightM: h as number, licence: MPFB_LICENCE,
    turnInPlace: true, clips: MPFB_CLIPS, feet: MPFB_FEET, picker: { name: name as string, height: height as string },
  })),
  // Test-only: the default model at another height, to exercise the seam without new art (reachable by ?char=test-short).
  defineProfile({ id: 'test-short', label: 'Test (default model, 1.30 m)', url: `${BASE}casual-character.glb`, heightM: 1.3, licence: 'CC0-1.0', turnInPlace: true, animRate: 1.1, dev: true }),
];

const byId = new Map(CHARACTER_PROFILES.map((p) => [p.id, p]));

export function getProfile(id: string | null | undefined): CharacterProfile | null {
  return (id && byId.get(id)) || null;
}

/** The default profile (always present). */
export function defaultProfile(): CharacterProfile {
  return byId.get(DEFAULT_CHARACTER_ID)!;
}

/** Profiles offered by the cycle (everything except dev-only and retired test characters). */
export function listProfiles(): CharacterProfile[] {
  return CHARACTER_PROFILES.filter((p) => !p.dev && !p.legacy);
}

/** CHAR-P5 G2: the characters of the picker, in order: the six approved MPFB characters (adults, teens, children). */
export function pickerProfiles(): CharacterProfile[] {
  return CHARACTER_PROFILES.filter((p) => !!p.picker);
}

/** True for an id a player can choose (and that a saved choice may restore). */
export function isPickable(id: string | null | undefined): boolean {
  return !!getProfile(id)?.picker;
}

/** The next profile in the cycle after `id` (unknown id: the first). */
export function nextProfileId(id: string): string {
  const l = listProfiles();
  const i = l.findIndex((p) => p.id === id);
  return l[(i + 1) % l.length].id;
}

export const CHARACTER_STORAGE_KEY = 'k3d.character';

/**
 * Which character to start with. No `?char` flag: always the default (the feature is dormant and nothing is read
 * from storage). With the flag: `?char=<id>` for a known id (developer/test link: any profile), otherwise (`?char`, or an
 * unknown id) the saved id when it is one of the six selectable characters. `persist` is true only for a valid `?char=<id>`.
 * `needsPick` (CHAR-P5 G2): the flag is on and nothing valid was asked for or saved, so the picker is shown after Start; the id is
 * then the default placeholder, which is not loaded. A saved id that is unknown, removed or retired (a Rocketbox prototype, the
 * default model) counts as no saved choice.
 */
/** N1-M1: the character picker path is on by default in a browser; `?char=0` is the old no-flag game. */
export function charEnabled(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('char') ? q.get('char') !== '0' : true;
}

export function resolveStartCharacter(search: string, saved: string | null): { id: string; flag: boolean; persist: boolean; invalid: string | null; needsPick: boolean } {
  const q = new URLSearchParams(search);
  if (!charEnabled(search)) return { id: DEFAULT_CHARACTER_ID, flag: false, persist: false, invalid: null, needsPick: false };
  const asked = q.get('char') ?? '';
  if (asked && getProfile(asked)) return { id: asked, flag: true, persist: true, invalid: null, needsPick: false };
  const ok = isPickable(saved);
  return { id: ok ? saved! : DEFAULT_CHARACTER_ID, flag: true, persist: false, invalid: asked || null, needsPick: !ok };
}

/** localStorage access with the existing k3d.* try/catch pattern (private windows, blocked storage). */
export function loadSavedCharacter(storage: Pick<Storage, 'getItem'> | null = safeStorage()): string | null {
  try { return storage?.getItem(CHARACTER_STORAGE_KEY) ?? null; } catch { return null; }
}
export function saveCharacter(id: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(CHARACTER_STORAGE_KEY, id); } catch { /* storage unavailable */ }
}
function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
