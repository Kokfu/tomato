// Curated list of Kuching landmarks. Only names and match patterns live here: the coordinates are
// always taken from the matching mapped OpenStreetMap feature at build time.
export interface LandmarkDef {
  id: string;
  name: string;
  kind: 'landmark' | 'street' | 'bridge' | 'museum' | 'worship' | 'civic' | 'park';
  match: RegExp[];
  /** Match a named street (highway way) instead of a building / POI. */
  road?: boolean;
  priority: number;
}

export const LANDMARK_DEFS: LandmarkDef[] = [
  { id: 'waterfront', name: 'Kuching Waterfront', kind: 'landmark', match: [/Kuching Waterfront(?! Management)/i, /Tebingan Kuching/i, /Waterfront Promenade/i], priority: 1 },
  { id: 'darul-hana', name: 'Darul Hana Bridge', kind: 'bridge', match: [/Jambatan Darul Hana/i, /Darul Hana Bridge/i], priority: 1 },
  { id: 'dun', name: 'Sarawak State Legislative Assembly (DUN)', kind: 'civic', match: [/Dewan Undangan Negeri/i, /State Legislative Assembly/i, /^Sarawak State Assembly$/i], priority: 1 },
  { id: 'fort-margherita', name: 'Fort Margherita', kind: 'landmark', match: [/Fort Margherita/i, /Kubu Margherita/i], priority: 1 },
  { id: 'astana', name: 'The Astana', kind: 'civic', match: [/^(The )?Astana( Negeri)?( Sarawak)?$/i, /Astana Negeri/i], priority: 1 },
  { id: 'tua-pek-kong', name: 'Tua Pek Kong Temple', kind: 'worship', match: [/Tua Pek Kong/i, /Siew San Teng/i], priority: 1 },
  { id: 'borneo-cultures-museum', name: 'Borneo Cultures Museum', kind: 'museum', match: [/Borneo Cultures? Museum/i, /Muzium Budaya Borneo/i], priority: 1 },
  { id: 'main-bazaar', name: 'Main Bazaar', kind: 'street', match: [/Main Bazaar/i], road: true, priority: 1 },
  { id: 'carpenter-street', name: 'Carpenter Street', kind: 'street', match: [/Jalan Carpenter/i, /Carpenter Street/i], road: true, priority: 1 },
  { id: 'india-street', name: 'India Street', kind: 'street', match: [/^Jalan India$/i, /^India Street/i], road: true, priority: 1 },
  { id: 'jalan-gambier', name: 'Jalan Gambier', kind: 'street', match: [/^Jalan Gambier$/i, /Gambier Street/i], road: true, priority: 1 },
  { id: 'jalan-padungan', name: 'Jalan Padungan', kind: 'street', match: [/^Jalan Padungan$/i], road: true, priority: 1 },
  { id: 'sarawak-museum', name: 'Sarawak Museum', kind: 'museum', match: [/^Sarawak Museum/i, /Muzium Sarawak/i], priority: 2 },
  { id: 'square-tower', name: 'Square Tower', kind: 'landmark', match: [/Square Tower/i], priority: 2 },
  { id: 'old-courthouse', name: 'Old Courthouse', kind: 'landmark', match: [/Old Court ?House/i], priority: 2 },
  { id: 'kuching-mosque', name: 'Kuching City Mosque', kind: 'worship', match: [/Masjid Bandaraya Kuching/i, /Masjid Bahagian Kuching/i, /Kuching (City|Divisional) Mosque/i], priority: 2 },
  { id: 'floating-mosque', name: 'Masjid India (Floating Mosque)', kind: 'worship', match: [/Masjid India/i, /Floating Mosque/i, /Masjid Terapung/i], priority: 2 },
  { id: 'cat-statue', name: 'Cat Statue (Padungan)', kind: 'landmark', match: [/Cat Statue/i, /Great Cat/i, /Tugu Kucing/i, /Kuching Cat/i], priority: 2 },
  { id: 'plaza-merdeka', name: 'Plaza Merdeka', kind: 'landmark', match: [/Plaza Merdeka/i], priority: 2 },
  { id: 'padang-merdeka', name: 'Padang Merdeka', kind: 'park', match: [/Padang Merdeka/i], priority: 2 },
  { id: 'chinese-history-museum', name: 'Chinese History Museum', kind: 'museum', match: [/Chinese History Museum/i], priority: 2 },
  { id: 'textile-museum', name: 'Textile Museum', kind: 'museum', match: [/Textile Museum/i, /Muzium Tekstil/i], priority: 3 },
  { id: 'st-thomas', name: "St. Thomas' Cathedral", kind: 'worship', match: [/St\.? Thomas'?s? Cathedral/i], priority: 2 },
  { id: 'st-joseph', name: "St. Joseph's Cathedral", kind: 'worship', match: [/St\.? Joseph'?s? Cathedral/i], priority: 3 },
  { id: 'reservoir-park', name: 'Reservoir Park', kind: 'park', match: [/Reservoir Park/i, /Taman Reservoir/i], priority: 3 },
  { id: 'satok-bridge', name: 'Satok Bridge', kind: 'bridge', match: [/Jambatan (Gantung )?Satok/i, /Satok (Suspension )?Bridge/i], priority: 3 },
  { id: 'kubah-ria', name: 'Kubah Ria', kind: 'landmark', match: [/Kubah Ria/i], priority: 3 },
  { id: 'satok-market', name: 'Medan Niaga Satok', kind: 'landmark', match: [/Medan Niaga Satok/i, /Satok (Weekend )?Market/i], priority: 3 },
  { id: 'the-spring', name: 'The Spring', kind: 'landmark', match: [/^The Spring/i], priority: 3 },
  { id: 'orchid-garden', name: 'Orchid Garden', kind: 'park', match: [/Orchid (Garden|Park)/i, /Taman Orkid/i], priority: 3 },
];
