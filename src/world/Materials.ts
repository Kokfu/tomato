import * as THREE from 'three';

/** Growable buffers for building merged geometry. */
export class GeoBuf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  private useUv: boolean;

  constructor(useUv = false) {
    this.useUv = useUv;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u = 0, v = 0): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    if (this.useUv) this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Add a triangle, flipping it if needed so that it faces +Y. */
  triUp(a: number, b: number, c: number): void {
    const p = this.pos;
    const cr = (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) - (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
    if (cr >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.useUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function facadeTexture(): THREE.CanvasTexture {
  // One bay x one storey. Multiplied by the per-building vertex colour.
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // floor band
  g.fillStyle = '#d9d9d9';
  g.fillRect(0, S - 10, S, 10);
  // window recess
  g.fillStyle = '#8f949a';
  g.fillRect(26, 26, 76, 68);
  const grad = g.createLinearGradient(0, 30, 0, 90);
  grad.addColorStop(0, '#5d7387');
  grad.addColorStop(1, '#2f3d4b');
  g.fillStyle = grad;
  g.fillRect(30, 30, 68, 60);
  g.fillStyle = '#c9ccd0';
  g.fillRect(62, 30, 4, 60);
  g.fillRect(30, 58, 68, 3);
  // sill
  g.fillStyle = '#eeeeee';
  g.fillRect(22, 94, 84, 5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
  void main() {
    vec2 p = vWorld.xz;
    // Analytic normal from a few travelling sine waves (river flows roughly east).
    vec2 g = vec2(0.0);
    g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.55 + uTime * 0.9) * 0.06;
    g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 1.3 + uTime * 1.4) * 0.05;
    g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 2.7 + uTime * 2.1) * 0.035;
    g += vec2(0.2, 0.98) * cos(dot(p, vec2(0.2, 0.98)) * 5.1 + uTime * 2.8) * 0.02;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(uDeep, uSky, clamp(0.12 + fres * 0.85, 0.0, 1.0));
    vec3 h = normalize(v + uSunDir);
    col += vec3(1.0, 0.93, 0.8) * pow(max(dot(n, h), 0.0), 180.0) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Shared materials: one instance per layer for the whole world keeps draw state changes low. */
export class Materials {
  readonly roads: THREE.MeshLambertMaterial[];
  readonly marks: THREE.MeshBasicMaterial;
  readonly wallsTextured: THREE.MeshLambertMaterial;
  readonly wallsPlain: THREE.MeshLambertMaterial;
  readonly roofs: THREE.MeshLambertMaterial;
  readonly structure: THREE.MeshLambertMaterial;
  readonly trunk: THREE.MeshLambertMaterial;
  readonly crown: THREE.MeshLambertMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly landmark: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    this.roads = [0, 1, 2, 3].map(
      (g) => new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -(g + 1), polygonOffsetUnits: -(g + 1) * 4 }),
    );
    this.marks = new THREE.MeshBasicMaterial({ color: 0xd8d8d0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    this.wallsTextured = new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeTexture() });
    this.wallsPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.roofs = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.structure = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.landmark = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.trunk = new THREE.MeshLambertMaterial({ color: 0x6b4f3a });
    this.crown = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.water = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x4e5d49) }, uSky: { value: new THREE.Color(0xa9c4d6) }, uSunDir: { value: sunDir.clone() } },
      ]),
      fog: true,
    });
    void scene;
  }

  update(time: number): void {
    this.water.uniforms.uTime.value = time;
  }
}
