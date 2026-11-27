// In-game Credits & Licences modal (N2-M0a).
// Lists every third-party dataset, model, animation clip, texture and reference photograph recorded in
// docs/ASSETS.md and public/reference/manifest.json, including the verbatim MIT licence notice required
// for the Microsoft Rocketbox animations and every CC-BY / CC-BY-SA attribution.

const ROCKETBOX_MIT = `MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export interface CreditEntry {
  readonly item: string;
  readonly author: string;
  readonly licence: string;
  readonly url?: string;
}

export const MAP_DATA_CREDITS: readonly CreditEntry[] = [
  { item: 'Roads, rivers, buildings, places & landmarks', author: 'OpenStreetMap contributors', licence: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
  { item: 'Buildings theme & Places dataset', author: 'Overture Maps Foundation', licence: 'ODbL 1.0 / CDLA-Permissive-2.0', url: 'https://docs.overturemaps.org/attribution/' },
  { item: 'Global ML Building Footprints (via Overture Maps)', author: 'Microsoft', licence: 'ODbL 1.0', url: 'https://github.com/microsoft/GlobalMLBuildingFootprints' },
  { item: 'Open Buildings footprints (via Overture Maps)', author: 'Google', licence: 'CC BY 4.0', url: 'https://sites.research.google/open-buildings/' },
  { item: 'Copernicus DEM GLO-30 elevation', author: 'DLR e.V. (2010–2014) & Airbus Defence and Space GmbH (2014–2018), EU / ESA COPERNICUS', licence: 'Copernicus DEM Licence', url: 'https://spacedata.copernicus.eu/' },
];

export const MODEL_TEXTURE_CREDITS: readonly CreditEntry[] = [
  { item: 'Selectable character meshes, skins, hair & clothing (man, woman, teen-boy, teen-girl, young-boy, young-girl) and picker portraits', author: 'MakeHuman community (makehuman_system) & MPFB2 core data; shirt prints procedural by this project', licence: 'CC0 1.0', url: 'https://static.makehumancommunity.org/about/license.html' },
  { item: 'Character gait & turn animations (Idle, Walk, Run, TurnLeft, TurnRight) and retired prototype avatars (adult-man, adult-woman)', author: 'Microsoft Rocketbox (Copyright (c) 2020 Microsoft)', licence: 'MIT', url: 'https://github.com/microsoft/Microsoft-Rocketbox' },
  { item: '"Casual Character" (casual-character.glb) & Universal Animation Library v3.0 Jump_Loop clip', author: 'Quaternius', licence: 'CC0 1.0', url: 'https://quaternius.com' },
  { item: '"Asphalt 03" road textures (asphalt_03_*.webp, asphalt.webp)', author: 'Charlotte Baglioni & Dario Barresi (Poly Haven)', licence: 'CC0 1.0', url: 'https://polyhaven.com/a/asphalt_03' },
  { item: '"Sparse Grass" ground texture (grass.webp)', author: 'Amal Kumar (Poly Haven)', licence: 'CC0 1.0', url: 'https://polyhaven.com/a/sparse_grass' },
  { item: '"Red Laterite Soil Stones" ground texture (laterite.webp)', author: 'Amal Kumar (Poly Haven)', licence: 'CC0 1.0', url: 'https://polyhaven.com/a/red_laterite_soil_stones' },
  { item: '"Concrete Floor Worn 001" ground texture (concrete.webp)', author: 'Dimitrios Savva & Rico Cilliers (Poly Haven)', licence: 'CC0 1.0', url: 'https://polyhaven.com/a/concrete_floor_worn_001' },
];

/** Shipped comparison photographs in public/reference/*.jpg (loaded only in OP comparison mode) plus consulted Wikimedia Commons photos. */
export const PHOTO_CREDITS: readonly CreditEntry[] = [
  { item: 'jalan-china-a-17155538163.jpg, jalan-china-b-17776339811.jpg, jalan-china-c-17588324240.jpg (Kuching City, 2015) & consulted Kuching Waterfront (17586892988)', author: 'Marufish', licence: 'CC BY-SA 2.0', url: 'https://commons.wikimedia.org/wiki/File:Kuching_City_(17155538163).jpg' },
  { item: 'main-bazaar-five-foot-way.jpg ("A five foot way in Kuching, Sarawak") & consulted "Chinese Temple on Carpenter Street, Kuching"', author: 'chipmunk_1', licence: 'CC BY-SA 2.0', url: 'https://commons.wikimedia.org/wiki/File:A_five_foot_way_in_Kuching,_Sarawak.jpg' },
  { item: 'main-bazaar-arcade.jpg ("010984 Kuching (Borneo)")', author: 'Matthias Bethke', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:010984_Kuching_(Borneo).jpg' },
  { item: 'waterfront-east-end.jpg ("Kuching Waterfront (15811151426)")', author: 'Bernard DUPONT', licence: 'CC BY-SA 2.0', url: 'https://commons.wikimedia.org/wiki/File:Kuching_Waterfront_(15811151426).jpg' },
  { item: 'carpenter-street-gate.jpg ("Chinese-style Gate")', author: 'Travelust from Southeast Asia', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Chinese-style_Gate.jpg' },
  { item: 'india-street-1.jpg, india-street-2.jpg ("India Street, Kuching, Sarawak") & consulted "The Waterfront, Kuching, Sarawak"', author: 'Fabio Achilli', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:India_Street,_Kuching,_Sarawak.jpg' },
  { item: 'square-tower-front.jpg ("Square Tower, Kuching")', author: 'Horatio Wong', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Square_Tower,_Kuching.jpg' },
  { item: 'square-tower-side.jpg ("Square Tower 03") & old-courthouse-courtyard.jpg ("Old Court House Complex, Kuching 01")', author: 'Yeo Jiun Tzen', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Square_Tower_03.jpg' },
  { item: 'old-courthouse-clock-tower.jpg ("KuchingOldCourtHouse")', author: 'Mattun0211', licence: 'CC0 1.0', url: 'https://commons.wikimedia.org/wiki/File:KuchingOldCourtHouse.JPG' },
  { item: 'padungan-cat-column.jpg ("Cat Monument Kuching")', author: 'Medelam', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Cat_Monument_Kuching.jpg' },
  { item: 'padungan-gate-great-cat.jpg ("Chinatown welcome gate at Jalan Padungan")', author: 'Stefan Krasowski', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Chinatown_welcome_gate_at_Jalan_Padungan,_Kuching,_Sarawak,_Malaysia.jpg' },
  { item: 'padungan-1928-shophouse.jpg ("Jalan Padungan 1928 shophouse architecture")', author: 'Esther Siaw', licence: 'CC BY 4.0', url: 'https://commons.wikimedia.org/wiki/File:Jalan_Padungan_1928_shophouse_architecture,_Kuching,_Sarawak,_Malaysia.jpg' },
  { item: 'padungan-shophouse-block.jpg ("Kuching, Sarawak, Malaysia 04")', author: 'StormChase', licence: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Kuching,_Sarawak,_Malaysia_04.jpg' },
  { item: 'city-mosque-front.jpg ("Kuching Town Mosque")', author: 'Mx. Granger', licence: 'CC0 1.0', url: 'https://commons.wikimedia.org/wiki/File:Kuching_Town_Mosque.jpg' },
  { item: 'city-mosque-from-the-cemetery.jpg ("Masjid Bandaraya Kuching")', author: 'Wee Hong', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Masjid_Bandaraya_Kuching.jpg' },
  { item: 'floating-mosque-night.jpg ("Floating mosque near Kuching river")', author: 'Cerevisae', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Floating_mosque_near_Kuching_river.jpg' },
  { item: 'Consulted: "Kuching Waterfront - Flickr - Dustin Iskandar"', author: 'Dustin Iskandar', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Kuching_Waterfront_-_Flickr_-_Dustin_Iskandar.jpg' },
];

export { ROCKETBOX_MIT };

function renderList(entries: readonly CreditEntry[]): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'credits-list';
  for (const e of entries) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = e.item;
    li.append(strong, ` — ${e.author} (${e.licence})`);
    if (e.url) {
      li.append(' · ');
      const a = document.createElement('a');
      a.href = e.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'source';
      li.append(a);
    }
    ul.append(li);
  }
  return ul;
}

/** Populate `#credits-body` once when the modal is first opened. */
export function populateCredits(container: HTMLElement): void {
  if (container.childElementCount > 0) return;
  const h3 = (text: string) => {
    const el = document.createElement('h3');
    el.textContent = text;
    return el;
  };
  const note = (text: string) => {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = text;
    return p;
  };
  const pre = document.createElement('pre');
  pre.className = 'credits-mit';
  pre.textContent = ROCKETBOX_MIT;

  container.append(
    h3('Map & Elevation Data'),
    renderList(MAP_DATA_CREDITS),
    h3('3D Characters, Animations & Textures'),
    renderList(MODEL_TEXTURE_CREDITS),
    note('Vehicles, ambient walkers, procedural buildings, street furniture and landmarks are generated by project code; footsteps, street ambience, rain, thunder, engine and horn audio are synthesised in the browser.'),
    h3('Microsoft Rocketbox Licence Notice (MIT)'),
    pre,
    h3('Reference Photographs (Wikimedia Commons)'),
    note('Downscaled copies in public/reference/ are shown unmodified in the developer comparison panel and remain under their respective licences (CC BY-SA files are share-alike).'),
    renderList(PHOTO_CREDITS),
  );
}
