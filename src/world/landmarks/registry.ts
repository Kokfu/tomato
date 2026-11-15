// Custom landmark model registry: the single source of truth for structures that are drawn by a
// dedicated glTF model instead of the generic procedural building generators.
//
// Pure data (no three.js, no I/O): imported by the data pipeline (tools/generate-world), the model
// builder (tools/landmarks), the tests and the runtime.
//
// Geography rule: a definition never contains coordinates. Its position, orientation and extent
// are DERIVED at build time from the mapped source features it names (tools/generate-world/
// landmark-sites.ts) and written to public/data/kuching/landmark-sites.json. Where the mapped data
// is not sufficient, a definition may carry a measured dimension (never a position) with its
// evidence; that is an explicit local architectural override and is reported as such.
import type { ArchClass } from '../types.ts';

export type VerificationStatus =
  /** Form reconstructed from references; dimensions partly estimated. Not a survey. */
  | 'approximation'
  /** Compared against reference photographs from matching viewpoints; listed deviations remain. */
  | 'reference-matched'
  /** Dimensions taken from drawings or an on-site survey. */
  | 'surveyed';

export interface Measured {
  /** Metres. */
  m: number;
  /** Where the number comes from and how uncertain it is. */
  basis: string;
}

export type SiteSpec =
  | {
      /**
       * The structure IS a mapped footprint (nothing is cut out of a larger block). Its front is the
       * long side of the footprint nearest the named street.
       */
      type: 'footprint';
      footprint: string;
      frontStreet: string;
      /** Open structure (gate, pavilion): people and roads pass through; only its supports block. */
      open?: boolean;
    }
  | {
      /** The structure stands on a mapped plot; its front is the plot edge facing `frontStreet`. */
      type: 'plot';
      /** OSM ref of the plot outline, e.g. "way/123". */
      plot: string;
      /** Name of the mapped street the front faces. */
      frontStreet: string;
      /** Width override, centred on the plot axis (the mapped plot keeps position and depth). */
      width?: Measured;
    }
  | {
      /**
       * The structure stands directly opposite another landmark, inside a mapped host footprint:
       * its axis is the other landmark's axis, its front the host wall that axis meets.
       */
      type: 'opposite';
      of: string;
      /** OSM ref of the host building footprint the structure occupies part of. */
      host: string;
      width: Measured;
      /** Depth range behind the host's street wall, metres. `to: null` = to the back of the host. */
      depth: { from: number; to: number | null; basis: string };
      /** Mapped points that must fall inside the derived site (cross-check of the derivation). */
      mustContain: string[];
      /** Stand on the same base level as this other site (two parts of one continuous floor). */
      levelWith?: string;
    };

export interface LandmarkLod {
  /** File inside `model.dir`. */
  file: string;
  /** Shown while the player is closer than this (metres). The last LOD is the distant model. */
  maxDistance: number;
}

export interface LandmarkReference {
  title: string;
  url: string;
  /** Licence of the reference material, when known. References are looked at, never copied. */
  license?: string;
  usedFor: string;
}

export interface LandmarkDefinition {
  /** Stable registry id (also the model directory name and `BuildingData.lm`). */
  id: string;
  /** Bumped whenever the model or its placement rule changes. */
  version: number;
  name: string;
  nameLocal?: string;
  /** Human-readable real-world location (documentation only; never used for placement). */
  location: string;
  category: ArchClass;
  /** Legacy landmark-list kind (minimap icon / navigation list). */
  listKind: 'landmark' | 'worship' | 'civic' | 'museum';
  sources: {
    /** OSM refs that establish WHAT this is (identity), most authoritative first. */
    identity: string[];
    /** OSM building footprints (way refs) the structure occupies wholly or in part. */
    footprints: string[];
    /** Business / use points that belong to this landmark (current use, not form). */
    places?: string[];
  };
  site: SiteSpec;
  model: {
    /** Directory under public/, holding the LOD files and meta.json. */
    dir: string;
    lods: LandmarkLod[];
    /** Extra rotation about +Y on top of the derived site orientation (degrees). */
    yawOffsetDeg: number;
    scale: number;
  };
  dimensions: { width: Measured; depth: Measured; height: Measured };
  references: LandmarkReference[];
  verification: { status: VerificationStatus; reviewed: string; matches: string[]; approximations: string[] };
}

const IPACK = 'https://www.ipacktravel.com/post/kuching-eats-lau-ya-keng-foodcourt-%E9%98%B3%E6%98%A5%E5%8F%B0%E8%8C%B6%E5%AE%A4-kuching-old-street';
const COMMONS_TEMPLE = 'https://commons.wikimedia.org/wiki/File:%E5%8F%A4%E6%99%8B%E4%BA%9A%E8%BE%BE%E8%A1%97%E7%8E%84%E5%A4%A9%E4%B8%8A%E5%B8%9D%E5%BA%99.jpg';
const AERIAL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

export const LANDMARK_REGISTRY: LandmarkDefinition[] = [
  {
    id: 'hiang-thian-siang-ti-temple',
    version: 1,
    name: 'Hiang Thian Siang Ti Temple',
    nameLocal: '玄天上帝庙',
    location: 'South side of Carpenter Street (Jalan Carpenter), Kuching, Sarawak',
    category: 'chinese_temple',
    listKind: 'worship',
    sources: { identity: ['way/1388134054'], footprints: ['way/236495089'] },
    site: {
      type: 'plot',
      plot: 'way/1388134054',
      frontStreet: 'Jalan Carpenter',
      width: { m: 10.4, basis: 'Roof width measured on aerial imagery (10.2 to 10.8 m at 0.3 m/px) and three-bay facade proportions in photographs; the OSM plot is 8.9 m wide. Uncertainty about 1 m.' },
    },
    model: { dir: 'models/landmarks/hiang-thian-siang-ti-temple', lods: [{ file: 'lod0.glb', maxDistance: 150 }, { file: 'lod1.glb', maxDistance: 900 }], yawOffsetDeg: 0, scale: 1 },
    dimensions: {
      width: { m: 10.4, basis: 'see site.width' },
      depth: { m: 29.4, basis: 'OSM plot way/1388134054 (mean of the two side edges)' },
      height: { m: 7.6, basis: 'Estimated from photographs: front eave about 3.5 m (door 2.3 m plus lintel and beam), rear hall ridge about 7.5 m. Uncertainty about 0.7 m.' },
    },
    references: [
      { title: 'Sarawak Tourism Board: Hiang Thian Siang Ti Temple', url: 'https://www.sarawaktourism.com/web/places-to-visit/town-view/kuching/major-attractions/hiang-thian-siang-ti-temple', usedFor: 'identity, history (rebuilt 1889 after the 1884 fire)' },
      { title: 'Wikimedia Commons: 古晋亚达街玄天上帝庙.jpg (愛子棋枰, 2024)', url: COMMONS_TEMPLE, license: 'CC BY-SA 4.0', usedFor: 'facade from the forecourt: bays, doors, murals, roof, lanterns, lions, censer' },
      { title: 'iPackTravel: Lau Ya Keng Foodcourt (photo collage, 2024)', url: IPACK, usedFor: 'facade from across Carpenter Street: overall proportions, forecourt, bollards, neighbours' },
      { title: 'Esri World Imagery (aerial)', url: AERIAL, usedFor: 'roof plan: forecourt, front hall, central pavilion, rear hall; roof width' },
      { title: 'The Borneo Post: Restoring the glory of a Taoist temple (2019)', url: 'https://www.theborneopost.com/2019/09/01/restoring-the-glory-of-a-taoist-temple/', usedFor: 'roof statues and cut-ceramic ornament' },
    ],
    verification: {
      status: 'reference-matched',
      reviewed: '2026-11-15',
      matches: [
        'single-storey three-bay front hall set back behind an open granite forecourt',
        'green glazed tile roofs in three sections, centre section raised, upswept swallow-tail ridges',
        'coloured ridge ornament, twin dragons and pearl on the centre ridge',
        'red columns and door frames, pink end walls, tiger and dragon wall panels between the doors',
        'stone lions on pedestals, censer under a red canopy, stone ball bollards, rows of red lanterns',
        'roof plan from the air: front hall, central pavilion between light wells, large rear hall',
      ],
      approximations: [
        'site width (10.4 m) and all heights are estimates',
        'ridge figures, dragons, lions and censer are simplified low-polygon forms',
        'wall panels are flat colour compositions, not the real painted reliefs',
        'plaque wording and the interior behind the doors are not reproduced',
        'pavilion and rear hall are modelled from aerial imagery only',
      ],
    },
  },
  {
    id: 'lau-ya-keng-food-court',
    version: 1,
    name: 'Lau Ya Keng Food Court',
    nameLocal: '阳春台茶室',
    location: '19 Carpenter Street, Kuching, Sarawak: north side, directly opposite Hiang Thian Siang Ti Temple',
    category: 'food_court',
    listKind: 'landmark',
    sources: {
      identity: ['node/4989957225'],
      footprints: ['way/233690735'],
      places: ['node/4989957225', 'node/6168638587', 'node/6168660688', 'node/6169628587'],
    },
    site: {
      type: 'opposite',
      of: 'hiang-thian-siang-ti-temple',
      host: 'way/233690735',
      width: { m: 9.6, basis: 'Clear width of the roofed hall measured on aerial imagery (9.6 m at 0.3 m/px); its centre lies 8.8 m from the block corner, the temple axis meets the wall at 9.3 m. Uncertainty about 1 m.' },
      depth: { from: 0, to: 14, basis: 'Street wall to the rear edge of the arched roof on aerial imagery (13.8 m)' },
      mustContain: ['node/4989957225'],
    },
    model: { dir: 'models/landmarks/lau-ya-keng-food-court', lods: [{ file: 'lod0.glb', maxDistance: 130 }, { file: 'lod1.glb', maxDistance: 900 }], yawOffsetDeg: 0, scale: 1 },
    dimensions: {
      width: { m: 9.6, basis: 'see site.width' },
      depth: { m: 14, basis: 'see site.depth' },
      height: { m: 8.4, basis: 'Estimated from interior photographs: flat front roof about 6 m, crown of the arched roof about 8.4 m. Uncertainty about 1 m.' },
    },
    references: [
      { title: 'iPackTravel: Kuching Eats: Lau Ya Keng Foodcourt (2024)', url: IPACK, usedFor: 'street front (sign beam, blinds, red frame), interior (arched roof, lanterns, stalls, tables), view back to the temple' },
      { title: 'Urban Palate: Old Kuching, Carpenter Street part 1: Lao Yea Keng (2015)', url: 'https://urban-palate.blogspot.com/2015/03/old-kuching-carpenter-street-part-1-lao.html', usedFor: 'independent reference: stalls and their signboards' },
      { title: 'Esri World Imagery (aerial)', url: AERIAL, usedFor: 'position on the temple axis, hall width and depth, arched roof' },
      { title: 'OpenStreetMap node 4989957225 (Lau Ya Keng Foodcourt, 19 Jalan Carpenter)', url: 'https://www.openstreetmap.org/node/4989957225', license: 'ODbL 1.0', usedFor: 'identity and cross-check of the derived site' },
    ],
    verification: {
      status: 'reference-matched',
      reviewed: '2026-11-15',
      matches: [
        'open-fronted roofed hall between neighbouring buildings, not a two-storey shoplot',
        'red steel frame with a painted sign beam and roll-up blinds at the street front',
        'flat front roof bay followed by an arched roof on curved ribs',
        'open communal dining floor with round tables, stalls along the side walls, hanging lanterns, tiled floor',
        'directly opposite the temple, on its axis',
      ],
      approximations: [
        'hall width, depth and heights are estimates from imagery and photographs',
        'number and position of stalls and tables are representative, not surveyed',
        'the east strip of the block beside the hall stays a generic building',
      ],
    },
  },
  {
    id: 'yang-choon-tai-opera-stage',
    version: 1,
    name: 'Yang Choon Tai Opera Stage',
    nameLocal: '陽春臺',
    location: 'Rear of Lau Ya Keng Food Court, Carpenter Street, Kuching: the wayang stage facing Hiang Thian Siang Ti Temple',
    category: 'opera_stage',
    listKind: 'landmark',
    sources: { identity: ['node/12779002958'], footprints: ['way/233690735'] },
    site: {
      type: 'opposite',
      of: 'hiang-thian-siang-ti-temple',
      host: 'way/233690735',
      width: { m: 9.6, basis: 'Same bay as the food court hall; the roof over the stage house is wider on aerial imagery (about 11 m) but its walls are not visible. Uncertainty about 1.5 m.' },
      depth: { from: 14, to: null, basis: 'From the rear edge of the arched hall roof to the back of the mapped block (large roof over the stage on aerial imagery)' },
      mustContain: ['node/12779002958'],
      levelWith: 'lau-ya-keng-food-court',
    },
    model: { dir: 'models/landmarks/yang-choon-tai-opera-stage', lods: [{ file: 'lod0.glb', maxDistance: 130 }, { file: 'lod1.glb', maxDistance: 900 }], yawOffsetDeg: 0, scale: 1 },
    dimensions: {
      width: { m: 9.6, basis: 'see site.width' },
      depth: { m: 14.5, basis: 'derived: remaining depth of the host footprint' },
      height: { m: 10.4, basis: 'Estimated: stage roof ridge about 7.2 m from the interior photograph; enclosing roof assumed about 3 m higher. Uncertainty about 1.5 m.' },
    },
    references: [
      { title: 'iPackTravel: Kuching Eats: Lau Ya Keng Foodcourt (2024)', url: IPACK, usedFor: 'the stage seen from the hall: raised platform, lattice screens, two tiled roof tiers; text: "a temple-like structure is still standing on the enclosed stage"' },
      { title: 'OpenStreetMap node 12779002958 (阳春台, amenity=theatre, "Wayang stage")', url: 'https://www.openstreetmap.org/node/12779002958', license: 'ODbL 1.0', usedFor: 'identity and position cross-check' },
      { title: 'Esri World Imagery (aerial)', url: AERIAL, usedFor: 'roof over the stage house behind the arched hall' },
      { title: 'Kuching Old Bazaar (kcholdbazaar.com): Carpenter Street heritage notes', url: 'https://kcholdbazaar.com/category/kob-heritage/page/5', usedFor: 'history: Yang Choon Tai theatre built opposite the temple in 1889' },
    ],
    verification: {
      status: 'approximation',
      reviewed: '2026-11-15',
      matches: [
        'a distinct raised stage structure at the rear of the hall, facing the temple across the street',
        'timber lattice screens between posts, two tiers of tiled roof with upturned corners, name board',
      ],
      approximations: [
        'only one usable photograph of the stage was found: platform height, bay widths and roof heights are estimates',
        'the enclosing stage house (walls and roof) is inferred from aerial imagery',
        'backstage and under-stage spaces are not modelled',
      ],
    },
  },
];

LANDMARK_REGISTRY.push({
  id: 'carpenter-street-harmony-arch',
  version: 1,
  name: 'Carpenter Street Harmony Arch',
  nameLocal: '亲善门 / 亞答街牌坊',
  location: 'West end of Carpenter Street (Jalan Carpenter) at Jalan Tun Abang Haji Openg, Kuching, Sarawak',
  category: 'monument',
  listKind: 'landmark',
  sources: { identity: ['way/1388134059'], footprints: ['way/1388134059'] },
  site: { type: 'footprint', footprint: 'way/1388134059', frontStreet: 'Jalan Tun Abang Haji Openg', open: true },
  model: { dir: 'models/landmarks/carpenter-street-harmony-arch', lods: [{ file: 'lod0.glb', maxDistance: 150 }, { file: 'lod1.glb', maxDistance: 900 }], yawOffsetDeg: 0, scale: 1 },
  dimensions: {
    width: { m: 11.3, basis: 'OSM footprint way/1388134059 (roof outline across the street)' },
    depth: { m: 4.7, basis: 'OSM footprint way/1388134059' },
    height: { m: 8.6, basis: 'Estimated from the photograph against the lorry passing under it (about 3 m tall): clear height about 4.8 m, centre ridge about 8.5 m. Uncertainty about 0.8 m.' },
  },
  references: [
    { title: 'Wikimedia Commons: Chinese-style Gate.jpg (Travelust, 2011)', url: 'https://commons.wikimedia.org/wiki/File:Chinese-style_Gate.jpg', license: 'CC BY 2.0', usedFor: 'east face from inside Carpenter Street: columns, plinths, beams, name board 亞答街, centre and side roofs, colours' },
    { title: 'The Star: Harmony Arch signboard reinstalled at Carpenter Street (2017)', url: 'https://www.thestar.com.my/metro/metro-news/2017/09/28/harmony-arch-signboard-reinstalled-at-carpenter-street', usedFor: 'identity and name (Harmony Arch, launched 2007)' },
    { title: 'OpenStreetMap way 1388134059 (man_made=ceremonial_gate, official_name 亲善门 Harmony Arch)', url: 'https://www.openstreetmap.org/way/1388134059', license: 'ODbL 1.0', usedFor: 'position, footprint, names' },
  ],
  verification: {
    status: 'reference-matched',
    reviewed: '2026-11-15',
    matches: [
      'open gateway across the carriageway: two red granite columns on plinths carry the centre span',
      'stack of painted beams with a stone tablet and a red name board between the columns',
      'orange glazed tile roof with upturned corners over the centre, lower side roofs on grey outer columns over the footways',
    ],
    approximations: [
      'all heights and the column spacing are estimates from one photograph',
      'only the east face was seen: the west face is modelled as its mirror, and its board wording (親善門) is taken from the OSM official name, not read from a photograph',
      'beam paintings, brackets and ridge ornament are simplified',
    ],
  },
});

export function landmarkById(id: string): LandmarkDefinition | undefined {
  return LANDMARK_REGISTRY.find((l) => l.id === id);
}

/** First id used for synthetic building records (landmark sites and the remainders of carved hosts). */
export const SYNTHETIC_ID_BASE = 8_000_000_000_000_000;
