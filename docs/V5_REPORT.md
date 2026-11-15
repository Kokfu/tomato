# Kuching 3D V5: high-fidelity rendering experiment

Date: 2026-11-15. Scope: Carpenter Street between the Harmony Arch and Jalan China (about 80 m),
around Hiang Thian Siang Ti Temple and Lau Ya Keng Food Court. Nothing was committed, pushed or
deployed. The rest of the city is unchanged.

**Headline.** V5 is a real step up from V4 in geometry, materials and lighting, and the hybrid
approach is clearly the better of the two proofs of concept. It is **not** GTA-level realism. An
independent image-only critic scored it about 4.6 / 10 against V4's 3.4 to 3.7 (GTA V = 9 to 10) and
described it as "low-poly indie / early-2000s game", no longer flat boxes but not modern.

## How to see it

Run the app, walk to Carpenter Street (or open `/?at=carpenter`), then press **1 / 2 / 3** or use
the bar at the top:

| Key | Mode | |
| --- | --- | --- |
| 1 | V4 Existing | untouched V4 rendering |
| 2 | V5 Procedural (A) | generated in the browser, no asset downloads |
| 3 | V5 Hybrid (B) | same street shell plus authored GLB landmarks, atlas, lot table |

The switch keeps the player position, camera, time of day and render resolution. `?render=a` or
`?render=b` starts directly in a V5 mode. `V` toggles first-person (already in V4, eye height 1.62 m).

## 1. Why V4 looks blocky (diagnosis)

Evidence: `src/world/Materials.ts`, `WorldManager.ts`, `BuildingBuilder.ts`, and the V4 captures in
`docs/screenshots/v5/v4/`.

| Area | What V4 does | Responsible for the blocky look? |
| --- | --- | --- |
| Shading model | every material is `MeshLambertMaterial`: no roughness, no specular, no reflections | **Yes, major.** Glass, glazed tile, paint and asphalt all respond to light identically |
| Light balance | sun 2.45 against a hemisphere fill of 1.3, about 1.9 : 1 | **Yes, major.** Shadows barely darken anything, so form does not read |
| Ambient occlusion | none, apart from one darker vertex row at wall feet | **Yes, major.** Objects look pasted on; arcades and recesses are as bright as open walls |
| Facade geometry | one extrusion per mapped outline; windows, shutters and doors are a painted atlas on a flat quad | **Yes, major** |
| Materials | flat vertex colour times 2D value noise; saturated pastel palette | **Yes.** No relief, no weathering, colours unlike the real whitewashed street |
| Roofs | flat-shaded planes with a tile stripe drawn in the shader | Yes, from above |
| Road | one uniform dark navy ribbon | Yes |
| Shadows | 2048 px over a 220 m box (11 cm texels), PCF soft | Partly: soft but coarse |
| Tone mapping | Khronos Neutral, no HDR | Minor |
| Anti-aliasing | canvas MSAA on desktop | Not a cause |
| Camera | 60 degree third-person, sensible | Not a cause |

Not the cause: street furniture count or colour choice. More props on Lambert boxes would not help.

Adaptable techniques from modern open-world games, and what was used: PBR metal/roughness materials
(used), image-based specular lighting (used), baked plus screen-space AO (used), tight shadow
frusta near the camera (used; cascades not needed at this scale), HDR with filmic tone mapping
(used), geometry LOD and authored hero assets among procedural filler (used, in a limited form).
Not practical here: ray-traced GI, virtual texturing, photogrammetry-scale texture sets.

## 2. Abyssal Garden analysis (the 97 KB WebGPU demo)

Read from its source (`shaders.js`, `main.js`, `world.js`, `quality.js`, `prompt.txt`).

- **Materials:** one tileable detail texture baked at load, sampled triplanar at four scales, with
  rule-based albedo (strata, algae gated by normal). Lambert plus Blinn-Phong, not PBR.
- **Depth:** one 4096 px shadow map baked once; a 3D texture of openness and skylight replaces
  SSAO; animated caustics; half-resolution light shafts; HDR, bloom, ACES.
- **No repetition:** SDF terrain meshed once on the CPU; instanced props with per-instance texture
  offset and seed; leaves built in the vertex shader.
- **Fog:** analytic per-channel extinction with a closed-form in-scatter term.
- **Instancing:** cell-sorted instance buffers, CPU frustum culling per cell, LOD by pipeline.
- **Adaptive:** quality tiers, GPU-timestamp feedback that cuts pixels first, then draw distance.
- **Review process:** six fixed poses, a critic that sees only renders, a scripted benchmark.
- **Size:** pure WebGPU and WGSL, no libraries, zero assets, everything generated at load.

| Transfers to Kuching | Used in V5 |
| --- | --- |
| Baked tileable detail texture, triplanar, multi-scale | Yes (`src/v5/materials.ts`) |
| Rule-based weathering gated by height and normal | Yes (rain streaks, rising damp, rust) |
| Baked sky occlusion instead of only SSAO | Yes, as vertex AO from the generators |
| Fixed poses plus image-only critic | Yes (section 9) |
| Quality tiers and dynamic resolution | Yes (existing scaler kept, V5 tiers added) |
| Per-instance variation, cell-sorted instancing | Not yet: the section is one merged mesh per material |
| Analytic height fog | Not yet (existing exponential fog kept) |

**Cannot help:** nothing in it encodes a real place. Its organic noise hides inaccuracy underwater
and reads as wrong on recognisable architecture. Facade proportions, the temple ridge, sign text
and the street layout have to come from references and authored content.

**WebGPU:** not adopted. The current renderer was tested first: V5 materials and lighting on
WebGL2 cost the same as V4 on this machine (section 9), so the renderer was not the bottleneck.
The work that mattered was content and shading.

## 3 and 4. The two proofs of concept

Same geography, same materials, lighting and camera; only the content source differs.

| | A: procedural | B: hybrid |
| --- | --- | --- |
| Lots | hashed rule per lot | authored table (`src/v5/lots.ts`) over the same generator |
| Landmarks | generic class grammars fitted to the mapped site | reconstructed from photographs, shipped as GLB |
| Textures | none downloaded; signs drawn at run time | plus one painted 1024 px atlas |
| Street dressing | kerbs, drains, lamps, cables, bins, plants | plus pushcart, parked cars, lantern strings |
| Extra download | 0 | 464 KB (three GLBs 336 KB, atlas 126 KB) |
| Triangles in the section | 88,816 in 25 draw calls | 126,711 in 52 draw calls |
| Build time in the browser | about 0.15 to 0.25 s | about 0.6 to 1.9 s including asset fetch |
| Critic average (two rounds) | 3.6, 3.2 | 4.8, 4.6 |
| Landmarks recognisable | No ("a bus shelter", "an empty shed") | Yes for the food court front; yes, as a simplified model, for the temple |
| Development effort | one generator, about 500 lines | plus about 800 lines of model scripts and atlas art per three landmarks |

**Selected: B, on top of A's shell.** Procedural generation carried the ordinary shophouses well
and added nothing recognisable at the landmarks; the critic rated A *below V4* for likeness
because V4 already had the landmark dressing. Authored content is what makes a place identifiable.

## 5. What was built

- `src/v5/kit.ts`: geometry kit with no three.js dependency (runs in the browser and in Node).
  Walls are slabs pierced by openings with real reveals.
- `src/v5/shophouse.ts`: lot generator. Geometry, not paint: recessed windows, hinged louvred
  shutters at varied angles, frames, sills, hoods, pilasters, cornices, piers with plinth and
  capital, joisted arcade ceiling, arched party-wall openings, five shopfront types with interiors,
  eaves with rafter tails, gutters, downpipes, ridge caps, party-wall parapets, air-conditioners,
  blinds, awnings.
- `src/v5/materials.ts`: 21 PBR materials (aged plaster, concrete, terracotta tile, glazed tile,
  roller shutter, louvre, timber, gloss paint, asphalt, floor tile, granite, corrugated zinc, glass,
  fabric, foliage and others). Procedural detail in world space, bump from screen derivatives,
  patterns faded by pixel footprint to avoid moire.
- `src/v5/pipeline.ts`: sun to sky ratio about 6 : 1, sky-derived environment map for specular,
  tight shadow frustum, AgX tone mapping; optional HDR target with half-resolution GTAO and FXAA.
- `src/v5/street.ts`: asphalt following the mapped centre line and terrain, kerbs, covered drains
  with gratings, lamps, utility cables, cars, pushcart, lantern strings.
- `src/v5/ambience.ts`: synthesised street hum, birds, food-court murmur by distance. Foliage sways.
- `src/v5/controller.ts`: the A/B switch and measurements.

Hooks added to V4 files are small and inert unless a V5 mode is active: the V4 builders skip the
replaced blocks, their signs, furniture and the section's road ribbon; `CollisionWorld` accepts
extra walkable floors; `LandmarkModels` can hide a site. V5 code is a separate lazy chunk.

## 6. Landmark reconstruction

Position, orientation and footprint are unchanged from the V4 site derivation (OSM plot, aerial
measurements), so existing collision still applies.

| | Verified from a photograph | Estimated |
| --- | --- | --- |
| Temple | wide low front hall; green glazed roof with raised centre bay; upswept ridge ends with coloured ornament and two dragons; pink walls; three red-framed doorways; tiger panel left and dragon panel right of the centre door; two red columns; lions on pedestals; censer under a red canopy; stone balls; lantern rows with paper tags; tall pink building on the right; gate canopy on the right wall | every height; bay widths; everything behind the front hall; plaque wording (not legible, shown as 上帝廟); couplet wording (generic) |
| Food court | open bay between two shophouses; red steel posts and roof edge; sign beam 陽春臺 between diamond panels; four blinds with banners; arched translucent roof on ribs; stalls along both walls; round tables; orange building on the right, off-white on the left; cars at the kerb | all heights; stall and table layout; stall sign wording beyond the mapped stalls |
| Opera stage | timber stage under two tiers of tiled roof with upturned corners, at the far end of the hall | all dimensions (one interior photograph) |
| Shophouses | 3 of 25 lots have a photographic basis (colour and storeys); block outlines and lot count are from the map | 22 lots are "typical" forms, labelled as such in `lots.ts` |

All atlas artwork is original Canvas 2D painting in the style of the real panels; no photograph or
third-party texture is used.

**Needs photographing or measuring:** a street-level walk of both rows (every facade); the temple
plaque and couplets; the building left of the temple forecourt (height unresolved); the stage from
the front; eave and ridge heights of the temple; the real road markings.

## 7 and 8. Screenshots and references

Captures, HUD hidden, 1280 x 720, same poses: `docs/screenshots/v5/v4/`, `/a/`, `/b/`, six files each
(`01-temple-exterior` to `06-third-person-walk`). Regenerate with
`node tools/dev/v5-shots.ts docs/screenshots/v5`.

References (linked, not copied into the repository):

- Temple: [Commons, 古晋亚达街玄天上帝庙.jpg, CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:%E5%8F%A4%E6%99%8B%E4%BA%9A%E8%BE%BE%E8%A1%97%E7%8E%84%E5%A4%A9%E4%B8%8A%E5%B8%9D%E5%BA%99.jpg)
- Food court front, interior and stage: [iPackTravel article](https://www.ipacktravel.com/post/kuching-eats-lau-ya-keng-foodcourt-%E9%98%B3%E6%98%A5%E5%8F%B0%E8%8C%B6%E5%AE%A4-kuching-old-street)
- Street character: [Commons category Carpenter Street, Kuching](https://commons.wikimedia.org/wiki/Category:Carpenter_Street,_Kuching)

## 9. Independent visual quality gate

Three separate critic runs, each given only image files and the reference photographs, with no
code and none of the developer's claims.

| Round | V4 | A | B | Notes |
| --- | --- | --- | --- | --- |
| 1 | 3.7 | 3.6 | 4.8 | B best in all six views |
| 2 (after fixes) | 3.4 | 3.2 | 4.6 | different critic instance, so not comparable with round 1 |
| Paired, B round 1 against B final | | | 3.5 to 4.0 | "visibly improved, but only slightly" |

Fixed after the reviews: shadow leaks through single-sided roofs, V4 road markings showing through,
moire on blinds, sparse temple ridge (figures, larger dragons, raised tile rows), dim food court,
slab chairs, blob plants, missing cars, oversized lamp pole, wire shadows, white car glass.

One attempted fix was withdrawn: making the building left of the temple single-storey (to match
the open sky in the photograph) read as unfinished geometry and was reverted.

**The critic did not approve the scene.** Its remaining objections, in its own ranking:

1. No people. The brief excluded NPC systems, so this is a deliberate gap.
2. Flat, unweathered materials at readable scale; featureless road with no markings.
3. Temple ornament still too thin and small in frame; murals hidden by lanterns.
4. Low-poly props: cars, plants, bins, the character.
5. Flat lighting in shade: no bounce light, weak reflections.
6. Soft image in the high tier (FXAA plus half-resolution AO).
7. Distant V4 buildings are visibly a different, cruder style.

## 10. Performance and size

Machine: Intel UHD integrated graphics (ANGLE D3D11), Edge, 1280 x 720, adaptive resolution and
vsync off. Raw data: `docs/perf-v5.json`, `docs/perf-v5-mobile.json`.

| Preset | V4 | A | B |
| --- | --- | --- | --- |
| Medium (direct render, 2048 shadow) | 7 to 10 ms | 12 to 37 ms | 12 to 20 ms |
| High (HDR, AO, FXAA, 4096 shadow) | 13 to 19 ms | 24 to 34 ms | 27 to 38 ms |
| Low, 390 x 844 at 2x, emulated on the same GPU | 4 to 5 ms | 5 to 8 ms | 7 to 10 ms |

- Medium figures are from two runs and were noisy on this GPU (p95 up to 93 ms). Typical B frames
  were 12 to 17 ms, so 60 fps is reached on medium but not guaranteed; high runs at 26 to 37 fps.
- 4x MSAA on the HDR target was measured at 4 to 8 fps here and is not used.
- The mobile row is desktop emulation, **not** a phone. No real mid-range phone was tested.
- No discrete GPU was available.

| Network transfer | Bytes | Gzip |
| --- | --- | --- |
| Main bundle, before V5 | 777 KB | not recorded |
| Main bundle, with V5 hooks | 782 KB | 226 KB |
| V5 code chunk, loaded on first switch | 147 KB | 49 KB |
| Meshopt decoder (B only) | 22 KB | 6 KB |
| Temple, food court, stage GLB (LOD 0) | 163 + 145 + 28 KB | 54 + 40 + 8 KB |
| Atlas (WebP; 527 KB as PNG) | 126 KB | already compressed |
| **Extra for A / for B** | **147 KB / 611 KB** | **49 KB / about 280 KB** |

Meshopt plus quantisation shrinks the landmark geometry from about 1.8 MB (float32) to 336 KB.
KTX2 was not produced: no Basis encoder is installed here, so the atlas ships as WebP and occupies
5.6 MB of GPU memory uncompressed.

| GPU memory (estimates from formats and sizes, not driver readings) | A | B |
| --- | --- | --- |
| Section geometry | 7.1 MB | 7.8 MB |
| Section textures (sign canvas, detail, atlas) | 5.7 MB | 11.0 MB |
| High-tier render targets, shadow map, environment | 164 MB | 164 MB |

The geometry is uploaded as float32; quantising it at run time would cut it by roughly half.

## 11. Recommendation and expansion plan

**Architecture:** keep three.js on WebGL2. Adopt the V5 material library, lighting and the kit
generator city-wide, with authored hybrid content only where identity matters. Revisit WebGPU when
instancing density or compute-side baking becomes the limit, not before.

1. **Photo survey first** (blocks everything else on accuracy): Carpenter Street, both rows.
2. **Relight the whole city** with the V5 light rig and convert V4 materials to the PBR library, so
   the style boundary at the edge of the section disappears. Cost on medium is about V4's.
3. **Move generation into the chunk pipeline:** run the kit in a worker per chunk, emit quantised
   buffers, three LODs (full, simplified, extrusion) switched by distance.
4. **Instancing** for repeated parts (shutters, chairs, lanterns, bins) with per-instance seed.
5. **Landmark programme:** registry-driven GLB plus atlas per landmark; Harmony Arch, Tua Pek Kong
   and the Main Bazaar row next. Budget about 150 KB and 25k triangles each.
6. **Texture pipeline:** install a Basis encoder, ship KTX2, and add one licensed tileable set for
   plaster, tile and asphalt where procedural detail is the visible weakness.
7. **Close the critic's gaps:** road markings and patching from survey, better vehicles and
   vegetation as authored instanced assets, then static and later animated people.
8. **Measure on real hardware:** a mid-range Android phone and a discrete-GPU desktop.

## Not done or not verified

- Browser end-to-end tests were run after the V5 changes (Edge, Intel UHD integrated GPU): 25 of 25
  pass, with 45 of 45 unit tests and `tsc`. Getting there needed three test fixes and no app change:
  - "W/A/S/D move relative to the camera" used wall-clock waits, so one slow frame shortened the
    measured distance. It failed 2 runs in 8 on the unmodified V4 commit and 2 in 8 with V5. It now
    uses simulated 1/60 s frames and counts frames (thresholds unchanged): 10 of 10.
  - `waitChunks` could return straight after a teleport, before the chunk manager had re-centred, so
    "chunks stream in ahead of the player" started walking on an unloaded chunk. The same stale
    reading occurs on the V4 commit (3 of 6 direct probes), although there the test itself passed 3
    of 3, and it occurs with the V5 code blocked from loading. Why the V5 tree loses this race more
    often was not established. `waitChunks` now waits two frames and for the chunk under the player.
    That test's timeout was also raised from 180 s to 300 s: the walk alone takes 164 to 172 s at
    60 fps with or without V5, so this is a loosened timeout, justified by that measurement.
  - The layout test loaded the page twice; the second load aborted place-file downloads of the first
    and those were reported as errors (3 failures in 6). It now loads once: 8 of 8. This one was not
    checked against the V4 commit.
- With V5 loaded but V4 shown, frame rate and chunk-build times were within run-to-run noise of the
  same page with the V5 code blocked (ten paired walks, about 60 fps in both).
- The N2 lot (east of the food court) has a visible arcade that collision still treats as solid.
- V5 lighting is defined for daytime; switching to evening falls back to V4 lighting.
- Distance LOD for the V5 landmark GLBs exists on disk (`lod1`) but the runtime always loads `lod0`.
- World chunk streaming of V5 content is not implemented; the section is built in one step.
