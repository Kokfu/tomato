import { test, expect } from '@playwright/test';
import { watch, start, walk, teleport, waitChunks } from './helpers.ts';

// N1-M5 hero place 1 in the default game: the Kuching Waterfront walk. Coordinates are world metres from the mapped
// bank line (src/world/district/promenade.ts).

/** A line `d` metres to the landward (+z) side of a west-to-east polyline. */
function inland(line: [number, number][], d: number): [number, number][] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d];
  });
}

test.describe('N1-M5 Kuching Waterfront', () => {
  test('Kuching Waterfront: the paved walk behind the railing is walkable from the Square Tower to Jalan China', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const lane = inland([[117.5, -240.6], [154.5, -210.8], [181.4, -186.1], [200.6, -166.3], [215.5, -139.2]], 6.3);
    await teleport(page, lane[0][0], lane[0][1]);
    await waitChunks(page);
    const r = await walk(page, lane.slice(1), { run: true, speedup: 4, maxSeconds: 150 });
    expect(r.reached).toBe(true);
    expect(r.everInWaterOffDeck).toBe(false);
    expect(r.everInBuilding).toBe(false);
    // the railing still stops a walker at the bank, and the river is beyond it
    const bank = await page.evaluate(() => { const k = (window as any).__k3d; return { land: k.world.collision.inWater(196, -166), river: k.world.collision.inWater(203, -172) }; });
    expect(bank.land).toBe(false);
    expect(bank.river).toBe(true);
    expect(issues.errors).toEqual([]);
  });
});
