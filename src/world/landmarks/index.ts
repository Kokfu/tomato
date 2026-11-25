import type { LandmarkManager } from '../LandmarkManager.ts';
import { buildDarulHanaBridge, DARUL_HANA_WAYS } from './darulHanaBridge.ts';
import { buildDun, DUN_BUILDING } from './dun.ts';
import { buildFortMargherita, FORT_MARGHERITA_BUILDING } from './fortMargherita.ts';
import { buildAstana, ASTANA_BUILDING } from './astana.ts';
import { buildTuaPekKong, TUA_PEK_KONG_BUILDING } from './tuaPekKong.ts';
import { buildBorneoCulturesMuseum, BORNEO_CULTURES_MUSEUM_BUILDING } from './borneoCulturesMuseum.ts';
import { buildSquareTower, SQUARE_TOWER_BUILDING } from './squareTower.ts';
import { buildOldCourthouse, OLD_COURTHOUSE_BUILDING } from './oldCourthouse.ts';
import { buildFloatingMosque, FLOATING_MOSQUE_BUILDING } from './floatingMosque.ts';
import { buildCatColumn, buildPaifang } from './padungan.ts';
import { CAT_COLUMN, PAIFANG_ID } from '../district/padungan.ts';
import { m5Enabled } from '../district/m5.ts';

/**
 * Register custom landmark models (overrides for generic generated buildings).
 * Called once at start-up, before any chunk is built. Every model is an original procedural
 * APPROXIMATION fitted to mapped OpenStreetMap geometry (footprint or bridge ways); nothing is
 * positioned by hard-coded coordinates. See docs/LANDMARKS.md.
 */
export function registerLandmarks(manager: LandmarkManager): void {
  manager.register({ buildingIds: [], roadIds: DARUL_HANA_WAYS, landmarkId: 'darul-hana', build: buildDarulHanaBridge });
  manager.register({ buildingIds: [DUN_BUILDING], landmarkId: 'dun', build: buildDun });
  manager.register({ buildingIds: [FORT_MARGHERITA_BUILDING], landmarkId: 'fort-margherita', build: buildFortMargherita });
  manager.register({ buildingIds: [ASTANA_BUILDING], landmarkId: 'astana', build: buildAstana });
  manager.register({ buildingIds: [TUA_PEK_KONG_BUILDING], landmarkId: 'tua-pek-kong', build: buildTuaPekKong });
  manager.register({ buildingIds: [BORNEO_CULTURES_MUSEUM_BUILDING], landmarkId: 'borneo-cultures-museum', build: buildBorneoCulturesMuseum });
  manager.register({ buildingIds: [SQUARE_TOWER_BUILDING], landmarkId: 'square-tower', build: buildSquareTower });
  manager.register({ buildingIds: [OLD_COURTHOUSE_BUILDING], landmarkId: 'old-courthouse', build: buildOldCourthouse });
  manager.register({ buildingIds: [FLOATING_MOSQUE_BUILDING], landmarkId: 'floating-mosque', build: buildFloatingMosque });
  // N1-M5 hero places 5 and 6: registered only with the flag on, so that `?m5=0` keeps the generic buildings.
  if (m5Enabled()) {
    manager.register({ buildingIds: [], chunks: [CAT_COLUMN.key], landmarkId: 'cat-statue', build: buildCatColumn });
    manager.register({ buildingIds: [PAIFANG_ID], build: buildPaifang });
  }
}
