import { test, expect } from '@playwright/test';
import { watch, start, walk, teleport, waitChunks } from './helpers.ts';

// N1-M5 hero place 4 in the default game: the Plaza Merdeka entrance, the Square Tower and the Old Courthouse.
// The entrance face of the mall runs (-79.7, 14.4) > (-65.4, 20.8); its outward normal is (-0.41, 0.91).

test.describe('N1-M5 Plaza Merdeka, Old Courthouse, Square Tower', () => {
  test('Plaza Merdeka: a walker reaches the door across the forecourt; the canopy columns are solid', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, -76.9, 27.2);
    await waitChunks(page);
    const r = await walk(page, [[-73.0, 18.8]], { speedup: 4, maxSeconds: 40 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    const solid = await page.evaluate(() => {
      const c = (window as any).__k3d.world.collision, at = (x: number, z: number) => c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h + 0.5);
      // a column: 4 m along the face from its middle, 3.3 m out; the doorway: on the middle line, 3.3 m out
      return { column: at(-72.55 + 0.913 * 4 - 0.409 * 3.3, 17.6 + 0.409 * 4 + 0.913 * 3.3), doorway: at(-72.55 - 0.409 * 3.3, 17.6 + 0.913 * 3.3) };
    });
    expect(solid).toEqual({ column: true, doorway: false });
    expect(issues.errors).toEqual([]);
  });

  test('Square Tower has a corner turret (not a central tower); the Old Courthouse has its clock tower and verandah columns', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, 113, -168);
    await waitChunks(page);
    const m = await page.evaluate(() => {
      const k = (window as any).__k3d, out: Record<string, { height: number; topOffset: number; tris: number } | null> = {};
      for (const name of ['square-tower', 'old-courthouse']) {
        let mesh: any = null;
        for (const c of k.world.chunks.chunks.values()) c.group?.traverse((o: any) => { if (o.name === name) mesh = o; });
        if (!mesh) { out[name] = null; continue; }
        const p = mesh.geometry.attributes.position.array as Float32Array;
        let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); }
        let sx = 0, sz = 0, n = 0;
        for (let i = 0; i < p.length; i += 3) if (p[i + 1] > y1 - 1.5) { sx += p[i]; sz += p[i + 2]; n++; }
        out[name] = { height: y1 - y0, topOffset: Math.hypot(sx / n - (x0 + x1) / 2, sz / n - (z0 + z1) / 2), tris: (mesh.geometry.index ? mesh.geometry.index.count : p.length / 3) / 3 };
      }
      return out;
    });
    // the tower's highest part (the turret, 3.3 m above the parapet) stands at a corner, not over the middle
    expect(m['square-tower']).not.toBeNull();
    expect(m['square-tower']!.height).toBeGreaterThan(10.5);
    expect(m['square-tower']!.topOffset).toBeGreaterThan(3);
    // the courthouse: verandah columns and the clock tower add well over a thousand triangles to the plain model
    expect(m['old-courthouse']).not.toBeNull();
    expect(m['old-courthouse']!.tris).toBeGreaterThan(2500);
    expect(issues.errors).toEqual([]);
  });
});
