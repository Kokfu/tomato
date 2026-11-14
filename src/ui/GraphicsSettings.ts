// Graphics presets. They only change rendering cost - never geography or collision rules.
export type QualityName = 'low' | 'medium' | 'high';

export interface Quality {
  name: QualityName;
  /** Chunk radius rendered with full detail. */
  highRadius: number;
  /** Chunk radius rendered with simplified detail (beyond highRadius). */
  lowRadius: number;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  /** Shadow map size (0 = shadows off). */
  shadowMap: number;
  shadowRange: number;
  treeDensity: number;
  groundTex: number;
}

export const QUALITY: Record<QualityName, Quality> = {
  low: { name: 'low', highRadius: 1, lowRadius: 2, maxPixelRatio: 1, shadowMap: 0, shadowRange: 0, treeDensity: 0.35, groundTex: 256 },
  medium: { name: 'medium', highRadius: 1, lowRadius: 3, maxPixelRatio: 1.5, shadowMap: 1024, shadowRange: 70, treeDensity: 0.8, groundTex: 512 },
  high: { name: 'high', highRadius: 2, lowRadius: 5, maxPixelRatio: 2, shadowMap: 2048, shadowRange: 110, treeDensity: 1, groundTex: 512 },
};

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function defaultQuality(): QualityName {
  let saved: QualityName | null = null;
  try { saved = localStorage.getItem('k3d.quality') as QualityName | null; } catch { /* storage unavailable */ }
  if (saved && QUALITY[saved]) return saved;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  if (isTouchDevice() && small) return 'low';
  return 'medium';
}

export function saveQuality(q: QualityName): void {
  try { localStorage.setItem('k3d.quality', q); } catch { /* storage unavailable */ }
}

/**
 * Adaptive render resolution: lowers the internal resolution when frames are slow and restores it
 * when there is headroom. If lowering the resolution does not raise the frame rate (display capped
 * at a low refresh rate, or CPU-bound), the change is reverted and scaling pauses for a while.
 */
export class AdaptiveResolution {
  scale = 1;
  enabled = true;
  /** Frame rate the scaler tries to hold. */
  target = 50;
  private acc = 0;
  private frames = 0;
  private probeFps = 0;
  private probeScale = 1;
  private lock = 0;

  /** Feed one frame time; returns true when the scale changed. */
  tick(dt: number): boolean {
    if (!this.enabled) return false;
    this.acc += dt;
    this.frames++;
    this.lock -= dt;
    if (this.acc < 1.5) return false;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    const prev = this.scale;
    if (this.probeFps > 0) {
      // Did the last reduction help?
      if (fps < this.probeFps * 1.06) {
        this.scale = this.probeScale;
        this.lock = 30;
      }
      this.probeFps = 0;
    } else if (fps < this.target * 0.8 && this.scale > 0.5 && this.lock <= 0) {
      this.probeFps = fps;
      this.probeScale = this.scale;
      this.scale = Math.max(0.5, this.scale * 0.85);
    } else if (fps > this.target * 1.12 && this.scale < 1) {
      this.scale = Math.min(1, this.scale * 1.1);
    }
    return Math.abs(prev - this.scale) > 1e-3;
  }
}
