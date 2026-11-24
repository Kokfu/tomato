// Stage timings of character swaps (CHAR-P5 step 0). Read-only diagnostics, created only with `?char`, exposed as
// `__k3d.character.timings`: nothing in the game reads them and nothing is created without the flag.
export interface StageEntry {
  /** 1-based number of the swap (or warm-up) this belongs to. */
  swap: number;
  /** Profile id the swap was for. */
  id: string;
  /** Stage name: fetch, clone, build.*, prepare.*, install, total; 'warm.' prefix while a hidden model is prepared in advance. */
  stage: string;
  ms: number;
  /** performance.now() when the stage was recorded. */
  at: number;
}

const MAX_ENTRIES = 600;

export class CharacterTimings {
  readonly entries: StageEntry[] = [];
  private swapNo = 0;
  private id = '';

  /** A new swap (or warm-up) of profile `id` starts: later marks belong to it. */
  begin(id: string): number {
    this.id = id;
    return ++this.swapNo;
  }

  /** Record a stage. `swap` defaults to the newest swap. */
  readonly mark = (stage: string, ms: number, swap = this.swapNo, id = this.id): void => {
    this.entries.push({ swap, id, stage, ms: Math.round(ms * 100) / 100, at: Math.round(performance.now() * 10) / 10 });
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
  };

  /** Stage -> ms of the newest swap (a repeated stage is summed). */
  get last(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) if (e.swap === this.swapNo) out[e.stage] = Math.round(((out[e.stage] ?? 0) + e.ms) * 100) / 100;
    return out;
  }

  /** Every stage name seen for swap number `swap`, in order. */
  stages(swap: number): string[] {
    return this.entries.filter((e) => e.swap === swap).map((e) => e.stage);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/** Resolves after the main thread has had a turn (timers and rendering run); a macrotask, not a frame, so a swap is not slowed to 60 stages per second. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    } else setTimeout(resolve, 0);
  });
}
