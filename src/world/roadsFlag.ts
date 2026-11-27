// N2-M2 road-realism flag helper (`?roads=0` = Night 1 roads; default on in browser, off in Node unit tests).
import { getFlags } from '../flags.ts';
import type { RoadData } from './types.ts';

export const ROAD_BRIDGE = 1;
export const ROAD_TUNNEL = 2;
export const ROAD_INFERRED = 4;
export const ROAD_ONEWAY = 8;
export const ROAD_ROUNDABOUT = 16;
export const ROAD_LINK = 32;
export const ROAD_SUSPENSION = 64;
export const ROAD_DEEP_TUNNEL = 128;

let override: boolean | null = null;
const listeners: (() => void)[] = [];

export function roadsEnabled(): boolean {
  return override ?? getFlags().roads;
}

export function setRoads(v: boolean | null): void {
  override = v;
  for (const fn of listeners) fn();
}

export function onRoadsFlagChange(fn: () => void): void {
  listeners.push(fn);
}

/** Active carriageway width in centimetres (`r.rw` when `roads` is enabled, else Night 1 `r.w`). */
export function roadWidthCm(r: RoadData): number {
  return roadsEnabled() && r.rw !== undefined ? r.rw : r.w;
}
