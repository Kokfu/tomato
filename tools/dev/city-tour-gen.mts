// One-off generator for tools/dev/city-tour.json (run once in M0; the JSON is then frozen so before/after shots stay comparable).
// Each view snaps the camera to the nearest mapped road (class 0-7) and aims it: 'along' = down the road in the hinted
// compass direction, 'toward' = at a lat/lon target from a point near `from` (bearing deg from target, dist m).
import { readFileSync, writeFileSync } from 'node:fs';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
const D = 'public/data/kuching/chunks/';
const man = JSON.parse(readFileSync('public/data/kuching/manifest.json', 'utf8'));
type Seg = { x: number; z: number; dx: number; dz: number; t: number };
const segs: Seg[] = [];
for (const k of man.chunks as string[]) {
  const c = JSON.parse(readFileSync(D + k + '.json', 'utf8'));
  for (const r of c.roads) {
    if (r.t > 7) continue;
    const p: [number, number][] = [];
    for (let i = 0; i < r.p.length; i += 2) p.push([c.cx * 256 + r.p[i] / 100, c.cz * 256 + r.p[i + 1] / 100]);
    for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1]; const L = Math.hypot(dx, dz); if (L > 0.5) segs.push({ x: (p[i][0] + p[i - 1][0]) / 2, z: (p[i][1] + p[i - 1][1]) / 2, dx: dx / L, dz: dz / L, t: r.t }); }
  }
}
const snap = (x: number, z: number) => segs.reduce((b, s) => (Math.hypot(s.x - x, s.z - z) < Math.hypot(b.x - x, b.z - z) ? s : b));
// look direction (dx,dz) -> yaw: camera looks along (-sin yaw, -cos yaw)
const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const bearingDir = (b: number): [number, number] => [Math.sin((b * Math.PI) / 180), -Math.cos((b * Math.PI) / 180)];
type Spec = { name: string; along?: [number, number, number]; toward?: [number, number, number, number]; fixed?: [number, number, number] };
const specs: Spec[] = [
  { name: '01-waterfront', toward: [1.56047, 110.34313, 200, 45] },
  { name: '02-main-bazaar', along: [1.5587335, 110.3471314, 250] },
  { name: '03-carpenter-street', along: [1.5582933, 110.3459086, 70] },
  { name: '04-india-street', along: [1.5596289, 110.3433246, 20] },
  { name: '05-jalan-gambier', along: [1.560454, 110.3440946, 90] },
  { name: '06-plaza-merdeka', toward: [1.5585327, 110.3441075, 220, 70] },
  { name: '07-padungan-cat-statue', toward: [1.556296, 110.3544222, 260, 40] },
  { name: '08-kuching-mosque', toward: [1.5587851, 110.3405924, 150, 70] },
  { name: '09-satok', toward: [1.5549659, 110.3211554, 150, 120] },
  { name: '10-the-spring', toward: [1.5356349, 110.3581567, 120, 120] },
  { name: '11-residential-overture', fixed: [-1610, 1003, 1.571] },
  { name: '12-trunk-road-openg', fixed: [-321, 1290, 3.05] },
  { name: '13-river-to-dun', toward: [1.5617501, 110.3478883, 190, 270] },
  { name: '14-jalan-china-control', fixed: [156.57, 17.22, -0.588] },
];
const out = specs.map((s) => {
  let x: number, z: number, yaw: number;
  if (s.fixed) [x, z, yaw] = s.fixed;
  else if (s.along) {
    const [tx, tz] = geoToWorld(s.along[0], s.along[1]); const g = snap(tx, tz);
    const [hx, hz] = bearingDir(s.along[2]); const sign = g.dx * hx + g.dz * hz >= 0 ? 1 : -1;
    x = g.x; z = g.z; yaw = yawOf(g.dx * sign, g.dz * sign);
  } else {
    const [tx, tz] = geoToWorld(s.toward![0], s.toward![1]); const [bx, bz] = bearingDir(s.toward![2]);
    const g = snap(tx + bx * s.toward![3], tz + bz * s.toward![3]); x = g.x; z = g.z; yaw = yawOf(tx - x, tz - z);
  }
  return { name: s.name, x: +x.toFixed(1), z: +z.toFixed(1), yaw: +yaw.toFixed(3), pitch: 0.05, fp: true, wait: 3000 };
});
writeFileSync('tools/dev/city-tour.json', JSON.stringify(out, null, 1) + '\n');
console.log(out.map((v) => `${v.name} ${v.x} ${v.z} ${v.yaw}`).join('\n'));
