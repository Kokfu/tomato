// Swapping the player's character model while the game runs (CHAR-P2a).
//
//   load (registry cache) -> prepare (programs compile in the background) -> install in one step
//   (position, heading and visibility copied from the old root) -> camera profile -> dispose the old model
//
// CHAR-P5: with `host.yieldToMain` the load and the prepare run in steps of a few ms (no frame is held for the whole
// build), and `warm(id)` does all of it for a model that is not wanted yet (the next one in the pause menu's cycle, while
// the game is paused): the swap that follows is then just the install.
//
// Position, heading, velocity and grounded state live in the PlayerController, not in the visual, so the swap keeps
// them by construction; the new root only has to start where the old one stood. A failure never leaves the player
// without a model: the current one stays, or the default is restored, with one console warning.
import type { CharacterVisual } from '../CharacterAnimator.ts';
import { DEFAULT_CHARACTER_ID, getProfile } from './CharacterProfile.ts';
import type { CharacterProfile } from './CharacterProfile.ts';
import type { CharacterRegistry } from './CharacterRegistry.ts';
import { LoadStalledError } from './CharacterRegistry.ts';

export interface SwapHost {
  registry: Pick<CharacterRegistry, 'create' | 'dispose' | 'enforceBudget'>;
  /** Put `next` in the scene in place of the current visual (same parent, same pose and visibility); return the old one. */
  install(next: CharacterVisual): CharacterVisual;
  /** Upload textures and compile programs of a model that is not in the scene yet. `mark` receives the stage timings. */
  prepare(root: CharacterVisual['root'], mark?: (stage: string, ms: number) => void): Promise<void>;
  /** Apply the profile's camera heights. */
  applyCamera(profile: CharacterProfile): void;
  /** Re-apply the single body-visibility rule (src/player/character/visibility.ts). */
  syncBody(): void;
  warn(message: string, error?: unknown): void;
  /** Persist the choice (only called when the flag is on). */
  persist?(id: string): void;
  /** CHAR-P5: resolves after the main thread has had a turn; makes the swap run in steps instead of one long task. */
  yieldToMain?(): Promise<void>;
  /** CHAR-P5, step 0: a swap (or warm-up) of `id` starts; returns its number for `mark`. */
  begin?(id: string): number;
  /** CHAR-P5, step 0: stage timing (flag-only diagnostics). */
  mark?(stage: string, ms: number, swap?: number, id?: string): void;
  /** CHAR-P5: draw a prepared hidden model once (far from the camera, one mesh per frame) so its first-draw cost is paid before it is installed. */
  predraw?(root: CharacterVisual['root']): Promise<void>;
}

/** A model built and prepared in advance for the swap that is expected next. */
interface WarmSlot {
  id: string;
  /** Resolves with the ready instance, or null when it could not be built (or was dropped before it finished). */
  promise: Promise<CharacterVisual | null>;
  visual: CharacterVisual | null;
  /** Set when nobody wants it any more: it is disposed as soon as it exists. */
  dropped: boolean;
  /** True once `promise` has settled. */
  settled: boolean;
  /** Set when the build failed because the file's download stalled (see LoadStalledError). */
  stalled: LoadStalledError | null;
}

export class CharacterSwapper {
  /** Id of the profile whose model is on screen ("default" while the procedural humanoid stands in for it). */
  currentId = DEFAULT_CHARACTER_ID;
  /** True while the stand-in procedural humanoid is shown because no GLB could be loaded. */
  usingFallback = true;
  /** True while the newest swap is still loading. */
  loading = false;
  /** CHAR-P5 G2: why the last `strict` swap failed (null after a success or while loading). */
  lastError: Error | null = null;
  private token = 0;
  private warmSlot: WarmSlot | null = null;

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
  async swap(id: string, opts: { persist?: boolean; compile?: boolean; direct?: boolean; strict?: boolean } = {}): Promise<boolean> {
    const compile = opts.compile ?? true;
    const direct = opts.direct ?? false;
    const strict = opts.strict ?? false;
    const profile = getProfile(id);
    if (!profile) {
      this.host.warn(`Unknown character "${id}", keeping "${this.currentId}"`);
      return false;
    }
    if (!this.usingFallback && profile.id === this.currentId) {
      ++this.token; // drop a pending swap to another model: the player asked for this one
      this.loading = false;
      this.lastError = null;
      if (opts.persist) this.host.persist?.(profile.id);
      return true;
    }
    const mine = ++this.token;
    this.loading = true;
    this.lastError = null;
    const t0 = performance.now();
    const n = this.host.begin?.(profile.id) ?? 0;
    const mark = (stage: string, ms: number) => this.host.mark?.(stage, ms, n, profile.id);
    let next: CharacterVisual | null = null;
    let used = profile;
    try {
      next = (!direct && (await this.takeWarm(profile.id, strict))) || (await this.load(profile, compile, direct, mark));
    } catch (e) {
      if (mine !== this.token) return false; // superseded: no warning and no fallback work (the newer swap owns `loading`)
      if (strict) {
        // CHAR-P5 G2 picker: the player chose this model, so a failure is shown to them ("Try again"), not hidden behind the
        // default. The model on screen (if any) stays; nothing is installed, persisted or disposed.
        this.host.warn(`Character "${profile.id}" could not be loaded:`, e);
        this.loading = false;
        this.lastError = e instanceof Error ? e : new Error(String(e));
        return false;
      }
      // One warning per failed swap, then the default (unless it is what the player already has).
      const def = getProfile(DEFAULT_CHARACTER_ID)!;
      if (profile.id === def.id) this.host.warn('Character model unavailable, using procedural humanoid:', e);
      else this.host.warn(`Character "${profile.id}" unavailable, falling back to "${DEFAULT_CHARACTER_ID}":`, e);
      if (profile.id !== def.id && (this.currentId !== def.id || this.usingFallback)) {
        try { next = await this.load(def, compile, false, mark); used = def; } catch { next = null; }
      }
    }
    if (mine !== this.token) {
      // A newer swap started while this one was loading: its result wins, this one is thrown away.
      if (next) this.host.registry.dispose(next);
      return false;
    }
    this.loading = false;
    if (!next) return false;
    const t1 = performance.now();
    const old = this.host.install(next);
    this.host.registry.dispose(old);
    this.currentId = used.id;
    this.usingFallback = false;
    this.host.applyCamera(used);
    this.host.syncBody();
    this.keepCached(used);
    if (opts.persist && used.id === profile.id) this.host.persist?.(used.id);
    const t2 = performance.now();
    mark('install', t2 - t1);
    mark('total', t2 - t0);
    return used.id === profile.id;
  }

  /**
   * Build and prepare the model of `id` in the background (hidden, in steps), so that `swap(id)` finds it ready. One model
   * is kept this way; asking for another drops the previous one. Does nothing for the model on screen or an unknown id.
   * Resolves true when a model is ready (or was already). Never rejects. Call it only while the game is paused: the work
   * is split into small steps, but the first draw of the hidden model is one frame.
   */
  async warm(id: string): Promise<boolean> {
    const profile = getProfile(id);
    if (!profile || (!this.usingFallback && profile.id === this.currentId)) return false;
    if (this.warmSlot && this.warmSlot.id === profile.id && !this.warmSlot.dropped) return !!(await this.warmSlot.promise);
    this.dropWarm();
    const n = this.host.begin?.(profile.id) ?? 0;
    const mark = (stage: string, ms: number) => this.host.mark?.('warm.' + stage, ms, n, profile.id);
    const slot: WarmSlot = { id: profile.id, visual: null, dropped: false, settled: false, stalled: null, promise: null as unknown as Promise<CharacterVisual | null> };
    slot.promise = (async () => {
      let v: CharacterVisual | null = null;
      try {
        v = await this.load(profile, true, false, mark, () => !slot.dropped); // includes the hidden predraw
      } catch (e) {
        if (v) this.host.registry.dispose(v);
        v = null;
        if (e instanceof LoadStalledError) slot.stalled = e;
      }
      if (v && slot.dropped) { this.host.registry.dispose(v); v = null; }
      slot.visual = v;
      slot.settled = true;
      return v;
    })();
    this.warmSlot = slot;
    return !!(await slot.promise);
  }

  /** CHAR-P5 G2: the player cancelled the picker: a swap still loading is dropped (its model is disposed when it arrives). */
  abort(): void {
    ++this.token;
    this.loading = false;
  }

  /** True while a model for `id` is built, or being built, in advance. */
  hasWarm(id: string): boolean {
    return !!this.warmSlot && !this.warmSlot.dropped && this.warmSlot.id === id;
  }

  /** Release the pre-built model (if any) that nobody took. */
  dropWarm(): void {
    const w = this.warmSlot;
    this.warmSlot = null;
    if (!w) return;
    w.dropped = true;
    if (w.visual) { this.host.registry.dispose(w.visual); w.visual = null; }
  }

  /** CHAR-P5: the game resumed: a warm-up still being built stops at its next step (a finished one is kept for the next pause). */
  cancelPendingWarm(): void {
    const w = this.warmSlot;
    if (w && !w.visual && !w.dropped) this.dropWarm();
  }

  /** The ready model of `id` from the warm slot (waiting for it when it is being built), or null. Another id drops the slot. */
  private async takeWarm(id: string, strict: boolean): Promise<CharacterVisual | null> {
    const w = this.warmSlot;
    if (!w) return null;
    if (w.id !== id) { this.dropWarm(); return null; }
    this.warmSlot = null;
    const waited = !w.settled; // still being built when asked for: this swap shares its wait
    const v = await w.promise;
    if (v) w.visual = null; // ours now
    // CHAR-P5 G2 (B3): the warm-up this swap waited on stalled (one full stall timer already spent). A strict swap (the picker) reports it now,
    // the player presses Try again (a request of its own), instead of starting a second wait of the same length. A warm-up that failed
    // before the swap asked is not held against it: the swap loads afresh.
    else if (waited && strict && w.stalled) throw w.stalled;
    return v;
  }

  /** The files of the model on screen, of the default and of the warm model stay; of the rest as many as the byte budget allows. */
  private keepCached(used: CharacterProfile): void {
    const def = getProfile(DEFAULT_CHARACTER_ID)!;
    const keep = [def.url, used.url];
    const w = this.warmSlot && getProfile(this.warmSlot.id);
    if (w) keep.push(w.url);
    this.host.registry.enforceBudget(keep);
  }

  /** `alive` (warm-ups): when it turns false the build stops at its next step (the yield throws). */
  private async load(profile: CharacterProfile, compile: boolean, direct: boolean, mark: (stage: string, ms: number) => void, alive?: () => boolean): Promise<CharacterVisual> {
    const y = this.host.yieldToMain;
    const staged = !direct && y ? { yieldToMain: alive ? async () => { await y.call(this.host); if (!alive()) throw new Error('warm-up dropped'); } : y.bind(this.host) } : {};
    const visual = await this.host.registry.create(profile.id, { direct, ...staged, mark: this.host.mark ? mark : undefined });
    try {
      if (compile) {
        if (staged.yieldToMain) await staged.yieldToMain();
        const t = performance.now();
        await this.host.prepare(visual.root, this.host.mark ? mark : undefined);
        mark('prepare', performance.now() - t);
        // CHAR-P5: every staged load (warm-up, swap in play, hook swap, first cold swap, a tap before the warm-up finished) draws
        // the model once, hidden, BEFORE it can be installed: its first draw (geometry upload, bone texture, shadow program)
        // never lands on the frame that shows it. The host does it one mesh per frame.
        if (!direct && this.host.predraw && (!alive || alive())) {
          const t2 = performance.now();
          await this.host.predraw(visual.root);
          mark('predraw', performance.now() - t2);
        }
      }
    } catch (e) {
      this.host.registry.dispose(visual);
      throw e;
    }
    return visual;
  }
}
