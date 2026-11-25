// N1-M5 hero places switch. Pure (no three.js), safe under node (no `location`) and in a worker.
//
// On by default in a browser; `?m5=0` restores the N1-M4 rendering of the two places (the "before" of every
// comparison). Without a `location` (node unit tests, tools) it is off, so the pinned tables keep their values.
import { getFlags } from '../../flags.ts';

let override: boolean | null = null;

/** Explicit override (tests). Pass null to follow the URL again. */
export function setM5(v: boolean | null): void { override = v; }

export function m5Enabled(): boolean { return override !== null ? override : getFlags().m5; }
