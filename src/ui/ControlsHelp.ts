// The controls line at the bottom left of the HUD, following what the player is doing. Text only: the key
// bindings themselves live in player/Input.ts, player/FlyMode.ts and vehicle/Driving.ts and are not changed here.

export type ControlsContext = 'walk' | 'walk-car' | 'walk-shop' | 'drive' | 'drive-stopped' | 'fly';

const k = (key: string, what: string) => `<b>${key}</b> ${what}`;
const line = (...items: string[]) => items.join(' &middot; ');

const WALK = [k('WASD', 'move'), k('Shift', 'run'), k('Space', 'jump'), k('Mouse', 'look'), k('Wheel', 'zoom'), k('M', 'map'), k('V', 'view'), k('P', 'OP mode'), k('Esc', 'pause')];
const DRIVE = [k('W', 'accelerate'), k('S', 'brake / reverse'), k('A D', 'steer'), k('Space', 'handbrake'), k('Mouse', 'look'), k('Wheel', 'zoom'), k('V', 'camera'), k('R', 'back to road'), k('P', 'OP mode'), k('Esc', 'pause')];
/** The E action of the moment comes first and is highlighted. */
const action = (what: string) => `<b class="ctx-action">E</b> ${what}`;

const TEXT: Record<ControlsContext, string> = {
  walk: line(...WALK),
  'walk-car': line(action('enter car'), ...WALK),
  'walk-shop': line(action('inspect shop'), ...WALK),
  drive: line(...DRIVE),
  'drive-stopped': line(action('exit car'), ...DRIVE),
  fly: line(k('WASD', 'fly'), k('Mouse', 'look'), k('Space', 'up'), k('Ctrl / C', 'down'), k('Shift', 'boost'), k('1-3', 'speed'), k('E', 'inspect'), k('R', 'reference'), k('K', 'screenshot'), k('P', 'exit OP mode'), k('Esc', 'free the mouse')),
};

export class ControlsHelp {
  context: ControlsContext | null = null;
  private el = document.getElementById('help')!;

  /** Cheap to call every frame: the DOM is only touched when the context changes. */
  set(context: ControlsContext): void {
    if (context === this.context) return;
    this.context = context;
    this.el.innerHTML = TEXT[context];
    this.el.dataset.context = context;
  }
}
