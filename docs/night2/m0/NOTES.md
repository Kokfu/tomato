# N2-M0 summary: trust, baseline, and ceiling (N2-M0a + N2-M0b)

Full per-part notes and raw logs live in `docs/night2/m0a/` (commit `033bc08`) and `docs/night2/m0b/`.

- **Baseline (`C:/Kuching3D-night-builds/n1-final`, built from Night 1 end `1139856` / `1c0276e`):**
  - First-visit gzipped transfer (`n2-m0a` gate): `2.13 MB` app + `0.56 MB` map data (`105` files, `0` extra character GLBs, `0` reference photos).
  - Desktop `load-probe` ready median: `4056 ms` (M0a pair) / `4292 ms` (M0b pair), `72–73` shader programs at ready (vs `65` at M5c: `+2` `cityGlow` wall variants, `+1` `Rain`, `+4` `man.glb` Skin/Hair + depth, `+1` `pools`).
- **After `N2-M0a` + `N2-M0b` (`C:/Kuching3D-night-builds/n2-m0b`):**
  - Credits & Licences modal on start + pause menus; honest building text in `index.html`; `?v=` `DATA_HASH` on all `/data/kuching/*` fetches; procedural walker VAT (`casual-character.glb` no longer fetched unless chosen); `production`, `character-p5`, and `gps` e2e fixed.
  - V5 hidden beyond `(lowRadius + 0.25) * 256 m` from old town and split into 3 street-block kits (`+3..+6` draw calls, `-10k..-33k` max triangles on phone bench A/C/E).
  - Hero-chunk `'low'` LOD + near-prop culling: India Street `-1_-1` `lowMed` `+5.8%` (`2,636 -> 2,788` tris), City Mosque `-2_-1` `lowMed` `+9.2%` (`2,170 -> 2,370` tris), Courthouse `0_-1` `lowMed` `-16.6%` (`5,200 -> 4,336` tris) — all within the `<= +12%` per-place guide.
  - Waterfront shadow-pass programs pre-warmed behind loading screen (`0` depth compiles walking spawn -> Waterfront; `load-probe` ready `4652 ms`, `+8.4% <= +20%`, `0` pan frames > 200 ms).
  - Cold phone 3-pair medians (`A / C / E` p95): `47.5 / 44.9 / 38.2 ms` vs `n1-final` `45.0 / 48.1 / 37.4 ms` (`+5.6% / -6.7% / +2.1%`, all `<= +15%`, `0` compile stalls > 200 ms).
