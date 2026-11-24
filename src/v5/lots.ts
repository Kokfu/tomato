// Authored lot table for the hybrid approach (B): one entry per lot of each Carpenter Street row,
// left to right as seen from the street. Entries override the rule-based lot.
//
// Honesty note. Lot WIDTHS and POSITIONS come from the mapped block outlines (lot lines themselves
// are not mapped, so each frontage is divided evenly). Only the entries marked "ref:" are taken
// from a photograph; everything marked "typical" is a plausible Carpenter Street form in the muted
// whitewash-and-timber palette seen in the Wikimedia Commons street photographs, NOT a survey of
// that particular building. A street-level photo walk is needed to replace them (see the report).
import { hex } from './kit.ts';
import type { LotSpec } from './shophouse.ts';
import { c1Enabled } from './c1flag.ts';
import { ROWS, rowFrame } from './geo.ts';

type O = Partial<LotSpec>;
const W = { white: 0xe9e6dc, warm: 0xe4dccb, grey: 0xd3d5d0, blue: 0xc6d3d9, cream: 0xe7dbb9, green: 0xd3dcc8, pink: 0xe3a79c, orange: 0xe9a04a, stained: 0xdcd8cb };
const J = { teal: 0x5f8284, slate: 0x6f7f95, brown: 0x6a4a37, green: 0x3f5c4a, grey: 0x8a8f8c, blue: 0x4d6f8a };
const typical = 'typical: plausible form for this street, not surveyed';

export const LOT_OVERRIDES: Record<string, O[]> = {
  // South row west of the temple. Lot 0 is the east end, beside the temple forecourt.
  S1: [
    { storeys: 3, wall: hex(W.pink), joinery: hex(J.grey), win: 'slider', windows: 2, hoods: true, shop: 'roller', roof: 'zinc', parapet: false, blinds: false, ac: 1, basis: 'ref: Commons temple photograph, right side - three-storey pink building with hooded windows overlooking the forecourt' },
    { wall: hex(W.white), joinery: hex(J.teal), win: 'louvre', shop: 'folding', roof: 'tile', hoods: false, blinds: true, basis: typical },
    { wall: hex(0xd9c08a), joinery: hex(J.brown), win: 'louvre', shop: 'open', roof: 'tile', hoods: true, awning: hex(0x2f6a8a), basis: typical },
    { wall: hex(W.grey), joinery: hex(J.grey), win: 'slider', shop: 'glass', roof: 'zinc', parapet: true, ac: 1, blinds: false, basis: 'mapped: convenience store (OSM node 5641077721); modernised front is typical for the chain, facade above not surveyed' },
    { wall: hex(W.warm), joinery: hex(J.green), win: 'arched', shop: 'grille', roof: 'tile', basis: typical },
    { wall: hex(0xa9c4cf), joinery: hex(J.slate), win: 'louvre', shop: 'grille', roof: 'tile', hoods: true, blinds: true, basis: typical },
    { wall: hex(W.white), joinery: hex(J.brown), win: 'casement', shop: 'open', roof: 'zinc', awning: hex(0x8a2a22), basis: typical },
  ],
  // South row east of the temple. Lot 3 is the west end, beside the temple forecourt.
  S2: [
    { wall: hex(W.warm), joinery: hex(J.teal), win: 'louvre', shop: 'open', roof: 'tile', hoods: true, basis: typical },
    { wall: hex(W.white), joinery: hex(J.blue), win: 'casement', shop: 'glass', roof: 'tile', blinds: true, basis: typical },
    { wall: hex(W.green), joinery: hex(J.green), win: 'louvre', shop: 'folding', roof: 'zinc', basis: typical },
    // The photograph shows a pink wall at the left edge of the forecourt with open sky above it, so this building may be lower
    // or set back; its real height could not be established (a single-storey version was tried and read as unfinished).
    { wall: hex(W.pink), joinery: hex(J.brown), win: 'louvre', shop: 'open', roof: 'tile', blinds: false, basis: 'ref (colour only): Commons temple photograph, left edge - pink plastered wall beside the forecourt; height unverified' },
  ],
  // North row west of the food court. Lot 8 is the east end, beside the food court.
  N1: [
    { wall: hex(W.cream), joinery: hex(J.brown), win: 'casement', shop: 'open', roof: 'tile', hoods: true, basis: typical },
    { wall: hex(W.white), joinery: hex(J.teal), win: 'louvre', shop: 'folding', roof: 'tile', blinds: true, basis: typical },
    { wall: hex(W.grey), joinery: hex(J.slate), win: 'louvre', shop: 'grille', roof: 'zinc', basis: typical },
    { wall: hex(0xd8b98a), joinery: hex(J.green), win: 'arched', shop: 'grille', roof: 'tile', hoods: true, awning: hex(0x2f6a45), basis: typical },
    { wall: hex(W.white), joinery: hex(J.grey), win: 'slider', shop: 'roller', roof: 'tile', parapet: true, ac: 1, basis: typical },
    { wall: hex(W.blue), joinery: hex(J.blue), win: 'louvre', shop: 'grille', roof: 'tile', blinds: true, basis: typical },
    { wall: hex(W.cream), joinery: hex(J.brown), win: 'louvre', shop: 'open', roof: 'tile', basis: typical },
    { wall: hex(0xb9cdb0), joinery: hex(J.green), win: 'casement', shop: 'folding', roof: 'zinc', hoods: true, basis: typical },
    { wall: hex(W.stained), joinery: hex(J.grey), win: 'slider', windows: 2, shop: 'open', roof: 'zinc', ac: 1, blinds: false, basis: 'ref: iPackTravel street-front photograph, left of the food court - weathered off-white two-storey building' },
  ],
  N2: [
    { wall: hex(W.orange), joinery: hex(J.grey), win: 'slider', windows: 2, shop: 'roller', roof: 'zinc', ac: 1, blinds: false, hoods: false, basis: 'ref: iPackTravel street-front photograph, right of the food court - orange-yellow building with air-conditioner units' },
  ],
  N3: [
    { wall: hex(W.white), joinery: hex(J.teal), win: 'louvre', shop: 'grille', roof: 'tile', hoods: true, basis: typical },
    { wall: hex(W.warm), joinery: hex(J.brown), win: 'louvre', shop: 'open', roof: 'tile', blinds: true, basis: typical },
    { wall: hex(W.grey), joinery: hex(J.slate), win: 'casement', shop: 'grille', roof: 'tile', basis: typical },
    { wall: hex(W.cream), joinery: hex(J.green), win: 'arched', shop: 'open', roof: 'tile', hoods: true, basis: typical },
  ],
};

// C1a experiment (?c1=1 only): the Upper China Street corner. Nothing below runs, and LOT_OVERRIDES is untouched, with the flag off.
// The nine new lots are 'typical' forms (not surveyed) from the palette above; no plants (condition C10). Shop names and the
// shopfront kind of a named lot still come from the mapped places by the existing rule. Arched party-wall openings on the lots
// that meet a corner return, so the return's end wall matches its neighbour.
if (c1Enabled()) {
  const row = (id: string) => ROWS.find((r) => r.id === id)!;
  /** Skew of a corner lot's left side against the mapped side edge (radians), from the row frame and the side row's direction. */
  const skew = (rowId: string, sideRowId: string): number => {
    const fr = rowFrame(row(rowId)), sr = row(sideRowId), l = Math.hypot(sr.b[0] - sr.a[0], sr.b[1] - sr.a[1]);
    const ex = (sr.b[0] - sr.a[0]) / l, ez = (sr.b[1] - sr.a[1]) / l;
    return Math.atan2(-(ex * fr.dx + ez * fr.dz), -(ex * fr.nx + ez * fr.nz));
  };
  const c1 = 'typical (C1a): plausible form for Upper China Street, not surveyed';
  const plain: O = { plants: 0, sideArch: true, basis: c1 };
  // S2 lot 0 (Carpenter Street corner) wraps into Upper China Street; rise = UW lot 1 floor above S2 lot 0 (real terrain, gate 2 probe).
  LOT_OVERRIDES.S2 = LOT_OVERRIDES.S2.map((o, i) => (i === 0 ? { ...o, sideArch: true, wrap: { side: 'L', len: 12, skew: skew('S2', 'UW'), rise: 0.081 } } : o));
  // Upper China west face (S2 block), lot 0 south, lot 1 against the S2 corner return.
  LOT_OVERRIDES.UW = [
    { ...plain, wall: hex(W.blue), joinery: hex(J.slate), win: 'arched', shop: 'folding', roof: 'zinc', hoods: false },
    { ...plain, wall: hex(W.cream), joinery: hex(J.brown), win: 'louvre', shop: 'roller', roof: 'tile', hoods: true },
  ];
  // Upper China east face (building 236495235), lot 0 is the Carpenter Street corner and wraps into it; rise = UX lot 2 above UE lot 0.
  LOT_OVERRIDES.UE = [
    { ...plain, wall: hex(W.white), joinery: hex(J.teal), win: 'louvre', shop: 'roller', roof: 'tile', hoods: true, wrap: { side: 'L', len: 12, skew: skew('UE', 'UX'), rise: 0.189 } },
    { ...plain, wall: hex(W.green), joinery: hex(J.green), win: 'casement', shop: 'open', roof: 'zinc', hoods: false },
    { ...plain, wall: hex(W.grey), joinery: hex(J.blue), win: 'arched', shop: 'folding', roof: 'tile', hoods: false },
    { ...plain, wall: hex(W.warm), joinery: hex(J.brown), win: 'louvre', shop: 'open', roof: 'tile', hoods: true },
  ];
  // Carpenter Street face of 236495235, lot 0 east, lot 2 against the UE corner return.
  LOT_OVERRIDES.UX = [
    { ...plain, wall: hex(W.cream), joinery: hex(J.green), win: 'slider', shop: 'roller', roof: 'zinc', hoods: false, ac: 1 },
    { ...plain, wall: hex(W.blue), joinery: hex(J.teal), win: 'louvre', shop: 'folding', roof: 'tile', hoods: false },
    { ...plain, wall: hex(W.stained), joinery: hex(J.grey), win: 'arched', shop: 'open', roof: 'tile', hoods: true },
  ];
}
