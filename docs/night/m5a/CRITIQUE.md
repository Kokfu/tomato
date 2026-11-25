# M5a tour critique (hero places 1 and 2: Main Bazaar + Waterfront, Carpenter Street)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`,
taken from the production build of this milestone. Same frozen cameras as M0 (`tools/dev/city-tour.json`).
Desktop: 60 fps median in all 14 views; the lowest 5 s minimum is 54 (view 01, the first view after loading) (`desktop/fps.json`).
The two places have their own fixed cameras, eight each, with before and after: `waterfront/`, `carpenter/`
(tables in `../m5-main-bazaar-waterfront.md` and `../m5-carpenter-street.md`).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | M3 | M4 | M5a | What changed in M5a, and what still hurts |
|---|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | 3.5 | 3.5 | Unchanged: this camera stands on Jalan Gambier, 300 m west of the promenade that was rebuilt |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | 4 | Unchanged: it looks up a side street; the kapcai at the kerb are behind the camera |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 4 | The grey slab is now the side of a building: dado, barred window, timber doors, a tiled pent roof on brackets; beyond it the street continues as hand-built rows with lanterns and boards. The wall still fills the left 45 % of the frame (the frozen camera stands 0.6 m from it), and it is plain plaster |
| 04 | India Street | 2 | 2 | 2 | 2.5 | 2.5 | 2.5 | Unchanged (hero place 3) |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | 3.5 | 3.5 | Unchanged |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | 3.5 | 3.5 | Unchanged (hero place 4) |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | 4 | 4 | Unchanged (hero place 5) |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | 2.5 | 2.5 | Unchanged (hero place 6) |
| 09 | Satok | 1 | 1 | 1.5 | 3 | 3 | 3 | Unchanged |
| 10 | The Spring | 1 | 1 | 2 | 3 | 3 | 3 | Unchanged |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | 4 | 4 | Unchanged |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | 4 | 4 | Unchanged |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | The bank now carries the paved walk in terracotta bays, the ring-panel railing, festoon lights between the lamps, palms and benches in front of the DUN. Paving is flat colour bays, not the real swirl mosaic; nobody is on it |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | **3.5** | **3.5** | 3.46 -> 3.54 unrounded: two of fourteen tour cameras look at the rebuilt places |

## The two places, judged from their own cameras (harshly)

**Kuching Waterfront promenade: about 3 -> 4.**
1. It now has the things that make the walk recognisable: railing with rings, festoon lights, palms, paving that is not
   bare concrete. From the walk (wf-01, wf-02, wf-03) it reads as a riverside promenade in Kuching.
2. Still wrong: the machine-detected footprints on the walk are drawn as tile-roofed bungalows, where the real ones are
   open food kiosks and pavilions. No tensile canopies. The paving pattern is a stand-in.
3. The Square Tower forecourt (wf-04) is tidy but generic, and three "houses" still crowd the tower.
4. Empty: no people, no hawkers, no moving boats (M6).

**Main Bazaar frontage: 4 -> 4.** Kapcai rows at the kerb are the only change. The facades are still statistical.

**Carpenter Street east of Jalan China: about 3 -> 4.5 (as good as Jalan China for form, below it for evidence).**
1. Same kit, light and depth as Jalan China: real five-foot ways, shopfront variety, cables, lanterns, boards.
2. Evidence is the weakness: every lot is Approximate, where Jalan China has photographed lots. Colours and window
   types are a plausible palette, not this street's.
3. The lots step a few centimetres with the terrain model; a resident would expect a level street.
4. The 5 m neck at the Jalan China corner (mapped outline error) is too narrow for the real street.
5. Empty of people and moving traffic (M6).

## Three worst problems now, citywide
1. Named landmarks are missing or generic (08 mosque, 09 market, 07 cat statue) and India Street is an empty mall
   (the remaining hero places).
2. The world is empty of vehicles and people (M6).
3. Buildings outside the hero places repeat and have flat fronts (M3's list).
