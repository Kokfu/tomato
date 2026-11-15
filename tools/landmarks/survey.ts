// Site survey helper (reconstruction workflow, steps 2-3): collects every mapped feature around a
// point so the outlines can be compared with aerial imagery in tools/landmarks/survey.html.
// Usage: node tools/landmarks/survey.ts <lat> <lon> [radiusMetres=90]
// Writes tools/landmarks/.survey.json (not shipped, git-ignored).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [lat0, lon0, rad = 90] = process.argv.slice(2).map(Number);
const mLat = 110574, mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const near = (lat: number, lon: number) => Math.hypot((lat - lat0) * mLat, (lon - lon0) * mLon) < rad;
const out: any = { centre: [lat0, lon0], radius: rad, osm: [], pois: [], overture: [] };
const seen = new Set<string>();
for (const f of ['data-src/osm/kuching.json', 'data-src/osm/pois.json']) {
  if (!existsSync(f)) continue;
  for (const e of JSON.parse(readFileSync(f, 'utf8')).elements) {
    const k = `${e.type}/${e.id}`;
    if (seen.has(k) || !e.tags) continue;
    if (e.type === 'node') {
      if (!near(e.lat, e.lon)) continue;
      seen.add(k);
      out.pois.push({ ref: k, lat: e.lat, lon: e.lon, tags: e.tags });
    } else if (e.geometry?.some((g: any) => g && near(g.lat, g.lon))) {
      seen.add(k);
      out.osm.push({ ref: k, tags: e.tags, pts: e.geometry.map((g: any) => [g.lat, g.lon]) });
    }
  }
}
const ov = 'data-src/overture/buildings.geojsonl';
if (existsSync(ov)) for (const line of readFileSync(ov, 'utf8').split('\n')) {
  if (!line) continue;
  const f = JSON.parse(line);
  if (f.geometry.type !== 'Polygon') continue;
  const ring = f.geometry.coordinates[0];
  if (!ring.some((p: number[]) => near(p[1], p[0]))) continue;
  out.overture.push({ id: f.id, src: f.properties.sources?.[0]?.dataset, h: f.properties.height, pts: ring.map((p: number[]) => [p[1], p[0]]) });
}
writeFileSync('tools/landmarks/.survey.json', JSON.stringify(out));
console.log(`osm ways ${out.osm.length}, pois ${out.pois.length}, overture ${out.overture.length}`);
for (const o of out.osm) if (!o.tags.highway) console.log(o.ref, JSON.stringify(o.tags).slice(0, 110), o.pts.length);
for (const o of out.overture) console.log('overture', o.src, o.pts.length);
