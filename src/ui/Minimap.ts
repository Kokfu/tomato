import '../styles/map.css';
import { CHUNK_SIZE, DATA_ROOT } from '../world/config.ts';
import type { ChunkData, Landmark } from '../world/types.ts';
import type { WorldManager } from '../world/WorldManager.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import type { ThirdPersonCamera } from '../player/ThirdPersonCamera.ts';
import { worldToGeo, worldDirToBearing } from '../world/GeoProjection.ts';
import { MAP_COLORS, Overview, drawChunks, drawLabel, drawMarker, drawPlayer, drawRoute, landmarkColor } from './MapDraw.ts';
import type { OverviewFile } from './MapDraw.ts';
import { compassPoint, describeManeuver, formatDistance, formatDuration, loadRouteGraph, progressOnRoute, WALK_SPEED } from './Router.ts';
import type { Route, RouteGraph } from './Router.ts';

export interface MinimapDeps {
  world: WorldManager;
  player: PlayerController;
  camera: ThirdPersonCamera;
  /** Called when the full map opens/closes so gameplay input can be suspended. */
  onFullMapToggle: (open: boolean) => void;
  /** Teleport the player back to the spawn point. */
  onResetLocation: () => void;
}

/** Outcome of a route request. `route` is null when no mapped walking connection exists. */
export interface NavState {
  target: Landmark;
  route: Route | null;
  /** Which off-network connector segments are safe to draw (clear of water and buildings). */
  connectorOk: boolean[];
  arrivedAt: number;
}

const MIN_RANGE = 50, MAX_RANGE = 700;
const FULL_MAX_SCALE = 6;
/** Below this CSS-pixel-per-metre scale the full map shows the overview only. */
const DETAIL_MIN_SCALE = 0.3;
const STORE_KEY = 'k3d.minimap';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(cls: string, text: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    b.blur(); // keep Space / Enter for the game, not for re-pressing the button
  });
  return b;
}
function formatGeo(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
}
const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');

/**
 * In-game map and navigation: the round minimap (always visible), the full map (M / map button /
 * tapping the minimap), landmark selection and walking routes. Drawn on 2D canvases from the same
 * generated data that builds the 3D world; static layers are cached in offscreen canvases.
 */
export class Minimap {
  private deps: MinimapDeps;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private wrap: HTMLElement;
  private compass: HTMLElement;
  private acc = 1;
  private dpr = 1;
  /** Metres shown from the centre to the edge of the minimap. */
  range = 160;
  /** False = north-up, true = rotate with the camera so "ahead" is up. */
  headingUp = false;
  fullOpen = false;

  // Minimap static layer (north-up, larger than the visible disc so it survives movement + rotation).
  private mmCache = document.createElement('canvas');
  private mmCacheG = this.mmCache.getContext('2d')!;
  private mmCacheX = 0;
  private mmCacheZ = 0;
  private mmCacheScale = 0;
  private mmCacheSig = '';
  private modeBtn!: HTMLButtonElement;

  // Full map
  private overview: Overview | null = null;
  private overviewPromise: Promise<Overview | null> | null = null;
  private full!: HTMLElement;
  private fmCanvas!: HTMLCanvasElement;
  private fmG!: CanvasRenderingContext2D;
  private fmStatic = document.createElement('canvas');
  private fmStaticG = this.fmStatic.getContext('2d')!;
  private fmStaticDirty = true;
  private fmOverlayDirty = true;
  private fmSig = '';
  private fmSigAcc = 0;
  /** Full-map view: world position at the centre of the screen and CSS pixels per metre. */
  fullView = { x: 0, z: 0, scale: 0.8 };
  private coordsYou!: HTMLElement;
  private coordsCursor!: HTMLElement;
  private listEl!: HTMLElement;
  private listItems!: HTMLElement;
  private listBtn!: HTMLButtonElement;
  private infoEl!: HTMLElement;
  private scaleEl!: HTMLElement;
  private listOpen = false;

  // Selection + navigation
  selected: Landmark | null = null;
  nav: NavState | null = null;
  private routeBusy = false;
  private routeNote = '';
  private graph: RouteGraph | null = null;
  private navEl!: HTMLElement;
  private navArrow!: SVGElement;
  private navMain!: HTMLElement;
  private navSub!: HTMLElement;
  private navAcc = 0;
  private offRoute = 0;
  private connTick = 0;
  private aim: [number, number] | null = null;

  constructor(deps: MinimapDeps) {
    this.deps = deps;
    this.canvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.wrap = document.getElementById('minimap-wrap')!;
    this.compass = document.getElementById('compass')!;
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
      if (typeof s.range === 'number') this.range = Math.max(MIN_RANGE, Math.min(MAX_RANGE, s.range));
      this.headingUp = s.headingUp === true;
    } catch { /* storage unavailable: defaults */ }

    this.wrap.title = 'Open map (M)';
    this.wrap.addEventListener('click', () => { if (!this.fullOpen) this.toggleFullMap(); });
    this.wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMinimap(e.deltaY > 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });
    this.buildMinimapControls();
    this.buildNavHint();
    this.buildFullMap();
    this.resizeMinimap();
    new ResizeObserver(() => this.resizeMinimap()).observe(this.wrap);
    window.addEventListener('resize', () => { this.resizeMinimap(); this.resizeFull(); });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // -------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------

  toggleFullMap(): void {
    this.fullOpen = !this.fullOpen;
    this.full.classList.toggle('hidden', !this.fullOpen);
    if (this.fullOpen) {
      const p = this.deps.player.position;
      this.fullView.x = p.x;
      this.fullView.z = p.z;
      this.fullView.scale = 0.8;
      this.setListOpen(window.innerWidth > 720 && window.innerHeight > 520);
      this.resizeFull();
      this.rebuildList();
      this.renderInfo();
      this.loadOverview();
      if (this.nav?.route) this.fitRoute(this.nav.route);
      this.fmStaticDirty = true;
    }
    this.acc = 1;
    this.deps.onFullMapToggle(this.fullOpen);
  }

  /** Multiply the minimap range (factor > 1 zooms out). */
  zoomMinimap(factor: number): void {
    this.range = Math.max(MIN_RANGE, Math.min(MAX_RANGE, this.range * factor));
    this.acc = 1;
    this.save();
  }

  setHeadingUp(on: boolean): void {
    this.headingUp = on;
    this.modeBtn.textContent = on ? '▲' : 'N';
    this.modeBtn.title = on ? 'Minimap: heading-up (tap for north-up)' : 'Minimap: north-up (tap for heading-up)';
    this.modeBtn.classList.toggle('on', on);
    this.acc = 1;
    this.save();
  }

  /** Zoom the full map by `factor` about a screen point (CSS pixels; default the centre). */
  zoomFull(factor: number, sx?: number, sy?: number): void {
    const v = this.fullView, w = this.fmCanvas.clientWidth, hgt = this.fmCanvas.clientHeight;
    const cx = sx ?? w / 2, cy = sy ?? hgt / 2;
    const wx = v.x + (cx - w / 2) / v.scale, wz = v.z + (cy - hgt / 2) / v.scale;
    v.scale = Math.max(this.minFullScale(), Math.min(FULL_MAX_SCALE, v.scale * factor));
    v.x = wx - (cx - w / 2) / v.scale;
    v.z = wz - (cy - hgt / 2) / v.scale;
    this.clampFull();
  }

  centreOnPlayer(): void {
    const p = this.deps.player.position;
    this.fullView.x = p.x;
    this.fullView.z = p.z;
    if (this.fullView.scale < 0.6) this.fullView.scale = 0.8;
    this.clampFull();
  }

  /** Select a landmark (by id or object) and show its details; null clears the selection. */
  selectLandmark(l: Landmark | string | null, reveal = true): void {
    const lm = typeof l === 'string' ? this.deps.world.landmarks.landmarks.find((x) => x.id === l) ?? null : l;
    this.selected = lm;
    this.routeNote = '';
    if (lm && reveal && this.fullOpen) this.reveal(lm.x, lm.z);
    this.renderInfo();
    this.markList();
    this.fmOverlayDirty = true;
  }

  /**
   * Compute a walking route from the player to a landmark and make it the active navigation
   * target. Resolves to the navigation state; its `route` is null when no mapped walking
   * connection exists (the HUD then shows straight-line distance and bearing instead).
   */
  async routeTo(l: Landmark | string): Promise<NavState | null> {
    const lm = typeof l === 'string' ? this.deps.world.landmarks.landmarks.find((x) => x.id === l) : l;
    if (!lm || this.routeBusy) return null;
    this.routeBusy = true;
    this.routeNote = '';
    this.renderInfo();
    try {
      const [graph] = await Promise.all([loadRouteGraph(`${import.meta.env.BASE_URL}${DATA_ROOT}/graph.json`), this.loadOverview()]);
      this.graph = graph;
      this.nav = { target: lm, route: null, connectorOk: [], arrivedAt: 0 };
      this.computeRoute();
      this.routeBusy = false;
      this.renderInfo(); // the card's final height feeds the route framing
      if (this.nav.route && this.fullOpen) this.fitRoute(this.nav.route);
    } catch (e) {
      console.warn('Routing data unavailable:', e);
      this.routeNote = 'Routing data could not be loaded.';
      this.nav = null;
    }
    this.routeBusy = false;
    this.offRoute = 0;
    this.navAcc = 1;
    this.acc = 1;
    this.renderInfo();
    this.fmOverlayDirty = true;
    return this.nav;
  }

  clearRoute(): void {
    this.nav = null;
    this.aim = null;
    this.routeNote = '';
    this.navEl.classList.add('hidden');
    this.renderInfo();
    this.fmOverlayDirty = true;
    this.acc = 1;
  }

  update(dt: number): void {
    this.navAcc += dt;
    if (this.nav && this.navAcc >= 0.25) {
      this.navAcc = 0;
      this.updateNav();
    }
    if (this.fullOpen) {
      this.updateFull(dt);
      return;
    }
    this.acc += dt;
    if (this.acc < 0.066) return;
    this.acc = 0;
    this.drawMinimap();
  }

  // -------------------------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------------------------

  private save(): void {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ range: Math.round(this.range), headingUp: this.headingUp })); } catch { /* ignore */ }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.fullOpen) {
      if (e.key === '+' || e.key === '=') this.zoomFull(1.4);
      else if (e.key === '-' || e.key === '_') this.zoomFull(1 / 1.4);
    } else if (e.code === 'KeyX' && this.nav && !this.navEl.classList.contains('hidden')) {
      this.clearRoute();
    }
  }

  private loadOverview(): Promise<Overview | null> {
    if (!this.overviewPromise) {
      this.overviewPromise = fetch(`${import.meta.env.BASE_URL}${DATA_ROOT}/overview.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OverviewFile>;
        })
        .then((f) => {
          this.overview = new Overview(f);
          this.fmStaticDirty = true;
          this.mmCacheSig = '';
          return this.overview;
        })
        .catch((e) => {
          console.warn('Map overview unavailable:', e);
          this.overviewPromise = null;
          return null;
        });
    }
    return this.overviewPromise;
  }

  /** Loaded chunks intersecting a world rectangle, plus a signature that changes when the set changes. */
  private chunksIn(x0: number, z0: number, x1: number, z1: number): { list: ChunkData[]; sig: string } {
    const list: ChunkData[] = [];
    let sig = '';
    const { chunks } = this.deps.world;
    for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
        const d = chunks.dataAt(cx, cz);
        if (d) { list.push(d); sig += `${cx},${cz};`; }
      }
    }
    return { list, sig };
  }

  private bounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    if (this.overview) return this.overview.bounds;
    const hm = this.deps.world.manifest.height;
    return { minX: hm.x0, minZ: hm.z0, maxX: hm.x0 + (hm.nx - 1) * hm.cell, maxZ: hm.z0 + (hm.nz - 1) * hm.cell };
  }

  /** Paint land, overview and detailed chunks. The transform (world metres -> pixels) must be set. */
  private paintStatic(g: CanvasRenderingContext2D, pxPerM: number, chunks: ChunkData[]): void {
    const b = this.bounds();
    g.fillStyle = MAP_COLORS.land;
    g.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    g.save();
    g.beginPath();
    g.rect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    g.clip(); // nothing is drawn outside the prepared area
    if (this.overview) this.overview.draw(g, pxPerM, this.dpr);
    if (chunks.length) drawChunks(g, chunks, pxPerM, this.dpr);
    g.restore();
  }

  // -------------------------------------------------------------------------------------------
  // Minimap
  // -------------------------------------------------------------------------------------------

  private buildMinimapControls(): void {
    const ctl = h('div');
    ctl.id = 'minimap-ctl';
    ctl.append(
      button('mm-in', '+', 'Zoom minimap in', () => this.zoomMinimap(1 / 1.35)),
      button('mm-out', '−', 'Zoom minimap out', () => this.zoomMinimap(1.35)),
      (this.modeBtn = button('mm-mode', 'N', '', () => this.setHeadingUp(!this.headingUp))),
    );
    // Touch-look handlers live on the scene canvas; keep taps on these buttons from reaching anything else.
    ctl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.wrap.insertAdjacentElement('afterend', ctl);
    this.setHeadingUp(this.headingUp);
  }

  private resizeMinimap(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = this.wrap.clientWidth || 180;
    const s = Math.round(css * this.dpr);
    if (this.canvas.width !== s) {
      this.canvas.width = this.canvas.height = s;
      this.mmCacheSig = '';
      this.acc = 1;
    }
  }

  private renderMinimapCache(px: number, pz: number, scale: number): void {
    const R = this.canvas.width / 2;
    const P = Math.round(R * 3);
    if (this.mmCache.width !== P) this.mmCache.width = this.mmCache.height = P;
    const g = this.mmCacheG;
    const reach = P / 2 / scale;
    const { list } = this.chunksIn(px - reach, pz - reach, px + reach, pz + reach);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = MAP_COLORS.outside;
    g.fillRect(0, 0, P, P);
    g.setTransform(scale, 0, 0, scale, P / 2 - px * scale, P / 2 - pz * scale);
    this.paintStatic(g, scale, list);
    this.mmCacheX = px;
    this.mmCacheZ = pz;
    this.mmCacheScale = scale;
  }

  private drawMinimap(): void {
    const { world, player, camera } = this.deps;
    const g = this.g, S = this.canvas.width, R = S / 2, dpr = this.dpr;
    if (!S) return;
    const px = player.position.x, pz = player.position.z;
    const scale = R / this.range; // device pixels per metre
    const P = R * 3;
    // Re-render the static layer when the player nears its edge, the zoom changes or chunks arrive.
    const reach = P / 2 / scale;
    const sig = `${this.chunksIn(px - reach, pz - reach, px + reach, pz + reach).sig}|${this.overview ? 1 : 0}`;
    const drift = Math.hypot(px - this.mmCacheX, pz - this.mmCacheZ) * scale;
    if (scale !== this.mmCacheScale || sig !== this.mmCacheSig || drift > R * 0.45) {
      this.renderMinimapCache(px, pz, scale);
      this.mmCacheSig = sig;
    }
    const rot = this.headingUp ? camera.yaw : 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = (x - px) * scale, dz = (z - pz) * scale;
      return [R + dx * cos - dz * sin, R + dx * sin + dz * cos];
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = MAP_COLORS.outside;
    g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(rot);
    g.drawImage(this.mmCache, (this.mmCacheX - px) * scale - P / 2, (this.mmCacheZ - pz) * scale - P / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);

    const nav = this.nav;
    if (nav?.route) drawRoute(g, nav.route, toScreen, 4 * dpr, (i) => nav.connectorOk[i] === true);

    // Landmarks
    g.font = `600 ${10 * dpr}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineWidth = 3 * dpr;
    const focus = nav?.target ?? this.selected;
    for (const l of world.landmarks.landmarks) {
      const [x, y] = toScreen(l.x, l.z);
      const d = Math.hypot(x - R, y - R);
      if (d > R + 6 * dpr) continue;
      drawMarker(g, x, y, (l === focus ? 4.5 : 3.5) * dpr, landmarkColor(l), l === focus);
      if (d < R * 0.8 && (l === focus || (l.priority ?? 3) <= 1)) drawLabel(g, l.name.length > 22 ? `${l.name.slice(0, 21)}…` : l.name, x, y - 7 * dpr);
    }
    // Destination outside the disc: a pointer on the rim.
    if (focus) {
      const [x, y] = toScreen(focus.x, focus.z);
      const d = Math.hypot(x - R, y - R);
      if (d > R - 8 * dpr) {
        const ux = (x - R) / d, uy = (y - R) / d, rr = R - 9 * dpr;
        g.save();
        g.translate(R + ux * rr, R + uy * rr);
        g.rotate(Math.atan2(uy, ux) + Math.PI / 2);
        g.fillStyle = nav ? MAP_COLORS.route : landmarkColor(focus);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.moveTo(0, -7 * dpr);
        g.lineTo(6 * dpr, 5 * dpr);
        g.lineTo(-6 * dpr, 5 * dpr);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }
    }
    // Player arrow: heading 0 faces +Z (south), i.e. screen-down on a north-up map.
    drawPlayer(g, R, R, Math.PI - player.heading + rot, 9 * dpr);

    // North indicator rides the rim when the map rotates.
    const nx = Math.sin(rot), ny = -Math.cos(rot);
    const k = 0.5 - 9 / (S / dpr);
    this.compass.style.left = `${(50 + nx * k * 100).toFixed(1)}%`;
    this.compass.style.top = `${(50 + ny * k * 100).toFixed(1)}%`;
    this.compass.style.transform = 'translate(-50%, -50%)';
  }

  // -------------------------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------------------------

  private buildNavHint(): void {
    const el = (this.navEl = h('div', 'panel hidden'));
    el.id = 'nav-hint';
    const arrow = h('div', 'nav-arrow');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 16-7-4-7 4z" fill="#fff"/></svg>';
    this.navArrow = arrow.firstElementChild as SVGElement;
    const text = h('div', 'nav-text');
    text.append((this.navMain = h('div', 'nav-main')), (this.navSub = h('div', 'nav-sub')));
    el.append(arrow, text, button('nav-clear', '✕', 'Clear route (X)', () => this.clearRoute()));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('hud')!.append(el);
  }

  /** Connector test for snapping: a straight hop between a point and the network must not cross water. */
  private connectorBlocked = (x0: number, z0: number, x1: number, z1: number): boolean => {
    const ov = this.overview;
    if (!ov) return false;
    const len = Math.hypot(x1 - x0, z1 - z0);
    // A point that is itself over water (standing on a bridge deck) may only hop a short way.
    if (ov.inWater(x0, z0)) return len > 15;
    const n = Math.max(2, Math.ceil(len / 4));
    for (let i = 1; i < n; i++) if (ov.inWater(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)) return true;
    return false;
  };

  /** A connector is drawn only when it is known to be clear of water and solid buildings. */
  private connectorClear(x0: number, z0: number, x1: number, z1: number): boolean {
    const { world } = this.deps;
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      if (!world.chunks.dataAt(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) return false; // unknown: do not draw
      if (world.collision.inWater(x, z) || world.collision.insideBuilding(x, z, world.height.sample(x, z) + 0.5)) return false;
    }
    return true;
  }

  private checkConnectors(): void {
    const nav = this.nav;
    if (!nav?.route) return;
    const r = nav.route;
    nav.connectorOk = r.segEdge.map((e, i) => e < 0 && this.connectorClear(r.points[i * 2], r.points[i * 2 + 1], r.points[i * 2 + 2], r.points[i * 2 + 3]));
  }

  private computeRoute(): void {
    const nav = this.nav;
    if (!nav || !this.graph) return;
    const p = this.deps.player.position;
    nav.route = this.graph.route(p.x, p.z, nav.target.x, nav.target.z, { blocked: this.connectorBlocked });
    this.checkConnectors();
    this.fmOverlayDirty = true;
  }

  private updateNav(): void {
    const nav = this.nav;
    if (!nav) return;
    const { player, camera } = this.deps;
    const px = player.position.x, pz = player.position.z;
    const t = nav.target;
    const direct = Math.hypot(t.x - px, t.z - pz);
    let main: string, sub: string;
    this.aim = [t.x, t.z];
    if (nav.arrivedAt) {
      if (performance.now() - nav.arrivedAt > 5000) { this.clearRoute(); return; }
      main = `Arrived: ${t.name}`;
      sub = `${formatDistance(direct)} away`;
    } else if (nav.route) {
      const r = nav.route;
      let prog = progressOnRoute(r, px, pz);
      // Wandered off the route: plan again from where the player is now.
      this.offRoute = prog.off > 30 ? this.offRoute + 1 : 0;
      if (this.offRoute >= 6 && !this.fullOpen) {
        this.offRoute = 0;
        this.computeRoute();
        this.renderInfo();
        if (!nav.route) return this.updateNav();
        prog = progressOnRoute(nav.route, px, pz);
      }
      const route = nav.route!;
      const remaining = Math.max(0, route.length - prog.along);
      if (remaining < 12 || direct < 8) {
        nav.arrivedAt = performance.now();
        return this.updateNav();
      }
      // Aim a little way ahead along the route.
      const ahead = Math.min(route.length, prog.along + 14);
      let i = prog.seg;
      while (i < route.segEdge.length - 1 && route.cum[i + 1] < ahead) i++;
      const sl = route.cum[i + 1] - route.cum[i], f = sl > 0 ? Math.max(0, Math.min(1, (ahead - route.cum[i]) / sl)) : 1;
      this.aim = [route.points[i * 2] + (route.points[i * 2 + 2] - route.points[i * 2]) * f, route.points[i * 2 + 1] + (route.points[i * 2 + 3] - route.points[i * 2 + 1]) * f];
      const next = route.maneuvers.find((m) => m.kind !== 'depart' && m.at > prog.along + 2) ?? route.maneuvers[route.maneuvers.length - 1];
      const depart = route.maneuvers[0];
      const eta = `${formatDistance(remaining)} · ${formatDuration(remaining / WALK_SPEED)}`;
      if (prog.off > 12) {
        main = 'Walk to the highlighted route';
        sub = `${formatDistance(prog.off)} away · ${eta}`;
      } else if (depart.kind === 'depart' && prog.along < depart.at + 20 && next.at - prog.along > 25) {
        const dir = compassPoint(worldDirToBearing(this.aim[0] - px, this.aim[1] - pz));
        main = `Head ${dir}${depart.name ? ` on ${depart.name}` : ''}`;
        sub = `${eta} to ${t.name}`;
      } else if (next.kind === 'arrive') {
        main = `${t.name}`;
        sub = `${eta} · straight on`;
      } else {
        main = `${formatDistance(next.at - prog.along)}: ${describeManeuver(next, t.name)}`;
        sub = `${eta} to ${t.name}`;
      }
      if (++this.connTick % 8 === 0) this.checkConnectors(); // chunks near the ends may have loaded since
    } else {
      if (direct < 10) {
        nav.arrivedAt = performance.now();
        return this.updateNav();
      }
      const b = worldDirToBearing(t.x - px, t.z - pz);
      main = `${t.name}: no mapped walking route`;
      sub = `Straight line ${formatDistance(direct)} · ${pad3(b)}° ${compassPoint(b)}`;
    }
    if (this.navMain.textContent !== main) this.navMain.textContent = main;
    if (this.navSub.textContent !== sub) this.navSub.textContent = sub;
    this.navEl.classList.toggle('nav-off', !nav.route);
    this.navEl.classList.remove('hidden');
    // Arrow: direction to walk relative to where the camera is looking.
    let rel = worldDirToBearing(this.aim[0] - px, this.aim[1] - pz) - worldDirToBearing(-Math.sin(camera.yaw), -Math.cos(camera.yaw));
    rel = ((rel + 540) % 360) - 180;
    this.navArrow.style.transform = `rotate(${rel.toFixed(0)}deg)`;
  }

  // -------------------------------------------------------------------------------------------
  // Full map
  // -------------------------------------------------------------------------------------------

  private buildFullMap(): void {
    const root = (this.full = h('div', 'hidden'));
    root.id = 'fullmap';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Map of Kuching');
    this.fmCanvas = h('canvas');
    this.fmG = this.fmCanvas.getContext('2d')!;

    const top = h('div', 'fm-panel fm-top');
    const coords = h('div', 'fm-coords');
    coords.append((this.coordsYou = h('div')), (this.coordsCursor = h('div')));
    const actions = h('div', 'fm-actions');
    actions.append(
      (this.listBtn = button('fm-btn fm-list-btn', 'Landmarks', 'Show or hide the landmark list', () => this.setListOpen(!this.listOpen))),
      button('fm-btn fm-centre', 'Centre on me', 'Centre the map on your position', () => this.centreOnPlayer()),
      button('fm-btn fm-reset', 'Return to Waterfront', 'Teleport back to the Kuching Waterfront start point', () => {
        this.deps.onResetLocation();
        this.centreOnPlayer();
        this.rebuildList();
        this.renderInfo();
        if (this.nav && !this.nav.arrivedAt) this.computeRoute();
      }),
    );
    top.append(h('div', 'fm-title', 'Kuching'), coords, actions, button('fm-btn fm-icon fm-close', '✕', 'Close map (M or Esc)', () => this.toggleFullMap()));

    const zoom = h('div', 'fm-panel fm-zoom');
    zoom.append(
      button('fm-btn fm-icon fm-zoom-in', '+', 'Zoom in', () => this.zoomFull(1.6)),
      button('fm-btn fm-icon fm-zoom-out', '−', 'Zoom out', () => this.zoomFull(1 / 1.6)),
      button('fm-btn fm-icon fm-locate', '◎', 'Centre on me', () => this.centreOnPlayer()),
    );

    this.listEl = h('div', 'fm-panel fm-list');
    const head = h('div', 'fm-list-head', 'Landmarks');
    head.append(h('span', '', 'nearest first'));
    this.listItems = h('div', 'fm-list-items');
    this.listEl.append(head, this.listItems);
    this.listItems.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('.fm-item');
      if (!item) return;
      this.selectLandmark(item.dataset.id!);
      if (window.innerWidth <= 720 || window.innerHeight <= 520) this.setListOpen(false);
    });
    // Let the list scroll with the wheel / a finger without panning the map underneath.
    for (const type of ['wheel', 'pointerdown', 'touchmove'] as const) this.listEl.addEventListener(type, (e) => e.stopPropagation(), { passive: true });

    this.infoEl = h('div', 'fm-panel fm-info hidden');
    this.scaleEl = h('div', 'fm-scale');
    const attrib = h('div', 'fm-attrib', '© OpenStreetMap contributors');
    root.append(this.fmCanvas, this.scaleEl, attrib, zoom, this.listEl, this.infoEl, top);
    document.body.append(root);
    this.bindFullMapInput();
  }

  private setListOpen(open: boolean): void {
    this.listOpen = open;
    this.listEl.classList.toggle('hidden', !open);
    this.listBtn.classList.toggle('on', open);
    this.full.classList.toggle('no-list', !open);
  }

  private rebuildList(): void {
    const p = this.deps.player.position;
    const items = this.deps.world.landmarks.landmarks
      .map((l) => ({ l, d: Math.hypot(l.x - p.x, l.z - p.z) }))
      .sort((a, b) => a.d - b.d);
    this.listItems.textContent = '';
    for (const { l, d } of items) {
      const b = h('button', 'fm-item');
      b.type = 'button';
      b.dataset.id = l.id;
      const dot = h('span', 'fm-dot');
      dot.style.background = landmarkColor(l);
      b.append(dot, h('span', 'fm-item-name', l.name), h('span', 'fm-item-dist', formatDistance(d)));
      b.title = l.name;
      this.listItems.append(b);
    }
    this.markList();
  }

  private markList(): void {
    for (const el of Array.from(this.listItems.children) as HTMLElement[]) el.classList.toggle('sel', el.dataset.id === this.selected?.id);
  }

  private renderInfo(): void {
    const l = this.selected, el = this.infoEl;
    this.full.classList.toggle('has-info', !!l);
    el.classList.toggle('hidden', !l);
    el.textContent = '';
    if (!l) return;
    const p = this.deps.player.position;
    const dist = Math.hypot(l.x - p.x, l.z - p.z);
    const bearing = worldDirToBearing(l.x - p.x, l.z - p.z);
    const head = h('div', 'fm-info-head');
    head.append(h('div', 'fm-info-name', l.name), button('fm-info-close', '✕', 'Close details', () => this.selectLandmark(null)));
    const rows = h('div', 'fm-info-rows');
    const row = (label: string, value: string, cls: string) => {
      const d = h('div', cls);
      d.append(h('span', '', `${label} `), document.createTextNode(value));
      rows.append(d);
    };
    row('Position', formatGeo(l.lat, l.lon), 'fm-info-geo');
    row('Straight line', `${formatDistance(dist)} from you`, 'fm-info-dist');
    row('Bearing', `${pad3(bearing)}° (${compassPoint(bearing)})`, 'fm-info-bearing');
    el.append(head, h('div', 'fm-info-kind', l.kind), rows);

    const isTarget = this.nav?.target === l;
    if (this.routeBusy) el.append(h('div', 'fm-route', 'Finding a walking route…'));
    else if (this.routeNote) el.append(h('div', 'fm-route none', this.routeNote));
    else if (isTarget && this.nav!.route) {
      const r = this.nav!.route;
      const box = h('div', 'fm-route');
      const b = h('b', '', `Walking route ${formatDistance(r.length)}`);
      box.append(b, document.createTextNode(` · about ${formatDuration(r.seconds)}`));
      const bridges = [...new Set(r.maneuvers.filter((m) => m.kind === 'bridge').map((m) => m.name ?? 'a mapped bridge'))];
      if (bridges.length) box.append(h('div', '', `Crosses the river via ${bridges.join(', ')}`));
      el.append(box);
    } else if (isTarget) {
      el.append(h('div', 'fm-route none', `No mapped walking connection from here. Straight line ${formatDistance(dist)}, bearing ${pad3(bearing)}° ${compassPoint(bearing)}.`));
    }
    const btns = h('div', 'fm-info-btns');
    const routeBtn = button('fm-btn primary fm-route-btn', isTarget ? 'Re-route' : 'Route', 'Walking route from your position', () => void this.routeTo(l));
    routeBtn.disabled = this.routeBusy;
    btns.append(routeBtn);
    if (this.nav) btns.append(button('fm-btn fm-clear-btn', 'Clear route', 'Remove the active route', () => this.clearRoute()));
    btns.append(button('fm-btn fm-show-btn', 'Show', 'Centre the map on this landmark', () => {
      this.fullView.x = l.x;
      this.fullView.z = l.z;
      if (this.fullView.scale < 1.2) this.fullView.scale = 1.2;
      this.clampFull();
    }));
    el.append(btns);
  }

  private minFullScale(): number {
    const b = this.bounds();
    const w = this.fmCanvas.clientWidth || window.innerWidth, hgt = this.fmCanvas.clientHeight || window.innerHeight;
    return Math.min(w / (b.maxX - b.minX), hgt / (b.maxZ - b.minZ)) * 0.85;
  }

  private clampFull(): void {
    const b = this.bounds(), v = this.fullView;
    v.scale = Math.max(this.minFullScale(), Math.min(FULL_MAX_SCALE, v.scale));
    v.x = Math.max(b.minX, Math.min(b.maxX, v.x));
    v.z = Math.max(b.minZ, Math.min(b.maxZ, v.z));
    this.fmStaticDirty = true;
  }

  /** Pan (only if needed) so a world point is comfortably inside the visible map area. */
  private reveal(x: number, z: number): void {
    const v = this.fullView, w = this.fmCanvas.clientWidth, hgt = this.fmCanvas.clientHeight;
    const sx = w / 2 + (x - v.x) * v.scale, sy = hgt / 2 + (z - v.z) * v.scale;
    const small = w <= 720 || hgt <= 520;
    const left = !small && this.listOpen ? 310 : 30, top = small ? 130 : 90, bottom = small ? 260 : 60;
    if (sx < left || sx > w - 70 || sy < top || sy > hgt - bottom) {
      // Centre it in the part of the screen not covered by panels.
      v.x = x - ((left + (w - 70)) / 2 - w / 2) / v.scale;
      v.z = z - ((top + (hgt - bottom)) / 2 - hgt / 2) / v.scale;
      this.clampFull();
    }
  }

  private fitRoute(r: Route): void {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < r.points.length; i += 2) {
      x0 = Math.min(x0, r.points[i]); x1 = Math.max(x1, r.points[i]); z0 = Math.min(z0, r.points[i + 1]); z1 = Math.max(z1, r.points[i + 1]);
    }
    const w = this.fmCanvas.clientWidth, hgt = this.fmCanvas.clientHeight;
    const small = w <= 720 || hgt <= 520;
    // Keep the route clear of the top bar, the landmark list and the details card.
    const card = this.selected ? this.infoEl.offsetHeight + 50 : 60;
    const left = !small && this.listOpen ? 310 : 30, right = 70, top = small ? 130 : 90, bottom = Math.min(hgt * 0.5, card);
    const aw = Math.max(80, w - left - right), ah = Math.max(80, hgt - top - bottom);
    const v = this.fullView;
    v.scale = Math.min(2.5, aw / Math.max(40, x1 - x0), ah / Math.max(40, z1 - z0)) * 0.9;
    v.scale = Math.max(this.minFullScale(), v.scale);
    v.x = (x0 + x1) / 2 - ((left + (w - right)) / 2 - w / 2) / v.scale;
    v.z = (z0 + z1) / 2 - ((top + (hgt - bottom)) / 2 - hgt / 2) / v.scale;
    this.clampFull();
  }

  private resizeFull(): void {
    if (!this.fullOpen) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.fmCanvas.clientWidth * this.dpr), hgt = Math.round(this.fmCanvas.clientHeight * this.dpr);
    if (!w || !hgt) return;
    if (this.fmCanvas.width !== w || this.fmCanvas.height !== hgt) {
      this.fmCanvas.width = this.fmStatic.width = w;
      this.fmCanvas.height = this.fmStatic.height = hgt;
    }
    this.clampFull();
  }

  private bindFullMapInput(): void {
    const c = this.fmCanvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; vx: number; vz: number; moved: boolean } | null = null;
    let pinch: { dist: number; scale: number; wx: number; wz: number } | null = null;
    const local = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const v = this.fullView;
      return [v.x + (sx - c.clientWidth / 2) / v.scale, v.z + (sy - c.clientHeight / 2) / v.scale];
    };
    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      const [wx, wz] = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), scale: this.fullView.scale, wx, wz };
      drag = null;
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const [x, y] = local(e);
      pointers.set(e.pointerId, { x, y });
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      if (pointers.size === 1) drag = { x, y, vx: this.fullView.x, vz: this.fullView.z, moved: false };
      else if (pointers.size === 2) startPinch();
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') {
          const [wx, wz] = toWorld(x, y);
          const [lat, lon] = worldToGeo(wx, wz);
          this.coordsCursor.textContent = `Cursor ${formatGeo(lat, lon)}`;
        }
        return;
      }
      p.x = x; p.y = y;
      const v = this.fullView;
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        v.scale = Math.max(this.minFullScale(), Math.min(FULL_MAX_SCALE, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
        v.x = pinch.wx - (mx - c.clientWidth / 2) / v.scale;
        v.z = pinch.wz - (my - c.clientHeight / 2) / v.scale;
        this.clampFull();
      } else if (drag) {
        const dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 4 : 9)) { drag.moved = true; c.classList.add('dragging'); }
        if (drag.moved) {
          v.x = drag.vx - dx / v.scale;
          v.z = drag.vz - dy / v.scale;
          this.clampFull();
        }
      }
    });
    const end = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      c.classList.remove('dragging');
      if (pinch) {
        pinch = null;
        // Continue panning with the finger that stays down; never treat the end of a pinch as a tap.
        const rest = [...pointers.values()][0];
        drag = rest ? { x: rest.x, y: rest.y, vx: this.fullView.x, vz: this.fullView.z, moved: true } : null;
        return;
      }
      if (drag && !drag.moved && e.type === 'pointerup') {
        const [x, y] = local(e);
        this.tapFull(x, y, e.pointerType === 'mouse' ? 14 : 24);
      }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = local(e);
      this.zoomFull(Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0028), x, y);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Tap / click on the full map: select the nearest landmark marker within `radius` CSS pixels. */
  private tapFull(sx: number, sy: number, radius: number): void {
    const v = this.fullView, w = this.fmCanvas.clientWidth, hgt = this.fmCanvas.clientHeight;
    let best: Landmark | null = null, bd = radius;
    for (const l of this.deps.world.landmarks.landmarks) {
      const d = Math.hypot(w / 2 + (l.x - v.x) * v.scale - sx, hgt / 2 + (l.z - v.z) * v.scale - sy);
      if (d < bd) { bd = d; best = l; }
    }
    if (best) this.selectLandmark(best, false);
  }

  private updateFull(dt: number): void {
    const c = this.fmCanvas;
    if (!c.width) { this.resizeFull(); if (!c.width) return; }
    const v = this.fullView, dpr = this.dpr, W = c.width, H = c.height;
    const k = v.scale * dpr;
    const halfW = W / 2 / k, halfH = H / 2 / k;
    // Chunks streaming in change the detailed layer: poll a cheap signature a few times a second.
    this.fmSigAcc += dt;
    const detailed = v.scale >= DETAIL_MIN_SCALE;
    if (detailed && this.fmSigAcc > 0.3 && !this.fmStaticDirty) {
      this.fmSigAcc = 0;
      if (this.chunksIn(v.x - halfW, v.z - halfH, v.x + halfW, v.z + halfH).sig !== this.fmSig) this.fmStaticDirty = true;
    }
    this.acc += dt;
    if (!this.fmStaticDirty && !this.fmOverlayDirty && this.acc < 0.25) return;
    this.acc = 0;
    const toScreen = (x: number, z: number): [number, number] => [W / 2 + (x - v.x) * k, H / 2 + (z - v.z) * k];

    if (this.fmStaticDirty) {
      this.fmStaticDirty = false;
      const g = this.fmStaticG;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = MAP_COLORS.outside;
      g.fillRect(0, 0, W, H);
      g.setTransform(k, 0, 0, k, W / 2 - v.x * k, H / 2 - v.z * k);
      const near = detailed ? this.chunksIn(v.x - halfW, v.z - halfH, v.x + halfW, v.z + halfH) : { list: [], sig: '' };
      this.fmSig = near.sig;
      this.paintStatic(g, k, near.list);
      g.setTransform(1, 0, 0, 1, 0, 0);
      this.drawRoadLabels(g, toScreen, W, H);
      this.updateScaleBar();
    }
    this.fmOverlayDirty = false;

    const g = this.fmG;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.fmStatic, 0, 0);
    const nav = this.nav;
    if (nav?.route) drawRoute(g, nav.route, toScreen, 5 * dpr, (i) => nav.connectorOk[i] === true);

    // Landmark markers and labels (labels skip each other instead of piling up).
    const { world, player } = this.deps;
    const focus = this.selected;
    g.font = `600 ${12 * dpr}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineWidth = 3.5 * dpr;
    const placed: number[][] = [];
    const ordered = [...world.landmarks.landmarks].sort((a, b) => Number(b === focus || b === nav?.target) - Number(a === focus || a === nav?.target) || (a.priority ?? 3) - (b.priority ?? 3));
    for (let i = ordered.length - 1; i >= 0; i--) {
      const l = ordered[i];
      const [x, y] = toScreen(l.x, l.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      drawMarker(g, x, y, (l === focus || l === nav?.target ? 7 : 5.5) * dpr, landmarkColor(l), l === focus);
    }
    for (const l of ordered) {
      const [x, y] = toScreen(l.x, l.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const hot = l === focus || l === nav?.target;
      if (!hot && v.scale < 0.45 && (l.priority ?? 3) > 1) continue;
      const tw = g.measureText(l.name).width / 2 + 3 * dpr;
      const box = [x - tw, y - 24 * dpr, x + tw, y - 8 * dpr];
      if (!hot && placed.some((b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])) continue;
      placed.push(box);
      drawLabel(g, l.name, x, y - 11 * dpr);
    }
    const [sx, sy] = toScreen(player.position.x, player.position.z);
    g.beginPath();
    g.arc(sx, sy, 15 * dpr, 0, Math.PI * 2);
    g.fillStyle = 'rgba(242, 193, 78, 0.25)';
    g.fill();
    drawPlayer(g, sx, sy, Math.PI - player.heading, 11 * dpr);

    const [lat, lon] = worldToGeo(player.position.x, player.position.z);
    const you = `You ${formatGeo(lat, lon)}`;
    if (this.coordsYou.textContent !== you) {
      this.coordsYou.textContent = '';
      this.coordsYou.append(h('b', '', 'You '), document.createTextNode(formatGeo(lat, lon)));
    }
  }

  private drawRoadLabels(g: CanvasRenderingContext2D, toScreen: (x: number, z: number) => [number, number], W: number, H: number): void {
    const ov = this.overview, v = this.fullView, dpr = this.dpr;
    if (!ov || v.scale < 0.55) return;
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3 * dpr;
    const placed: number[][] = [];
    for (const l of ov.labels) {
      if (!l.major && v.scale < 1.3) continue;
      const [x, y] = toScreen(l.x, l.z);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      const tw = g.measureText(l.name).width;
      if (tw > l.len * v.scale * dpr * 1.15) continue; // the street is shorter than its name at this zoom
      const c = Math.abs(Math.cos(l.angle)), s = Math.abs(Math.sin(l.angle));
      const bw = (tw * c + 14 * dpr * s) / 2 + 4 * dpr, bh = (tw * s + 14 * dpr * c) / 2 + 4 * dpr;
      const box = [x - bw, y - bh, x + bw, y + bh];
      if (placed.some((b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])) continue;
      placed.push(box);
      g.save();
      g.translate(x, y);
      g.rotate(l.angle);
      g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      g.fillStyle = '#3d4a52';
      g.strokeText(l.name, 0, 0);
      g.fillText(l.name, 0, 0);
      g.restore();
      if (placed.length > 70) break;
    }
  }

  private updateScaleBar(): void {
    const target = 110 / this.fullView.scale; // metres spanned by ~110 CSS px
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const m = [5, 2, 1].map((f) => f * pow).find((x) => x <= target) ?? pow;
    this.scaleEl.textContent = m >= 1000 ? `${m / 1000} km` : `${m} m`;
    const bar = h('i');
    bar.style.width = `${Math.round(m * this.fullView.scale)}px`;
    this.scaleEl.append(bar);
  }
}
