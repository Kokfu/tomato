// N2-M3: working R/A/G traffic signals, roundabout give-way priority, night signal glow with zero late shader
// compiles, and the `?inferredSignals=0` switch.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, frames, waitChunks, teleport, seedCharacter } from './helpers.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;

const lifeReady = (page: Page) =>
  page.waitForFunction(
    () => {
      const l = (window as any).__k3d?.life;
      return l && l.active && l.traffic && l.render.walkerTriangles > 0;
    },
    null,
    { timeout: 30_000 },
  );

test.describe('N2-M3 traffic signals and road rules', () => {
  test('an ambient car stops behind the stop line on a red signal, drives through on green, and compiles 0 programs at night', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await lifeReady(page);
    // Jalan Tun Abang Haji Openg x Jalan Badruddin mapped 4-node signal junction (-338.6, 1108.8).
    await teleport(page, -325, 1155);
    await waitChunks(page);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    await frames(page, 30);

    const setup = await page.evaluate(() => {
      const k = (window as any).__k3d, t = k.life.traffic, g = t.g;
      const progsBefore = k.renderer.info.programs.length;
      // Verify the chunk's `lampGlow` mesh carries the N2-M3 `sig` attribute (`sig.x >= 2`) for dynamic R/A/G lenses.
      let sigVerts = 0;
      k.world.chunks.group.traverse((o: any) => {
        const attr = o.geometry?.attributes?.sig;
        if (!attr) return;
        for (let i = 0; i < attr.count; i++) if (attr.getX(i) > 1.5) sigVerts++;
      });

      // Find the northbound Openg approach edge ending at mapped signal node (-329.95, 1116.61).
      let sigNode = -1, appEdge = -1;
      for (let n = 0; n < g.nodeCount; n++) {
        if (Math.hypot(g.nx[n] - (-329.95), g.nz[n] - 1116.61) < 2.8) { sigNode = n; break; }
      }
      if (sigNode < 0) return { ok: false, reason: 'no-sig-node', sigVerts, progsBefore };
      for (const e of g.edgesAt(sigNode)) {
        if (t.ok[e] && g.eb[e] === sigNode && g.elen[e] > 40) { appEdge = e; break; }
      }
      if (appEdge < 0) return { ok: false, reason: 'no-approach-edge', sigVerts, progsBefore };

      // Set junction clock 0.6 s into RED for this approach (~18.4 s of red remaining in the 36 s cycle).
      for (let sec = 0; sec < 36; sec += 0.25) {
        t.time = sec;
        if (t.signalState(sigNode, appEdge) === 'red' && t.redFor > 0.4 && t.redFor < 1.2) break;
      }

      // Place one clean hatchback 34 m before the node at 7.5 m/s with a valid continuation across the junction.
      t.clear();
      // Keep `fresh` from refilling ahead of our test car while we observe it.
      k.life.fresh = 0;
      const off = t.laneOffset(appEdge, 0);
      let nextEdge = -1;
      for (const oe of g.edgesAt(sigNode)) {
        if (oe !== appEdge && t.ok[oe] && g.ea[oe] === sigNode) { nextEdge = oe; break; }
      }
      const len = g.elen[appEdge], s = Math.max(4, len - 34);
      const v = {
        id: 9001, kind: 0, tint: 0, prev: null,
        cur: { e: appEdge, fwd: true, off, len },
        next: nextEdge >= 0 ? { e: nextEdge, fwd: true, off: t.laneOffset(nextEdge, 0), len: g.elen[nextEdge] } : null,
        s, v: 7.5, pace: 1, x: -328, y: 0, z: 1150, heading: Math.PI, pitch: 0, gy: 0, gp: 0,
        braking: false, cap: 7.5, since: 0.1, why: '', stuck: 0, ghost: 0, blocker: 0, waited: 0,
        held: 0, past: 0, holds: -1, dead: false, halt: 0, horn: -1,
      };
      t.vehicles.push(v);
      // Hermetic: the ambient fill keeps adding cars (one may queue ahead of ours at the red, which is right but makes
      // the stop point random) and walkers may cross in front; keep only the test car for the rest of this test.
      const update = t.update.bind(t);
      t.update = (...a: unknown[]) => {
        update(...a);
        for (let i = t.vehicles.length - 1; i >= 0; i--) if (t.vehicles[i].id !== 9001) t.vehicles.splice(i, 1);
        k.life.walkers?.clear();
      };
      // Stand player on the pavement clear of the carriageway so the car stops ONLY for the red signal.
      k.player.teleport(-312, 1140);
      return { ok: true, sigVerts, progsBefore, sigNode, appEdge, startState: t.signalState(sigNode, appEdge) };
    });

    expect(setup.ok, JSON.stringify(setup)).toBe(true);
    expect(setup.sigVerts).toBeGreaterThan(0);
    expect(setup.startState).toBe('red');

    // Run 300 real frames (5.0 s at 60 Hz): the car must brake smoothly to a stop behind the stop line on red.
    await frames(page, 300);
    const atRed = await page.evaluate(({ sigNode, appEdge }) => {
      const k = (window as any).__k3d, t = k.life.traffic;
      const v = t.vehicles.find((q: any) => q.id === 9001);
      return v ? {
        v: v.v,
        why: v.why,
        braking: v.braking,
        curEdge: v.cur.e,
        distToNode: v.cur.len - v.s,
        state: t.signalState(sigNode, appEdge),
        others: t.vehicles.length - 1,
      } : null;
    }, { sigNode: (setup as any).sigNode, appEdge: (setup as any).appEdge });

    expect(atRed).not.toBeNull();
    expect(atRed!.state).toBe('red');
    expect(atRed!.curEdge).toBe((setup as any).appEdge);
    expect(atRed!.v).toBeLessThan(0.08);
    expect(atRed!.why, JSON.stringify(atRed)).toBe('signal');
    expect(atRed!.braking).toBe(true);
    expect(atRed!.distToNode).toBeGreaterThan(6.2);
    expect(atRed!.distToNode).toBeLessThan(12.5);

    // Advance the clock to 0.8 s before GREEN and run 240 real frames (4.0 s) across the red -> green transition.
    await page.evaluate(({ sigNode, appEdge }) => {
      const t = (window as any).__k3d.life.traffic;
      while (t.signalState(sigNode, appEdge) !== 'green') t.time += 0.25;
      t.time -= 0.8;
    }, { sigNode: (setup as any).sigNode, appEdge: (setup as any).appEdge });
    await frames(page, 240);

    const onGreen = await page.evaluate(({ sigNode, appEdge }) => {
      const t = (window as any).__k3d.life.traffic;
      const v = t.vehicles.find((q: any) => q.id === 9001);
      return v ? {
        v: v.v,
        curEdge: v.cur.e,
        distToNode: v.cur.len - v.s,
        state: t.signalState(sigNode, appEdge),
      } : null;
    }, { sigNode: (setup as any).sigNode, appEdge: (setup as any).appEdge });

    expect(onGreen).not.toBeNull();
    expect(onGreen!.state).toBe('green');
    expect(onGreen!.v).toBeGreaterThan(3.2);
    expect(onGreen!.curEdge !== (setup as any).appEdge || onGreen!.distToNode < 4).toBe(true);

    // Switch to night: signal lenses glow via ENV.uNight with zero new shader programs compiled.
    await k3d(page, (k) => k.world.setTime('night'));
    await frames(page, 40);
    const progsNight = await k3d(page, (k) => k.renderer.info.programs.length);
    expect(progsNight).toBe(setup.progsBefore);
    expect(issues.errors).toEqual([]);
  });

  test('?inferredSignals=0 removes inferred main-road signals while keeping mapped ones', async ({ page }) => {
    const issues = watch(page);
    await seedCharacter(page);
    await page.goto('./?inferredSignals=0');
    await start(page, { navigate: false });
    await lifeReady(page);
    // Inferred junction near Electra House / Gartak x Khoo Hun Yeang (-220.9, -13.4) vs mapped Market x Khoo Hun Yeang (-281.1, -114.6).
    await teleport(page, -221, -14);
    await waitChunks(page);
    await frames(page, 20);

    const check = await page.evaluate(() => {
      const k = (window as any).__k3d, t = k.life.traffic, g = t.g;
      let infActive = 0, mappedActive = 0;
      for (let n = 0; n < g.nodeCount; n++) {
        const e = g.edgesAt(n)[0];
        if (e === undefined) continue;
        // Sample across a full cycle to see whether node `n` ever turns red.
        let everRed = false;
        for (let s = 0; s < 36; s += 4) {
          t.time = s;
          if (t.signalState(n, e) === 'red') { everRed = true; break; }
        }
        if (Math.hypot(g.nx[n] - (-220.9), g.nz[n] - (-13.4)) < 25 && everRed) infActive++;
        if (Math.hypot(g.nx[n] - (-281.1), g.nz[n] - (-114.6)) < 25 && everRed) mappedActive++;
      }
      return { infActive, mappedActive };
    });

    expect(check.infActive).toBe(0);
    expect(check.mappedActive).toBeGreaterThanOrEqual(1);
    expect(issues.errors).toEqual([]);
  });
});
