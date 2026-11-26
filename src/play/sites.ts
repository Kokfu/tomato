// N1-M7: the real places that jobs go to. Pure (no three.js, no DOM): shared by the data tool
// (tools/generate-world/build-jobs.ts), the game and the unit tests.
//
// A job never shows a business name. A place is described by what kind of place it is (its mapped category, grouped
// below) and by the mapped street it stands on: "a restaurant, Jalan Padungan". Only the game's landmarks, which are
// public places already listed in the GPS, are called by their mapped names.

/** Groups of mapped place categories, in the order stored in jobs.json. */
export const GROUPS = ['food', 'stay', 'care', 'office', 'school', 'shop', 'worship', 'sight'] as const;
export type Group = (typeof GROUPS)[number];

/** What a place of each group is called in a job (never a name). */
export const GROUP_LABEL: Record<Group, string> = {
  food: 'a restaurant', stay: 'a hotel', care: 'a clinic or hospital', office: 'an office', school: 'a school', shop: 'a shop', worship: 'a place of worship', sight: 'a place to visit',
};

const BY_CAT: Record<string, Group> = {};
const put = (g: Group, cats: string) => { for (const c of cats.split(' ')) BY_CAT[c] = g; };
put('food', 'restaurant cafe coffee_shop fast_food casual_eatery food_court food_and_drink bakery eatery asian_restaurant chinese_restaurant malaysian_restaurant seafood_restaurant noodle_restaurant pizza_restaurant burger_restaurant chicken_restaurant indian_restaurant japanese_restaurant korean_restaurant thai_restaurant vegetarian_restaurant breakfast_and_brunch_restaurant dessert_shop ice_cream bubble_tea tea_room');
put('stay', 'hotel lodging guest_house hostel motel resort inn bed_and_breakfast');
put('care', 'hospital clinic doctors dentist medical_center health_and_medical pharmacy');
put('office', 'government_office office bank community_and_government post_office townhall police courthouse embassy professional_service corporate_office');
put('school', 'school place_of_learning college university preschool kindergarten education library');
put('shop', 'convenience supermarket shop mall shopping_mall shopping_center department_store marketplace fashion_and_apparel_store electronics_store food_and_beverage_store hardware_home_and_garden_store grocery_store clothing_store books');
put('worship', 'place_of_worship muslim_place_of_worship christian_place_of_worship buddhist_place_of_worship hindu_place_of_worship church mosque temple');
put('sight', 'park attraction historic_site museum garden viewpoint playground stadium sports_centre');

/** The group of a mapped category, or null for categories no job uses. */
export function groupOf(cat: string | undefined | null): Group | null {
  return cat ? BY_CAT[cat] ?? null : null;
}

/** One place a job can start or end at. `name` only for the game's landmarks; `street` when a mapped street is known. */
export interface Site { x: number; z: number; group: Group | 'landmark'; name?: string; street?: string }

/** jobs.json: every usable place as [x, z, group index] triples in whole metres. */
export interface JobsFile { v: 1; groups: readonly string[]; sites: number[] }

export function sitesOf(file: JobsFile): Site[] {
  const out: Site[] = [];
  for (let i = 0; i + 2 < file.sites.length; i += 3) {
    const g = file.groups[file.sites[i + 2]] as Group | undefined;
    if (g && (GROUPS as readonly string[]).includes(g)) out.push({ x: file.sites[i], z: file.sites[i + 1], group: g });
  }
  return out;
}

/** "a restaurant, Jalan Padungan" / "Kuching Waterfront": how a job names a place. */
export function describeSite(s: Site): string {
  if (s.group === 'landmark') return s.name ?? 'a landmark';
  return s.street ? `${GROUP_LABEL[s.group]}, ${s.street}` : GROUP_LABEL[s.group];
}
