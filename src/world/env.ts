// N1-M6: what every material shares about the hour and the weather. One object per uniform, handed to each shader
// that needs it, so that setting a value here reaches all of them: no material is rebuilt and no program recompiled
// when night falls or rain starts.
import * as THREE from 'three';

export const ENV = {
  /** 0 by day .. 1 at night: windows, signs and floodlights are lit by this much. */
  uNight: { value: 0 },
  /** How wet the ground is, 0..1. */
  uWet: { value: 0 },
  /** Rain falling now, 0..1 (ripples in the puddles). */
  uRain: { value: 0 },
  /** Seconds, for ripples. */
  uEnvTime: { value: 0 },
  /** N2-M3: traffic-signal clock in seconds (shared with Traffic.signalState). */
  uSignalTime: { value: 0 },
  /** What a wet road mirrors: the sky near the horizon. */
  uSkyRefl: { value: new THREE.Color(0.58, 0.69, 0.74) },
};

/** Emissive colour shared by every shop name board (black by day). */
export const SIGN_GLOW = new THREE.Color(0, 0, 0);

/** Called with (night, wet) when either changes: for the few materials that are not reached by a shared uniform. */
export const envListeners: ((night: number, wet: number) => void)[] = [];

/** GLSL declarations of the shared uniforms (fragment shaders). */
export const ENV_PARS = /* glsl */ `
uniform float uNight;
uniform float uWet;
uniform float uRain;
uniform float uEnvTime;
uniform vec3 uSkyRefl;
`;
