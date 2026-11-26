// N1-M7: saved progress. One small JSON value in localStorage; every read and write is wrapped, because storage can be
// missing, full, blocked (private windows) or hold something another version wrote. Pure apart from the storage it is
// handed, so the unit tests run it under Node with a stub.
import type { DriveKind } from '../vehicle/VehiclePhysics.ts';

export const SAVE_KEY = 'k3d.save';
export const SAVE_VERSION = 1;

export interface SavedVehicle { kind: DriveKind; x: number; z: number; heading: number; damage: number; paint: number }

export interface SaveState {
  v: number;
  /** Ringgit in the wallet, and everything ever earned. */
  money: number;
  earned: number;
  /** Jobs finished, by kind. */
  delivery: number;
  taxi: number;
  /** The vehicle the player last drove and where it was left (null: the car still waits in Jalan China). */
  vehicle: SavedVehicle | null;
}

export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function freshSave(): SaveState {
  return { v: SAVE_VERSION, money: 0, earned: 0, delivery: 0, taxi: 0, vehicle: null };
}

const KINDS: readonly string[] = ['hatch', 'kapcai', 'taxi', 'pickup'];
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** A saved value read back, or null when it is absent, damaged or from another version. Nothing in it is trusted. */
export function parseSave(text: string | null | undefined): SaveState | null {
  if (!text) return null;
  let o: unknown;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== SAVE_VERSION) return null;
  const money = num(r.money, 0, 1e9), earned = num(r.earned, 0, 1e9), delivery = num(r.delivery, 0, 1e7), taxi = num(r.taxi, 0, 1e7);
  if (money === null || earned === null || delivery === null || taxi === null) return null;
  let vehicle: SavedVehicle | null = null;
  const v = r.vehicle as Record<string, unknown> | null | undefined;
  if (v && typeof v === 'object') {
    const x = num(v.x, -1e5, 1e5), z = num(v.z, -1e5, 1e5), heading = num(v.heading, -1e3, 1e3), damage = num(v.damage, 0, 1), paint = num(v.paint, 0, 0xffffff);
    if (x !== null && z !== null && heading !== null && damage !== null && paint !== null && typeof v.kind === 'string' && KINDS.includes(v.kind)) {
      vehicle = { kind: v.kind as DriveKind, x, z, heading, damage, paint: Math.round(paint) };
    }
  }
  return { v: SAVE_VERSION, money: Math.round(money * 10) / 10, earned: Math.round(earned * 10) / 10, delivery: Math.floor(delivery), taxi: Math.floor(taxi), vehicle };
}

function storage(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The saved progress, or null (nothing saved, storage unavailable, or the value is unusable). Never throws. */
export function loadSave(store: Store | null = storage()): SaveState | null {
  try { return store ? parseSave(store.getItem(SAVE_KEY)) : null; } catch { return null; }
}

/** Write the progress. False when it could not be stored (the game carries on without saving). Never throws. */
export function writeSave(state: SaveState, store: Store | null = storage()): boolean {
  try {
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

/** Forget the saved progress. Never throws. */
export function clearSave(store: Store | null = storage()): boolean {
  try { if (!store) return false; store.removeItem(SAVE_KEY); return true; } catch { return false; }
}
