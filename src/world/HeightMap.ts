import type { Manifest } from './types.ts';

/**
 * Global terrain height grid. Heights are piecewise-linear over triangles (each grid cell is split
 * along its (0,0)-(1,1) diagonal), which is exactly how the terrain mesh is triangulated, so
 * physics and visuals agree.
 */
export class HeightMap {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  readonly data: Int16Array;

  constructor(meta: Manifest['height'], data: Int16Array) {
    this.x0 = meta.x0;
    this.z0 = meta.z0;
    this.nx = meta.nx;
    this.nz = meta.nz;
    this.cell = meta.cell;
    this.data = data;
  }

  node(ix: number, iz: number): number {
    ix = ix < 0 ? 0 : ix >= this.nx ? this.nx - 1 : ix;
    iz = iz < 0 ? 0 : iz >= this.nz ? this.nz - 1 : iz;
    return this.data[iz * this.nx + ix] * 0.01;
  }

  /** Terrain elevation (metres) at world position. */
  sample(x: number, z: number): number {
    const gx = (x - this.x0) / this.cell;
    const gz = (z - this.z0) / this.cell;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = this.node(ix, iz);
    const h11 = this.node(ix + 1, iz + 1);
    if (fx >= fz) {
      const h10 = this.node(ix + 1, iz);
      return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    }
    const h01 = this.node(ix, iz + 1);
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }
}
