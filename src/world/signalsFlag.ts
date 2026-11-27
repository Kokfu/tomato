// N2-M3: runtime switches and shared timing math for synchronised R/A/G traffic signals.
// Pure TypeScript (no three.js, no DOM): shared by tools/generate-world/build-signals.ts,
// src/world/StreetFurniture.ts, src/life/traffic.ts, src/life/Life.ts, and unit tests.
import { getFlags } from '../flags.ts';

let forceSignals: boolean | null = null;
let forceInferred: boolean | null = null;

/** Override `signals` flag for tests; pass `null` to follow `getFlags().signals`. */
export function setSignals(on: boolean | null): void {
  forceSignals = on;
}

/** True when N2-M3 working per-approach signals are enabled (`?signals=0` disables). */
export function signalsEnabled(): boolean {
  return forceSignals ?? getFlags().signals;
}

/** Override `inferredSignals` flag for tests; pass `null` to follow `getFlags().inferredSignals`. */
export function setInferredSignals(on: boolean | null): void {
  forceInferred = on;
}

/** True when audit-inferred main-road signal junctions are enabled (`?inferredSignals=0` disables). */
export function inferredSignalsEnabled(): boolean {
  return forceInferred ?? getFlags().inferredSignals;
}

/** Signal cycle in seconds: two phases of 15 s green + 2 s amber + 1 s all-red clearance = 36 s. */
export const SIGNAL_TIMING = { cycle: 36, green: 15, amber: 2 } as const;

/** Angle (0..pi/2) between two undirected bearings. */
export function axialDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/**
 * Phase group (0 or 1) for traffic approaching along bearing `approachRad` (`atan2(tx, tz)`)
 * at a junction whose primary corridor has bearing `refRad` (`0..pi`). With `crossRad` (the crossing corridor's
 * bearing) an approach joins whichever corridor it is nearer, so a road crossing at 40-50 degrees still gets its own
 * phase; without it the split is the fixed 45 degree window of night 1.
 */
export function signalPhaseGroup(approachRad: number, refRad: number, crossRad?: number): 0 | 1 {
  const d = axialDelta(approachRad, refRad);
  if (crossRad === undefined) return d < Math.PI / 4 ? 0 : 1;
  return d <= axialDelta(approachRad, crossRad) ? 0 : 1;
}

/** Below this spread (radians) every approach lies on one corridor (a mid-block or pelican crossing): one phase. */
export const ONE_CORRIDOR_SPREAD = (25 * Math.PI) / 180;

/**
 * Bearing (0..pi) of the crossing corridor: the approach farthest from `refRad`, or `refRad + pi/2` when every
 * approach lies within `ONE_CORRIDOR_SPREAD` of it.
 */
export function crossCorridor(approachRads: readonly number[], refRad: number): number {
  let best = -1, cross = refRad + Math.PI / 2;
  for (const a of approachRads) {
    const d = axialDelta(a, refRad);
    if (d > best) { best = d; cross = a; }
  }
  if (best < ONE_CORRIDOR_SPREAD) cross = refRad + Math.PI / 2;
  return ((cross % Math.PI) + Math.PI) % Math.PI;
}

/**
 * Signal aspect ('green' | 'amber' | 'red') and seconds elapsed in red for `(jctId, group)` at `timeSec`.
 * Matches the GPU shader in `Materials.lampGlow` (`ENV.uSignalTime`).
 */
export function junctionSignalAt(
  timeSec: number,
  jctId: number,
  group: 0 | 1,
): { state: 'green' | 'amber' | 'red'; redFor: number } {
  const { cycle, green, amber } = SIGNAL_TIMING;
  const t = (((timeSec + jctId * 7.3 - group * (cycle / 2)) % cycle) + cycle) % cycle;
  const state = t < green ? 'green' : t < green + amber ? 'amber' : 'red';
  return { state, redFor: Math.max(0, t - green - amber) };
}

export interface DecodedSignalExtra {
  jctId: number;
  group: 0 | 1;
  inferred: boolean;
  /** True when the approach carriageway is >= 8 m wide (draws a Malaysian overhead mast-arm repeater). */
  wide: boolean;
}

/** Pack N2-M3 signal pole metadata into a positive integer (`extra >= 1`; `0` = Night 1 legacy pole). */
export function encodeSignalExtra(s: DecodedSignalExtra): number {
  return 1 + (s.jctId & 255) + ((s.group & 1) << 8) + ((s.inferred ? 1 : 0) << 9) + ((s.wide ? 1 : 0) << 10);
}

/** Decode `FURN.signal` `extra` (`null` for Night 1 legacy `extra === 0`). */
export function decodeSignalExtra(extra: number): DecodedSignalExtra | null {
  if (extra <= 0) return null;
  const v = extra - 1;
  return {
    jctId: v & 255,
    group: ((v >> 8) & 1) as 0 | 1,
    inferred: ((v >> 9) & 1) === 1,
    wide: ((v >> 10) & 1) === 1,
  };
}

/** On-disk format of `public/data/kuching/signals.json`. */
export interface SignalJunctionRecord {
  id: number;
  x: number;
  z: number;
  lat: number;
  lon: number;
  refDeg: number;
  /** Bearing of the crossing corridor (degrees, 0..180); approaches nearer it than `refDeg` run in phase group 1. */
  crossDeg?: number;
  inferred: boolean;
  roads: string[];
  osmSignalNodes: number[];
  /** World coordinates `[x, z]` of every road-graph node controlled by this physical junction. */
  nodes: [number, number][];
  approaches: number;
}

export interface SignalsFile {
  version: number;
  junctions: SignalJunctionRecord[];
}
