// N1-M7: jobs. Pure (no three.js, no DOM): offers, the two stages of a job, and the money, all unit-tested under Node.
//
// Two kinds: a food delivery (collect at a place that serves food, take it to a customer at another mapped place) and
// a taxi fare (collect a passenger, take them where they want to go). Places are real mapped places (src/play/sites.ts);
// the customers, the fares and the tips are invented.
import type { Site } from './sites.ts';

export type JobKind = 'delivery' | 'taxi';

export interface Offer {
  id: number;
  kind: JobKind;
  from: Site;
  to: Site;
  /** Road distance from where the offer was made to the pick-up, and from the pick-up to the drop-off (metres). */
  approach: number;
  trip: number;
  /** The fare before any tip (ringgit). */
  fare: number;
}

export interface Job {
  offer: Offer;
  stage: 'pickup' | 'dropoff';
  /** Seconds since the pick-up, and collisions since then. */
  time: number;
  crashes: number;
}

export interface Payout { fare: number; tip: number; total: number; onTime: boolean }

/** Money in ringgit, rounded to ten sen. */
export const sen = (rm: number): number => Math.round(rm * 10) / 10;
export const formatRM = (rm: number): string => `RM ${rm.toFixed(2)}`;

/** Who may start and end each kind of job. A delivery never ends at a place of worship or a park; a fare may. */
export const FROM: Record<JobKind, readonly string[]> = { delivery: ['food'], taxi: ['stay', 'sight', 'care', 'shop', 'landmark'] };
export const TO: Record<JobKind, readonly string[]> = { delivery: ['stay', 'office', 'school', 'care', 'shop'], taxi: ['stay', 'sight', 'care', 'shop', 'worship', 'office', 'landmark'] };

/** Fare by road distance: a flag-fall plus a rate per kilometre. */
export function fareFor(kind: JobKind, tripMetres: number): number {
  const km = Math.max(0, tripMetres) / 1000;
  return sen(kind === 'taxi' ? 4 + 3.2 * km : 3 + 2.6 * km);
}

/** Seconds a careful driver needs for the trip: the tip is full inside it and gone at twice it. */
export function parTime(tripMetres: number): number {
  return 25 + Math.max(0, tripMetres) / 7;
}

/**
 * What a finished job pays. The tip is up to 40 % of the fare for hot food (30 % from a passenger), falls to nothing
 * between the par time and twice the par time, and loses a fifth for every collision on the way.
 */
export function payout(job: Job): Payout {
  const { offer } = job, par = parTime(offer.trip);
  const late = Math.max(0, Math.min(1, (job.time - par) / par));
  const care = Math.max(0, 1 - 0.2 * job.crashes);
  const tip = sen(offer.fare * (offer.kind === 'taxi' ? 0.3 : 0.4) * (1 - late) * care);
  return { fare: offer.fare, tip, total: sen(offer.fare + tip), onTime: job.time <= par };
}

/** Straight-line bands for the three offers shown at a time: how far away the pick-up is, and how long the trip is. */
const BANDS: readonly { near: [number, number]; trip: [number, number] }[] = [
  { near: [0, 420], trip: [180, 520] },
  { near: [150, 900], trip: [500, 1300] },
  { near: [300, 1800], trip: [1200, 3200] },
];

export interface OfferOptions {
  /** Road distance between two points in metres, or null when no mapped road connects them. */
  road: (ax: number, az: number, bx: number, bz: number) => number | null;
  /** 0..1 generator. */
  rand: () => number;
  /** Candidates tried per offer before it is given up (each costs up to two route searches). */
  tries?: number;
  /** First id to give out. */
  nextId?: number;
}

/**
 * Up to three offers of one kind from where the player is: a short one close by, a middling one and a long one. Each
 * is checked on the road network, so every offer can be driven.
 */
export function makeOffers(kind: JobKind, sites: readonly Site[], x: number, z: number, o: OfferOptions): Offer[] {
  const from = sites.filter((s) => FROM[kind].includes(s.group)), to = sites.filter((s) => TO[kind].includes(s.group));
  const out: Offer[] = [], used = new Set<Site>();
  let id = o.nextId ?? 1;
  const pick = <T>(list: T[]): T | null => (list.length ? list[Math.floor(o.rand() * list.length) % list.length] : null);
  for (const band of BANDS) {
    const starts = from.filter((s) => { const d = Math.hypot(s.x - x, s.z - z); return d >= band.near[0] && d <= band.near[1] && !used.has(s); });
    for (let t = 0; t < (o.tries ?? 6); t++) {
      const a = pick(starts);
      if (!a) break;
      const ends = to.filter((s) => { const d = Math.hypot(s.x - a.x, s.z - a.z); return s !== a && d >= band.trip[0] && d <= band.trip[1] && !used.has(s); });
      const b = pick(ends);
      if (!b) continue;
      const approach = o.road(x, z, a.x, a.z);
      if (approach === null) continue;
      const trip = o.road(a.x, a.z, b.x, b.z);
      // (a trip the road network makes much longer than it looks is not offered: a river or a one-way maze lies between)
      if (trip === null || trip < 80 || trip > band.trip[1] * 2.5 || approach > band.near[1] * 3 + 400) continue;
      used.add(a); used.add(b);
      out.push({ id: id++, kind, from: a, to: b, approach, trip, fare: fareFor(kind, trip) });
      break;
    }
  }
  return out;
}

export function startJob(offer: Offer): Job {
  return { offer, stage: 'pickup', time: 0, crashes: 0 };
}

/** The place the job is heading for now. */
export function goalOf(job: Job): Site {
  return job.stage === 'pickup' ? job.offer.from : job.offer.to;
}

/**
 * Has the player arrived? Within `reach` metres of the point the route stops at (or of the place itself), and, in a
 * vehicle, nearly at rest.
 */
export function arrived(px: number, pz: number, speed: number, goal: { x: number; z: number }, stop: { x: number; z: number } | null, reach = 14): boolean {
  if (speed > 2.5) return false;
  if (stop && Math.hypot(stop.x - px, stop.z - pz) <= reach) return true;
  return Math.hypot(goal.x - px, goal.z - pz) <= reach;
}

/** Advance a job by one arrival: pick-up becomes drop-off (the clock starts), drop-off ends it (returns the payout). */
export function arrive(job: Job): Payout | null {
  if (job.stage === 'pickup') { job.stage = 'dropoff'; job.time = 0; job.crashes = 0; return null; }
  return payout(job);
}
