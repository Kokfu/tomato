import { test, expect } from '@playwright/test';
import { watch, start, teleport, waitChunks } from './helpers.ts';

// N1-M5 hero place 6 in the default game: the Kuching City Mosque (tour view 08) with its cemetery, and the floating
// mosque (Masjid India Bandar Kuching) in its photographed form.

const measure = (name: string) => `(() => {
  const k = window.__k3d; let mesh = null;
  for (const c of k.world.chunks.chunks.values()) c.group && c.group.traverse((o) => { if (o.name === '${name}') mesh = o; });
  if (!mesh) return null;
  const p = mesh.geometry.attributes.position.array;
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); }
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i + 1] > y1 - 2) { sx += p[i]; sz += p[i + 2]; n++; }
  return { height: y1 - y0, topOffset: Math.hypot(sx / n - (x0 + x1) / 2, sz / n - (z0 + z1) / 2), tris: mesh.userData.triangles };
})()`;

test.describe('N1-M5 City Mosque + Floating Mosque', () => {
  test('City Mosque: its own model with domes and minarets; the hall is solid, the cemetery is walkable', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, -406.2, 26.2);
    await waitChunks(page);
    const m = (await page.evaluate(measure('city-mosque'))) as { height: number; topOffset: number; tris: number } | null;
    expect(m).not.toBeNull();
    // minarets and the dome's finial reach about 25 m above the upper ground level
    expect(m!.height).toBeGreaterThan(24);
    expect(m!.height).toBeLessThan(34);
    expect(m!.tris).toBeGreaterThan(3000);
    const solid = await page.evaluate(() => {
      const c = (window as any).__k3d.world.collision, at = (x: number, z: number) => c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h + 0.5);
      return { hall: at(-433, -34), cemetery: at(-400, 12) };
    });
    expect(solid).toEqual({ hall: true, cemetery: false });
    expect(issues.errors).toEqual([]);
  });

  test('floating mosque: one slender minaret beside the dome, not two at the corners', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, -150, -245);
    await waitChunks(page);
    const m = (await page.evaluate(measure('floating-mosque'))) as { height: number; topOffset: number; tris: number } | null;
    expect(m).not.toBeNull();
    expect(m!.height).toBeGreaterThan(29);
    // the top two metres are one minaret's tip, well off the middle of the deck (two corner minarets would average near it)
    expect(m!.topOffset).toBeGreaterThan(3);
    expect(issues.errors).toEqual([]);
  });
});
