// Citywide atmosphere (N1-M2): the sun's position for Kuching's latitude and the humid haze that every material shares.
import * as THREE from 'three';

/** Kuching, 1.56 degrees north of the equator. */
export const KUCHING_LAT = 1.56;

/**
 * Unit vector from the ground toward the sun (+X east, +Y up, -Z north) for a latitude, a solar declination (both in
 * degrees) and a local solar time in hours (12 = the sun crosses the meridian).
 */
export function sunDirection(latDeg: number, declDeg: number, solarHour: number): [number, number, number] {
  const rad = Math.PI / 180, lat = latDeg * rad, dec = declDeg * rad, h = (solarHour - 12) * 15 * rad;
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  return [east, up, -north];
}

/** Solar declination in degrees on a day of the year (1 = 1 January); Cooper's formula, good to about half a degree. */
export function solarDeclination(dayOfYear: number): number {
  return 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
}

/**
 * Humid tropical haze. Two parts: an exponential-squared haze of fixed density (the moisture in the air, the same on
 * every graphics preset) and a ramp that closes completely at `reach`, the edge of the streamed world, so the last
 * chunks dissolve into the sky instead of ending in a visible line.
 *
 * It is a THREE.Fog so that three.js feeds `near` / `far` to the shaders; here they carry the density and the reach
 * (see the fog_fragment chunk below).
 */
export class Haze extends THREE.Fog {
  constructor(color: THREE.ColorRepresentation, density: number, reach: number) { super(color, density, reach); }
  get density(): number { return this.near; }
  set density(v: number) { this.near = v; }
  get reach(): number { return this.far; }
  set reach(v: number) { this.far = v; }
}

// Distance from the eye, not depth along the view axis: the haze must close at the same range in the corners of the screen.
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = length( mvPosition.xyz );
#endif
`;
// three.js mixes the fog colour in after tone mapping and output encoding, so a fog colour never matched the sky dome
// (which is tone mapped): the far ground ended in a band of a different colour. Here the fog colour goes through the
// same tone mapping and encoding as the surface it covers, in both render paths (straight to the canvas, or into the
// HDR target where neither is applied yet), so fogged ground and the sky's horizon are the same colour.
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = max( 1.0 - exp( - fogNear * fogNear * vFogDepth * vFogDepth ), smoothstep( fogFar * 0.6, fogFar, vFogDepth ) );
  #endif
  vec3 kFogColor = fogColor;
  #ifdef TONE_MAPPING
    kFogColor = toneMapping( kFogColor );
  #endif
  kFogColor = linearToOutputTexel( vec4( kFogColor, 1.0 ) ).rgb;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, kFogColor, fogFactor );
#endif
`;
