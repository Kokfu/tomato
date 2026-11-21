// Swapping the player's character model while the game runs (CHAR-P2a).
//
//   load (registry cache) -> prepare (programs compile in the background) -> install in one step
//   (position, heading and visibility copied from the old root) -> camera profile -> dispose the old model
//
// Position, heading, velocity and grounded state live in the PlayerController, not in the visual, so the swap keeps
// them by construction; the new root only has to start where the old one stood. A failure never leaves the player
// without a model: the current one stays, or the default is restored, with one console warning.
import type { CharacterVisual } from '../CharacterAnimator.ts';
import { DEFAULT_CHARACTER_ID, getProfile } from './CharacterProfile.ts';
import type { CharacterProfile } from './CharacterProfile.ts';
import type { CharacterRegistry } from './CharacterRegistry.ts';

export interface SwapHost {
  registry: Pick<CharacterRegistry, 'create' | 'dispose' | 'trim'>;
  /** Put `next` in the scene in place of the current visual (same parent, same pose and visibility); return the old one. */
  install(next: CharacterVisual): CharacterVisual;
  /** Upload textures and compile programs of a model that is not in the scene yet. */
  prepare(root: CharacterVisual['root']): Promise<void>;
  /** Apply the profile's camera heights. */
  applyCamera(profile: CharacterProfile): void;
  /** Re-apply the single body-visibility rule (src/player/character/visibility.ts). */
  syncBody(): void;
  warn(message: string, error?: unknown): void;
  /** Persist the choice (only called when the flag is on). */
  persist?(id: string): void;
}

export class CharacterSwapper {
  /** Id of the profile whose model is on screen ("default" while the procedural humanoid stands in for it). */
  currentId = DEFAULT_CHARACTER_ID;
  /** True while the stand-in procedural humanoid is shown because no GLB could be loaded. */
  usingFallback = true;
  /** True while the newest swap is still loading. */
  loading = false;
  private token = 0;
  /** URLs of the profiles used last (most recent first, the default excluded): their parsed files stay cached. */
  private recent: string[] = [];

  private host: SwapHost;
  constructor(host: SwapHost) { this.host = host; }

  /**
   * Make `id` the player's character. Resolves true when the model of `id` is now installed (or already was), false
   * when it was replaced by the default, left alone, or superseded by a newer call. Never rejects.
   *
   * A call supersedes an earlier swap that is still loading only when it starts a load of its own, or when it asks for
   * the model already on screen (the earlier choice is then dropped). An unknown id changes nothing.
   * `direct` loads the model exactly as the game did before CHAR (no clone, no cache): the no-flag start.
   */
  async swap(id: string, opts: { persist?: boolean; compile?: boolean; direct?: boolean } = {}): Promise<boolean> {
    const compile = opts.compile ?? true;
    const direct = opts.direct ?? false;
    const profile = getProfile(id);
    if (!profile) {
      this.host.warn(`Unknown character "${id}", keeping "${this.currentId}"`);
      return false;
    }
    if (!this.usingFallback && profile.id === this.currentId) {
      ++this.token; // drop a pending swap to another model: the player asked for this one
      this.loading = false;
      if (opts.persist) this.host.persist?.(profile.id);
      return true;
    }
    const mine = ++this.token;
    this.loading = true;
    let next: CharacterVisual | null = null;
    let used = profile;
    try {
      next = await this.load(profile, compile, direct);
    } catch (e) {
      if (mine !== this.token) return false; // superseded: no warning and no fallback work (the newer swap owns `loading`)
      // One warning per failed swap, then the default (unless it is what the player already has).
      const def = getProfile(DEFAULT_CHARACTER_ID)!;
      if (profile.id === def.id) this.host.warn('Character model unavailable, using procedural humanoid:', e);
      else this.host.warn(`Character "${profile.id}" unavailable, falling back to "${DEFAULT_CHARACTER_ID}":`, e);
      if (profile.id !== def.id && (this.currentId !== def.id || this.usingFallback)) {
        try { next = await this.load(def, compile, false); used = def; } catch { next = null; }
      }
    }
    if (mine !== this.token) {
      // A newer swap started while this one was loading: its result wins, this one is thrown away.
      if (next) this.host.registry.dispose(next);
      return false;
    }
    this.loading = false;
    if (!next) return false;
    const old = this.host.install(next);
    this.host.registry.dispose(old);
    this.currentId = used.id;
    this.usingFallback = false;
    this.host.applyCamera(used);
    this.host.syncBody();
    this.keepCached(used);
    if (opts.persist && used.id === profile.id) this.host.persist?.(used.id);
    return used.id === profile.id;
  }

  /** The default and the last two profiles used keep their parsed file; everything else is released. */
  private keepCached(used: CharacterProfile): void {
    const def = getProfile(DEFAULT_CHARACTER_ID)!;
    if (used.url !== def.url) this.recent = [used.url, ...this.recent.filter((u) => u !== used.url)].slice(0, RECENT_KEPT);
    this.host.registry.trim([def.url, ...this.recent]);
  }

  private async load(profile: CharacterProfile, compile: boolean, direct: boolean): Promise<CharacterVisual> {
    const visual = await this.host.registry.create(profile.id, { direct });
    try {
      if (compile) await this.host.prepare(visual.root);
    } catch (e) {
      this.host.registry.dispose(visual);
      throw e;
    }
    return visual;
  }
}

/** Parsed files kept besides the default (the profiles used last). */
export const RECENT_KEPT = 2;
