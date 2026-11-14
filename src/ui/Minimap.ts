import { CHUNK_SIZE, QUANT } from '../world/config.ts';
import { ROAD_TYPES, ROAD_STYLE } from '../world/types.ts';
import type { WorldManager } from '../world/WorldManager.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import type { ThirdPersonCamera } from '../player/ThirdPersonCamera.ts';

export interface MinimapDeps {
  world: WorldManager;
  player: PlayerController;
  camera: ThirdPersonCamera;
  /** Called when the full map opens/closes so gameplay input can be suspended. */
  onFullMapToggle: (open: boolean) => void;
  /** Teleport the player back to the spawn point. */
  onResetLocation: () => void;
}

/**
 * Minimap drawn on a 2D canvas from the same chunk data that builds the 3D world (north-up).
 * This is the baseline implementation; see docs/ARCHITECTURE.md for the module contract.
 */
export class Minimap {
  private deps: MinimapDeps;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private acc = 1;
  /** Metres shown from the centre to the edge of the minimap. */
  range = 160;
  fullOpen = false;

  constructor(deps: MinimapDeps) {
    this.deps = deps;
    this.canvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    document.getElementById('minimap-wrap')!.addEventListener('click', () => this.toggleFullMap());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.range = Math.max(60, Math.min(600, this.range * (e.deltaY > 0 ? 1.2 : 0.83)));
    }, { passive: false });
  }

  toggleFullMap(): void {
    this.fullOpen = !this.fullOpen;
    const wrap = document.getElementById('minimap-wrap')!;
    wrap.style.cssText = this.fullOpen
      ? 'width:min(86vmin,720px);height:min(86vmin,720px);right:50%;top:50%;transform:translate(50%,-50%);border-radius:14px;z-index:16'
      : '';
    const s = this.fullOpen ? 720 : 200;
    this.canvas.width = this.canvas.height = s;
    this.range = this.fullOpen ? 520 : 160;
    this.acc = 1;
    this.deps.onFullMapToggle(this.fullOpen);
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < (this.fullOpen ? 0.2 : 0.1)) return;
    this.acc = 0;
    this.draw();
  }

  private draw(): void {
    const { world, player } = this.deps;
    const g = this.g, S = this.canvas.width, half = S / 2;
    const px = player.position.x, pz = player.position.z;
    const scale = half / this.range;
    g.fillStyle = '#c9c6b6';
    g.fillRect(0, 0, S, S);
    const c0x = Math.floor((px - this.range) / CHUNK_SIZE), c1x = Math.floor((px + this.range) / CHUNK_SIZE);
    const c0z = Math.floor((pz - this.range) / CHUNK_SIZE), c1z = Math.floor((pz + this.range) / CHUNK_SIZE);
    const chunks = [];
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const d = world.chunks.dataAt(cx, cz);
      if (d) chunks.push(d);
    }
    const path = (r: number[], ox: number, oz: number, close: boolean) => {
      for (let i = 0; i < r.length; i += 2) {
        const x = half + (ox + r[i] / QUANT - px) * scale, y = half + (oz + r[i + 1] / QUANT - pz) * scale;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      if (close) g.closePath();
    };
    // water
    g.fillStyle = '#7fb4c4';
    for (const d of chunks) {
      const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
      for (const poly of d.water) {
        g.beginPath();
        for (const r of poly) path(r, ox, oz, true);
        g.fill('evenodd');
      }
    }
    // roads
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) for (const d of chunks) {
      const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
      for (const r of d.roads) {
        const st = ROAD_STYLE[ROAD_TYPES[r.t]];
        if (st.group === 0) continue;
        if ((st.group >= 2) !== (pass === 1)) continue;
        g.strokeStyle = st.group >= 2 ? '#ffffff' : '#efe2c4';
        g.lineWidth = Math.max(1, (r.w / QUANT) * scale);
        g.beginPath();
        path(r.p, ox, oz, false);
        g.stroke();
      }
    }
    // buildings
    g.fillStyle = '#9d968a';
    for (const d of chunks) {
      const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
      g.beginPath();
      for (const b of d.buildings) path(b.r[0], ox, oz, true);
      g.fill();
    }
    // landmarks
    g.font = `${this.fullOpen ? 12 : 10}px system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const l of world.landmarks.landmarks) {
      const x = half + (l.x - px) * scale, y = half + (l.z - pz) * scale;
      if (x < 0 || y < 0 || x > S || y > S) continue;
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
      if (this.fullOpen || (l.priority ?? 3) <= 1) {
        g.fillStyle = '#1b2a33';
        g.fillText(l.name, x, y - 6);
      }
    }
    // player arrow (heading 0 = +Z = south on the map)
    g.save();
    g.translate(half, half);
    g.rotate(Math.PI - player.heading);
    g.fillStyle = '#f2c14e';
    g.strokeStyle = '#1b2a33';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
