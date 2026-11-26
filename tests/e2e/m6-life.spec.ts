// N1-M6 part B: ambient traffic and walkers. They fill the streets away from Jalan China, stand on the ground, move,
// give way to the player, and cost no shader program after they have started (none when night falls either).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, frames, waitChunks, teleport, seedCharacter } from './helpers.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const lifeReady = (page: Page) => page.waitForFunction(() => {
  const l = (window as any).__k3d.life;
  return l && l.active && l.render.walkerTriangles > 0 && l.render.group.children.every((o: any) => o.name === 'life-headlights' || o.visible);
}, null, { timeout: 30_000 });
interface Seen { id: number; kind: number; x: number; z: number; v: number; dy: number; inside: boolean; stand: boolean; arcade: boolean }
interface Snapshot { programs: number; vehicles: Seen[]; walkers: Seen[]; drawn: Record<string, number>; player: [number, number] }
const snapshot = (page: Page): Promise<Snapshot> => k3d(page, (k) => {
  const l = k.life, c = k.world.collision;
  return {
    programs: k.renderer.info.programs.length,
    vehicles: l.traffic.vehicles.map((v: any) => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, v: v.v, dy: v.y - c.groundAt(v.x, v.z, v.y + 0.5).h, inside: c.insideBuilding(v.x, v.z, v.y + 0.5, false) })),
    walkers: l.walkers.list.map((w: any) => ({ id: w.id, x: w.x, z: w.z, stand: w.stand, arcade: w.arcade, dy: w.y - c.groundAt(w.x, w.z, w.y + 0.4).h, inside: c.insideBuilding(w.x, w.z, w.y + 0.5, false) })),
    drawn: Object.fromEntries(l.render.group.children.map((o: any) => [o.name, o.visible ? o.count : 0])),
    player: [k.player.position.x, k.player.position.z],
  };
});

test.describe('N1-M6 traffic and walkers', () => {
  test('the streets of a suburb fill with vehicles and walkers; no program is compiled for them later, by day or night', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await lifeReady(page);
    await teleport(page, -1610, 1003); // Jalan Nanas Barat (tour view 11): 1.9 km from Jalan China
    await waitChunks(page);
    await frames(page, 300);
    const a = await snapshot(page);
    expect(a.vehicles.length).toBeGreaterThanOrEqual(10);
    expect(a.walkers.length).toBeGreaterThanOrEqual(12);
    for (const v of a.vehicles) { expect(Math.abs(v.dy)).toBeLessThan(0.35); expect(v.inside).toBe(false); expect(Math.hypot(v.x - a.player[0], v.z - a.player[1])).toBeLessThan(260); }
    for (const w of a.walkers) { expect(Math.abs(w.dy)).toBeLessThan(0.35); expect(w.inside).toBe(false); expect(Math.hypot(w.x - a.player[0], w.z - a.player[1])).toBeLessThan(100); }
    expect(new Set(a.vehicles.map((v) => v.kind)).size).toBeGreaterThanOrEqual(3);
    expect(a.drawn['life-walkers']).toBe(a.walkers.length);
    expect(a.drawn['life-shadows']).toBe(a.walkers.length + a.vehicles.length);
    expect(a.drawn['life-headlights']).toBe(0); // not drawn by day

    // they move
    await frames(page, 240);
    const b = await snapshot(page);
    const moved = b.vehicles.filter((v) => { const o = a.vehicles.find((q) => q.id === v.id); return o && Math.hypot(v.x - o.x, v.z - o.z) > 8; }).length;
    const walked = b.walkers.filter((w) => { const o = a.walkers.find((q) => q.id === w.id); return o && Math.hypot(w.x - o.x, w.z - o.z) > 1.5; }).length;
    expect(moved).toBeGreaterThanOrEqual(4);
    expect(walked).toBeGreaterThanOrEqual(5);
    expect(b.programs).toBe(a.programs);

    // night: lamps and headlight patches, still no new program
    await k3d(page, (k) => k.world.setTime('night'));
    await frames(page, 90);
    const n = await snapshot(page);
    expect(n.drawn['life-headlights']).toBe(n.vehicles.length);
    expect(n.programs).toBe(a.programs);
    await k3d(page, (k) => k.world.setTime('day'));
    expect(issues.errors).toEqual([]);
  });

  test('a vehicle stops for the player standing in the road and drives on when they step away', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await lifeReady(page);
    await teleport(page, -1610, 1003);
    await waitChunks(page);
    await frames(page, 240);
    // stand 16 m ahead of a vehicle that is driving freely on a long clear stretch
    const id = await page.evaluate(() => new Promise<number>((resolve) => {
      const k = (window as any).__k3d, t = k.life.traffic, P = { x: 0, z: 0, tx: 0, tz: 1 };
      let tries = 0;
      const tick = () => {
        const v = t.vehicles.find((q: any) => q.v > 5 && q.why === '' && q.cur.len - q.s > 45 && Math.hypot(q.x - k.player.position.x, q.z - k.player.position.z) < 150);
        if (v) { t.pathPoint(v, 16, P); k.player.teleport(P.x, P.z); return resolve(v.id); }
        if (++tries > 900) return resolve(-1);
        requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(id).toBeGreaterThan(0);
    await frames(page, 240);
    const stopped = await page.evaluate((id) => {
      const k = (window as any).__k3d, v = k.life.traffic.vehicles.find((q: any) => q.id === id);
      return v ? { v: v.v, d: Math.hypot(v.x - k.player.position.x, v.z - k.player.position.z), braking: v.braking } : null;
    }, id);
    expect(stopped).not.toBeNull();
    expect(stopped!.v).toBeLessThan(0.1);
    expect(stopped!.braking).toBe(true);
    expect(stopped!.d).toBeGreaterThan(2.5);
    expect(stopped!.d).toBeLessThan(12);
    await k3d(page, (k) => k.player.teleport(k.player.position.x + 30, k.player.position.z + 30));
    await frames(page, 200);
    const after = await page.evaluate((id) => (window as any).__k3d.life.traffic.vehicles.find((q: any) => q.id === id)?.v ?? 99, id);
    expect(after).toBeGreaterThan(2);
    expect(issues.errors).toEqual([]);
  });

  test('Low preset: fewer of them, two vehicle kinds; ?life=0: none at all', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await lifeReady(page);
    await teleport(page, 1075, 239); // Jalan Padungan
    await waitChunks(page);
    await frames(page, 300);
    const medium = await snapshot(page);
    expect(medium.vehicles.length).toBeGreaterThan(10);
    // The preset changes where the player stands: what Low does not draw (saloons, SUVs, the vehicles and walkers over
    // its number) leaves the simulation at once, so nothing unseen stays on the road.
    await page.evaluate(() => (document.querySelector('#quality-seg [data-q="low"]') as HTMLElement).click());
    await page.waitForFunction(() => (window as any).__k3d.life.budget.vehicles === 8 && (window as any).__k3d.life.active, null, { timeout: 30_000 });
    const atOnce = await snapshot(page);
    expect(atOnce.vehicles.length).toBeLessThanOrEqual(8);
    expect(atOnce.walkers.length).toBeLessThanOrEqual(9);
    for (const v of atOnce.vehicles) expect([0, 3]).toContain(v.kind);
    await lifeReady(page);
    await frames(page, 300);
    const low = await snapshot(page);
    expect(low.drawn['life-shadows']).toBe(low.walkers.length + low.vehicles.length);
    expect(low.vehicles.length).toBeGreaterThanOrEqual(4);
    expect(low.vehicles.length).toBeLessThanOrEqual(10);
    expect(low.walkers.length).toBeLessThanOrEqual(11);
    expect(low.walkers.length).toBeGreaterThanOrEqual(5);
    for (const v of low.vehicles) expect([0, 3]).toContain(v.kind);
    expect(Object.keys(low.drawn).sort()).toEqual(['life-headlights', 'life-shadows', 'life-vehicles-0', 'life-vehicles-3', 'life-walkers']);
    expect(issues.errors).toEqual([]);

    await seedCharacter(page);
    await page.goto('./?life=0');
    await start(page, { navigate: false });
    await frames(page, 60);
    expect(await k3d(page, (k) => [k.life, !!k.world.scene.getObjectByName('life')])).toEqual([null, false]);
  });
});
