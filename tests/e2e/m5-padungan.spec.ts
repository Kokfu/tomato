import { test, expect } from '@playwright/test';
import { watch, start, walk, teleport, waitChunks } from './helpers.ts';

// N1-M5 hero place 5 in the default game: the Cat Column at the Jalan Abell junction (tour view 07), and the Great
// Cat with the Chinatown paifang at the east end of Jalan Padungan. The paifang's mapped outline lies across both
// carriageways: until this place it was drawn and blocked as a solid building.

test.describe('N1-M5 Padungan + Cat Statue', () => {
  test('the Cat Column stands on its island: a model about 8 m tall with a solid plinth', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, 1085, 244.5);
    await waitChunks(page);
    const m = await page.evaluate(() => {
      const k = (window as any).__k3d, c = k.world.collision;
      let mesh: any = null;
      for (const ch of k.world.chunks.chunks.values()) ch.group?.traverse((o: any) => { if (o.name === 'cat-column') mesh = o; });
      if (!mesh) return null;
      const p = mesh.geometry.attributes.position.array as Float32Array;
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < p.length; i += 3) { y0 = Math.min(y0, p[i]); y1 = Math.max(y1, p[i]); }
      const at = (x: number, z: number) => c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h + 0.5);
      return { height: y1 - y0, plinth: at(1104.13, 243.7), road: at(1092, 241.3) };
    });
    expect(m).not.toBeNull();
    expect(m!.height).toBeGreaterThan(8);
    expect(m!.height).toBeLessThan(9.5);
    expect(m!.plinth).toBe(true);
    expect(m!.road).toBe(false);
    expect(issues.errors).toEqual([]);
  });

  test('the paifang is open: a walker passes under it along the carriageway, its piers are solid, the Great Cat stands in front', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, 1547, 532.2);
    await waitChunks(page);
    const r = await walk(page, [[1573, 540.6]], { speedup: 4, maxSeconds: 60 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    const m = await page.evaluate(() => {
      const k = (window as any).__k3d, c = k.world.collision;
      let mesh: any = null;
      for (const ch of k.world.chunks.chunks.values()) ch.group?.traverse((o: any) => { if (o.name === 'padungan-paifang') mesh = o; });
      const at = (x: number, z: number) => c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h + 0.5);
      // pier 1 stands 7.6 m along the gate's axis from its north end (1563.1, 534.55), axis (-0.393, 0.919)
      return { mesh: !!mesh, tris: mesh ? mesh.userData.triangles : 0, pier: at(1563.1 - 0.393 * 7.61, 534.55 + 0.919 * 7.61), underNorth: at(1561.8, 537.7), underSouth: at(1556.4, 550.2), cat: at(1579.05, 551.1) };
    });
    expect(m.mesh).toBe(true);
    expect(m.tris).toBeGreaterThan(900);
    expect(m.pier).toBe(true);
    expect(m.underNorth).toBe(false);
    expect(m.underSouth).toBe(false);
    expect(m.cat).toBe(true);
    expect(issues.errors).toEqual([]);
  });
});
