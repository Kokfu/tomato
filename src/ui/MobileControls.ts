import type { Input } from '../player/Input.ts';

/**
 * Touch controls: a virtual joystick (left), run / jump buttons (right) and drag-to-look on the
 * rest of the screen. All handlers call preventDefault so the page never scrolls or zooms.
 */
export class MobileControls {
  private input: Input;
  private joyId = -1;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private pinch = 0;
  private stick: HTMLElement;
  private joy: HTMLElement;

  constructor(input: Input, canvas: HTMLElement) {
    this.input = input;
    const root = document.getElementById('touch')!;
    root.classList.remove('hidden');
    this.joy = document.getElementById('joystick')!;
    this.stick = document.getElementById('stick')!;
    const opts = { passive: false } as AddEventListenerOptions;

    this.joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this.moveStick(t);
    }, opts);
    this.joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) this.moveStick(t);
    }, opts);
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) {
        this.joyId = -1;
        this.input.touchX = this.input.touchY = 0;
        this.stick.style.transform = '';
      }
    };
    this.joy.addEventListener('touchend', endJoy, opts);
    this.joy.addEventListener('touchcancel', endJoy, opts);

    const run = document.getElementById('btn-run')!;
    run.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // Tap toggles run so the thumb is free for looking around.
      this.input.touchRun = !this.input.touchRun;
      run.classList.toggle('active', this.input.touchRun);
    }, opts);
    const jump = document.getElementById('btn-jump')!;
    jump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.input.enabled) this.input.jump = true;
    }, opts);

    // Drag-to-look and pinch-to-zoom on the 3D canvas.
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2 && this.joyId < 0) {
        this.pinch = this.pinchDist(e);
      }
      if (this.lookId < 0) {
        const t = e.changedTouches[0];
        this.lookId = t.identifier;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }, opts);
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.input.enabled) return;
      const onCanvas = Array.from(e.touches).filter((t) => t.target === canvas);
      if (onCanvas.length >= 2) {
        const d = Math.hypot(onCanvas[0].clientX - onCanvas[1].clientX, onCanvas[0].clientY - onCanvas[1].clientY);
        if (this.pinch > 0) this.input.zoom += (this.pinch - d) * 0.02;
        this.pinch = d;
        return;
      }
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        this.input.lookYaw -= (t.clientX - this.lookX) * 0.0052;
        this.input.lookPitch -= (t.clientY - this.lookY) * 0.0052;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }, opts);
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.lookId) this.lookId = -1;
      this.pinch = 0;
    };
    canvas.addEventListener('touchend', endLook, opts);
    canvas.addEventListener('touchcancel', endLook, opts);
    // Block double-tap zoom / long-press menus over the HUD.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private pinchDist(e: TouchEvent): number {
    return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }

  private moveStick(t: Touch): void {
    const r = this.joy.getBoundingClientRect();
    const max = r.width / 2;
    let dx = t.clientX - (r.left + max), dy = t.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.stick.style.transform = `translate(${dx * 0.7}px, ${dy * 0.7}px)`;
    const dead = 0.12;
    const nx = dx / max, ny = -dy / max;
    const m = Math.hypot(nx, ny);
    this.input.touchX = m < dead ? 0 : nx;
    this.input.touchY = m < dead ? 0 : ny;
  }
}
