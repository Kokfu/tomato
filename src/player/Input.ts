// Unified input state fed by keyboard/mouse (desktop) and by MobileControls (touch).

/** Configurable key bindings (KeyboardEvent.code values). */
export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  map: ['KeyM'],
  view: ['KeyV'],
  interact: ['KeyE', 'Enter'],
  pause: ['Escape'],
  /** Driving only: put the car back on the last valid road position. */
  reset: ['KeyR'],
};
export type Action = keyof typeof KEY_BINDINGS;

export class Input {
  /** Movement intent in camera space: x = right, y = forward, each in [-1, 1]. */
  moveX = 0;
  moveY = 0;
  run = false;
  /** Set for one frame when jump is requested. */
  jump = false;
  /** Held state of the jump key (Space): the handbrake while driving. */
  handbrake = false;
  /** Accumulated look deltas (radians), consumed by the camera each frame. */
  lookYaw = 0;
  lookPitch = 0;
  zoom = 0;
  /** When false, gameplay input is ignored (menus, map). */
  enabled = false;
  /** Analogue values set by touch controls; override keyboard when non-zero. */
  touchX = 0;
  touchY = 0;
  touchRun = false;
  mouseSensitivity = 0.0024;

  private down = new Set<string>();
  private handlers = new Map<Action, (() => void)[]>();
  private dragging = false;
  private canvas: HTMLElement;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) {
          if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
          if (action === 'jump' && this.enabled) this.jump = true;
          this.handlers.get(action)?.forEach((h) => h());
        }
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 && document.pointerLockElement !== canvas) {
        this.dragging = true;
        // Pointer lock gives GTA-style free look; drag-look remains the fallback if it is refused.
        try {
          const p = (canvas as any).requestPointerLock?.();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch { /* ignored */ }
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || this.dragging) {
        this.lookYaw -= e.movementX * this.mouseSensitivity;
        this.lookPitch -= e.movementY * this.mouseSensitivity;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(action: Action, handler: () => void): void {
    if (!this.handlers.has(action)) this.handlers.set(action, []);
    this.handlers.get(action)!.push(handler);
  }

  private pressed(action: Action): boolean {
    for (const c of KEY_BINDINGS[action]) if (this.down.has(c)) return true;
    return false;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.dragging = false;
  }

  /** Refresh the per-frame movement intent. */
  poll(): void {
    if (!this.enabled) {
      this.moveX = this.moveY = 0;
      this.run = false;
      this.jump = false;
      this.handbrake = false;
      return;
    }
    let x = (this.pressed('right') ? 1 : 0) - (this.pressed('left') ? 1 : 0);
    let y = (this.pressed('forward') ? 1 : 0) - (this.pressed('back') ? 1 : 0);
    if (this.touchX !== 0 || this.touchY !== 0) {
      x = this.touchX;
      y = this.touchY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
    this.run = this.pressed('run') || this.touchRun;
    this.handbrake = this.pressed('jump');
  }

  /** Clear one-shot values at the end of a frame. */
  endFrame(): void {
    this.jump = false;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.zoom = 0;
  }
}
