import { test, expect } from '@playwright/test';
import { watch, start, walk, teleport, waitChunks } from './helpers.ts';
import { indiaPosts, indiaStalls } from '../../src/world/district/indiaStreet.ts';

// N1-M5 hero place 3 in the default game: India Street. Coordinates are world metres from the mapped block edges
// (src/world/district/indiaStreet.ts): the north frontage runs (-188.2, -154.9) > (-118.3, -131.2) > (-15.3, -98.5).

test.describe('N1-M5 India Street', () => {
  test('India Street: the mall and the new arcade are walkable end to end; columns and stalls are solid', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    // a lane 3.6 m out from the north frontage: stalls reach 2.6 m, the columns stand on the middle line (5 m or more)
    await teleport(page, -185.6, -150.2);
    await waitChunks(page);
    const r = await walk(page, [[-119.4, -127.8], [-22.1, -96.9]], { run: true, speedup: 4, maxSeconds: 150 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    // back along the five-foot way of the north row (1.15 m inside the frontage), across three of its stepped pieces
    await teleport(page, -117.0, -132.2);
    const a = await walk(page, [[-183.9, -154.7]], { run: true, speedup: 4, maxSeconds: 120 });
    expect(a.reached).toBe(true);
    expect(a.everInBuilding).toBe(false);
    // a canopy column and a stall are solid; the paving beside them is not
    const post = indiaPosts()[1], stall = indiaStalls()[0];
    const solid = await page.evaluate(([px, pz, sx, sz]) => {
      const c = (window as any).__k3d.world.collision, at = (x: number, z: number) => c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h + 0.5);
      return { post: at(px, pz), besidePost: at(px + 1.2, pz), stall: at(sx, sz) };
    }, [post.x, post.z, stall.x, stall.z]);
    expect(solid).toEqual({ post: true, besidePost: false, stall: true });
    expect(issues.errors).toEqual([]);
  });
});
