// Shared types and small helpers for landmark model scripts.
import type { MeshBuilder } from './mesh.ts';
import type { Col, V3 } from './mesh.ts';

export interface Collision {
  /** Blocking outlines in the model's plan frame: flat [x, z, ...], top = height above the model base. */
  walls: { ring: number[]; top: number }[];
  /** Raised walkable surfaces: flat ring and height above the model base. */
  floors: { ring: number[]; h: number }[];
}
/**
 * A text panel drawn at run time with the browser's fonts (no texture download). Position = centre
 * of the panel in the model frame; ry = rotation about +Y (0 faces +Z, the street).
 */
export interface Plaque {
  text: string;
  x: number; y: number; z: number;
  w: number; h: number;
  ry: number;
  fg: string; bg: string;
  /** Characters stacked top to bottom. */
  vertical?: boolean;
  /** Where the wording comes from (shown in docs; "approximation" when not read from a reference). */
  basis: string;
}
export interface ModelOutput { mesh: MeshBuilder; collision: Collision; plaques: Plaque[] }
export type ModelScript = (lod: 0 | 1) => ModelOutput;

export const rectRing = (x0: number, x1: number, z0: number, z1: number): number[] => [x0, z0, x1, z0, x1, z1, x0, z1];
export const squareRing = (x: number, z: number, half: number): number[] => rectRing(x - half, x + half, z - half, z + half);

/** Vertical rectangle in a plane of constant z, facing +z (or -z). */
export function panelZ(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z: number, color: Col | Col[], face = 1): void {
  b.flat([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], color, [0, 0, face]);
}
/** Vertical rectangle in a plane of constant x, facing +x (or -x). */
export function panelX(b: MeshBuilder, x: number, z0: number, z1: number, y0: number, y1: number, color: Col | Col[], face = 1): void {
  b.flat([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], color, [face, 0, 0]);
}
/** Horizontal rectangle facing up. */
export function panelY(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, color: Col | Col[], face = 1): void {
  b.flat([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], color, [0, face, 0]);
}
/** Two-tone paving / tiling as a grid of flat quads. */
export function paving(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, cell: number, a: Col, c: Col): void {
  if (!b.detail) { panelY(b, x0, x1, z0, z1, y, a); return; }
  const nx = Math.max(1, Math.round(Math.abs(x1 - x0) / cell)), nz = Math.max(1, Math.round(Math.abs(z1 - z0) / cell));
  const rows: V3[][] = [];
  for (let j = 0; j <= nz; j++) { const row: V3[] = []; for (let i = 0; i <= nx; i++) row.push([x0 + ((x1 - x0) * i) / nx, y, z0 + ((z1 - z0) * j) / nz]); rows.push(row); }
  // flat grid: per-quad colour comes from its first corner
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) b.flat([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]], (i + j) % 2 ? a : c, [0, 1, 0]);
}
