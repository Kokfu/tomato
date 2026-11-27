// The build that is running, as stamped by vite.config.ts at build / dev-server start. Shown in Settings,
// separately from the graphics presets and the developer renderer comparison.
declare const __K3D_BUILD__: { release: string; package: string; commit: string; dataHash?: string; modified: boolean; date: string; dev: boolean } | undefined;

export const BUILD = typeof __K3D_BUILD__ !== 'undefined' ? __K3D_BUILD__ : { release: '', package: '0.0.0', commit: '', dataHash: '', modified: false, date: '', dev: true };

/** Content/build hash appended to map and chunk data URLs (`?v=...`) so returning browsers never mix stale and fresh data. */
export const DATA_HASH: string = BUILD.dataHash || BUILD.commit || '';

export function withDataVersion(url: string, hash = DATA_HASH): string {
  return hash ? `${url}${url.includes('?') ? '&' : '?'}v=${hash}` : url;
}

/** e.g. "V8 · build 5bff277 · 2026-11-17" (with "+ local changes" / "dev server" when that is what runs). */
export function buildLabel(): string {
  const b = BUILD;
  const parts = [b.release || `v${b.package}`];
  if (b.commit) parts.push(`build ${b.commit}${b.modified ? ' + local changes' : ''}`);
  if (b.date) parts.push(b.date);
  if (b.dev) parts.push('dev server');
  return parts.join(' · ');
}
