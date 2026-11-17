// @ts-nocheck  (browser-side snippets; a dev utility, not part of the app)
// Walks the collision model of the Jalan China five-foot ways and reports steps, gaps and blocked spots.
// Usage: node tools/dev/walkway-probe.ts [url]
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:3000/';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto(base + '?render=c');
await p.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await p.click('#btn-start');
await p.evaluate(async () => { const k = (window as any).__k3d; k.player.teleport(158, 8); k.tpc.snap(); await k.v5.setMode('c'); });
await p.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(1500);
const R = await p.evaluate(async () => {
  const k = (window as any).__k3d, col = k.world.collision;
  const { CHINA } = await import('/src/v5/geo.ts');
  const out: any = { rows: {} };
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'west' : 'east', r: any = { steps: [], blocked: [], gaps: [], maxDepth: [] };
    const at = (s: number, d: number) => CHINA.toWorld(s, side * (CHINA.half + d));
    // 1. continuous walk along the middle of the walkway (depth 1.4), feet following the ground
    let [x0, z0] = at(side < 0 ? 6.5 : 1, 1.4), y = col.groundAt(x0, z0, 1e6).h, prevH = y, stuck = 0;
    for (let s = side < 0 ? 6.5 : 1; s < 86.5; s += 0.05) {
      const [x, z] = at(s, 1.4), [rx, rz] = col.resolve(x, z, 0.35, y), g = col.groundAt(x, z, y), terr = k.world.height.sample(x, z);
      if (Math.hypot(rx - x, rz - z) > 0.01) { stuck++; if (!r.blocked.length || s - r.blocked[r.blocked.length - 1][1] > 0.11) r.blocked.push([+s.toFixed(2), +s.toFixed(2)]); else r.blocked[r.blocked.length - 1][1] = +s.toFixed(2); }
      if (g.h - terr < 0.02) r.gaps.push(+s.toFixed(2));
      if (Math.abs(g.h - prevH) > 0.04) r.steps.push([+s.toFixed(2), +(g.h - prevH).toFixed(3)]);
      prevH = g.h; y = g.h;
    }
    r.stuckSamples = stuck;
    // 2. how deep can a 0.35 m character get toward the shopfront, per lot centre
    for (let s = 8; s < 86; s += 5.49) {
      let d = 1.2; const [x, z] = at(s, 1.2), yy = col.groundAt(x, z, 1e6).h;
      for (; d < 4; d += 0.02) { const [qx, qz] = at(s, d), [rx, rz] = col.resolve(qx, qz, 0.35, yy); if (Math.hypot(rx - qx, rz - qz) > 0.005) break; }
      r.maxDepth.push(+d.toFixed(2));
    }
    // 3. where is the lot boundary blocked across the walkway depth (first three boundaries)
    r.boundary = [];
    const w = side < 0 ? (CHINA.len - 5.5) / 15 : null;
    if (w) for (const sb of [5.5 + w, 5.5 + 2 * w, 5.5 + 3 * w]) {
      const free = []; const [x, z] = at(sb, 1.4), yy = col.groundAt(x, z, 1e6).h + 0.4;
      for (let d = -0.2; d < 2.4; d += 0.05) { const [qx, qz] = at(sb, d), [rx, rz] = col.resolve(qx, qz, 0.05, yy); free.push(Math.hypot(rx - qx, rz - qz) > 0.002 ? 'X' : '.'); }
      r.boundary.push(free.join(''));
    }
    out.rows[name] = r;
  }
  // 3b. the real player controller walking each row end to end (forward held, 30 steps a second)
  out.playerWalk = {};
  for (const side of [-1, 1]) {
    const [x0, z0] = CHINA.toWorld(side < 0 ? 7 : 1.5, side * (CHINA.half + 1.38));
    k.player.teleport(x0, z0);
    const yaw = Math.atan2(-CHINA.dx, -CHINA.dz), input = { moveX: 0, moveY: 1, run: false, jump: false };
    let maxStep = 0, maxOff = 0, air = 0, stalled = 0, prevY = k.player.position.y, prevS = -1, t = 0;
    for (; t < 120; t += 1 / 30) {
      k.player.update(1 / 30, input, yaw);
      const p = k.player.position, [s, o] = CHINA.toStreet(p.x, p.z);
      maxStep = Math.max(maxStep, Math.abs(p.y - prevY)); prevY = p.y;
      maxOff = Math.max(maxOff, Math.abs(Math.abs(o) - CHINA.half - 1.38));
      if (!k.player.grounded) air++;
      if (s - prevS < 0.005) stalled++; prevS = s;
      if (s > 86) break;
    }
    const p = k.player.position;
    out.playerWalk[side < 0 ? 'west' : 'east'] = { reachedStation: +CHINA.toStreet(p.x, p.z)[0].toFixed(1), seconds: +t.toFixed(1), stalledFrames: stalled, airborneFrames: air, maxHeightChangePerFrame: +maxStep.toFixed(3), maxSidewaysPush: +maxOff.toFixed(3), insideBuilding: col.insideBuilding(p.x, p.z, p.y) };
  }
  // 4. pedestrian routes against the same collision world, and their live state
  // (the prototype is off by default: record that nothing of it exists, then switch it on for the check)
  out.pedsOffByDefault = { enabled: k.v5.pedsEnabled, instance: k.v5.peds !== null, inScene: !!k.world.scene.getObjectByName('v7-pedestrians'), chunkFetched: performance.getEntriesByType('resource').some((e) => /pedestrians/.test(e.name)) };
  await k.v5.setPedestrians(true);
  const peds = k.v5.peds;
  for (let i = 0; i < 100 && !peds.active; i++) await new Promise((r) => setTimeout(r, 100));
  out.peds = { count: peds.list.length, routeFaults: peds.validate() };
  const t0 = peds.list.map((q) => q.s);
  await new Promise((r) => setTimeout(r, 4000));
  out.peds.movedIn4s = peds.list.map((q, i) => +(q.s - t0[i]).toFixed(2));
  out.peds.feetAboveGround = peds.list.map((q) => { const [x, z] = q.world(); return +(q.y - col.groundAt(x, z, q.y).h).toFixed(3); });
  await k.v5.setMode('b');
  out.peds.afterUnload = { count: peds.list.length, children: peds.group.children.length, inScene: !!peds.group.parent, instance: k.v5.peds !== null };
  return out;
});
console.log(JSON.stringify(R));
if (errs.length) console.log(errs.join('\n'));
await b.close();
