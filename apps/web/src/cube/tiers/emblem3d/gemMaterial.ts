import type * as THREE_NS from "three";

import {
  GEM_BOUNCES,
  GEM_BOX_HALF,
  GEM_OCTA_R,
  GEM_SLAB_HALF,
  type GemPhysics,
  type GemShape,
} from "./gem";

/**
 * 보석 재질(docs/47 14-7 「셋째 시안」). 겉 반사(프레넬, 점 조명의 반짝 점)는 `MeshPhysicalMaterial`이 그리고(몸 색은
 * 검정이라 난반사 없음, 투과 없음), 보석 안의 빛은 조각마다 빛길을 따라가 자체 발광(emissive) 자리에 더한다. 계산은
 * `gem.ts`의 `traceGem`과 같다. WebGL은 GLSL을 끼워 넣고(`onBeforeCompile`), WebGPU(HDR 길)는 같은 계산을 TSL 노드로
 * 짓는다(`gemNodeEmissive`).
 *
 * 투과를 쓰지 않으니 three가 보석마다 장면을 한 번 더 그리던 투과 패스와 양면 보석의 뒷면 패스가 없어진다.
 */

type Three = typeof THREE_NS;

/** 겉 반사 세기(반사 지도) */
export const GEM_FRONT_ENV = 1.5;

const SHAPE_ID: Record<GemShape, number> = { box: 0, octa: 1, slab: 2 };

/** 분산을 따로 따라갈 만큼 큰지(아니면 초록 채널 굴절률 하나로 따라간다) */
export function disperses(g: GemPhysics): boolean {
  return g.spread > 0.004;
}

/**
 * 날개 조각 판은 두께가 0.1뿐이라 실제 흡수로는 색이 거의 없다(무색 유리판처럼 회색). 큐브 조각과 같은 색으로 읽히게
 * 판에서는 흡수를 이만큼 키운다
 */
export const SLAB_TINT = 7;

/** 모양에 따른 흡수 */
export function absorbOf(
  g: GemPhysics,
  shape: GemShape,
): [number, number, number] {
  const k = shape === "slab" ? SLAB_TINT : 1;
  return [g.absorb[0] * k, g.absorb[1] * k, g.absorb[2] * k];
}

/** 채널별 굴절률(빨강이 가장 작고 파랑이 가장 크다) */
export function channelIor(g: GemPhysics): [number, number, number] {
  return [g.ior - g.spread / 2, g.ior, g.ior + g.spread / 2];
}

const VERT_DECL = /* glsl */ `
varying vec3 vGemPos;
varying vec3 vGemNrm;
varying vec3 vGemCam;
varying vec3 vGemM0;
varying vec3 vGemM1;
varying vec3 vGemM2;
`;

const VERT_BODY = /* glsl */ `
#include <worldpos_vertex>
vGemPos = transformed;
vGemNrm = objectNormal;
vGemCam = ( inverse( modelMatrix ) * vec4( cameraPosition, 1.0 ) ).xyz;
vGemM0 = modelMatrix[ 0 ].xyz;
vGemM1 = modelMatrix[ 1 ].xyz;
vGemM2 = modelMatrix[ 2 ].xyz;
`;

const FRAG_FUNCS = /* glsl */ `
#include <envmap_physical_pars_fragment>
varying vec3 vGemPos;
varying vec3 vGemNrm;
varying vec3 vGemCam;
varying vec3 vGemM0;
varying vec3 vGemM1;
varying vec3 vGemM2;
uniform vec3 gemIor;
uniform vec3 gemAbsorb;
uniform float gemGain;

float gemFresnel( float cosI, float n1, float n2 ) {
  float s = n1 / n2 * sqrt( max( 0.0, 1.0 - cosI * cosI ) );
  if ( s >= 1.0 ) return 1.0;
  float cosT = sqrt( 1.0 - s * s );
  float rs = ( n1 * cosI - n2 * cosT ) / ( n1 * cosI + n2 * cosT + 1e-6 );
  float rp = ( n1 * cosT - n2 * cosI ) / ( n1 * cosT + n2 * cosI + 1e-6 );
  return 0.5 * ( rs * rs + rp * rp );
}

float gemExit( vec3 p, vec3 d, out vec3 m ) {
#if GEM_SHAPE == 1
  float t = 1e9;
  m = vec3( 0.0, 0.0, 1.0 );
  for ( int k = 0; k < 8; k ++ ) {
    vec3 n = normalize( vec3( ( k & 1 ) == 0 ? - 1.0 : 1.0, ( k & 2 ) == 0 ? - 1.0 : 1.0, ( k & 4 ) == 0 ? - 1.0 : 1.0 ) );
    float dn = dot( n, d );
    if ( dn <= 1e-6 ) continue;
    float tk = ( ${GEM_OCTA_R.toFixed(4)} / sqrt( 3.0 ) - dot( n, p ) ) / dn;
    if ( tk < t ) { t = tk; m = n; }
  }
  return max( t, 0.0 );
#elif GEM_SHAPE == 2
  float sz = d.z < 0.0 ? - 1.0 : 1.0;
  m = vec3( 0.0, 0.0, sz );
  return max( ( ${GEM_SLAB_HALF.toFixed(4)} - p.z * sz ) / max( abs( d.z ), 1e-5 ), 0.0 );
#else
  vec3 s = sign( d );
  vec3 t = ( vec3( ${GEM_BOX_HALF.toFixed(4)} ) - p * s ) / max( abs( d ), vec3( 1e-5 ) );
  if ( t.x < t.y && t.x < t.z ) { m = vec3( s.x, 0.0, 0.0 ); return max( t.x, 0.0 ); }
  if ( t.y < t.z ) { m = vec3( 0.0, s.y, 0.0 ); return max( t.y, 0.0 ); }
  m = vec3( 0.0, 0.0, s.z );
  return max( t.z, 0.0 );
#endif
}

vec3 gemEnvAt( vec3 dirObj ) {
#ifdef ENVMAP_TYPE_CUBE_UV
  vec3 w = normalize( mat3( vGemM0, vGemM1, vGemM2 ) * dirObj );
  return textureCubeUV( envMap, envMapRotation * w, 0.0 ).rgb;
#else
  return vec3( 0.0 );
#endif
}

vec3 gemTrace( float ior ) {
  vec3 n = normalize( vGemNrm );
  vec3 v = normalize( vGemPos - vGemCam );
  float cosI = clamp( dot( - v, n ), 0.0, 1.0 );
  vec3 d = refract( v, n, 1.0 / ior );
  vec3 p = vGemPos - n * 1e-4;
  vec3 thr = vec3( 1.0 - gemFresnel( cosI, 1.0, ior ) );
  vec3 acc = vec3( 0.0 );
  for ( int i = 0; i < ${GEM_BOUNCES}; i ++ ) {
    vec3 m;
    float t = gemExit( p, d, m );
    p += d * t;
    thr *= exp( - gemAbsorb * t );
    float F = gemFresnel( dot( d, m ), ior, 1.0 );
    if ( F < 1.0 ) acc += thr * ( 1.0 - F ) * gemEnvAt( refract( d, - m, ior ) );
    thr *= F;
    d = reflect( d, m );
    p -= m * 1e-4;
  }
  return acc + thr * gemEnvAt( d );
}

vec3 gemLight() {
#ifdef GEM_DISPERSE
  return gemGain * vec3( gemTrace( gemIor.r ).r, gemTrace( gemIor.g ).g, gemTrace( gemIor.b ).b );
#else
  return gemGain * gemTrace( gemIor.g );
#endif
}
`;

/** 겉 반사만 그리는 물리 재질 값(몸 색 검정, 투과 없음) */
function frontParams(g: GemPhysics) {
  return {
    color: 0x000000,
    metalness: 0,
    roughness: 0,
    // three의 ior 상한(2.333). 겉 반사율 F0는 다이아몬드 0.172 → 0.16으로 거의 같다
    ior: Math.min(2.333, g.ior),
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: GEM_FRONT_ENV,
  };
}

/** WebGL 보석 재질 */
export function gemMaterialGL(
  T: Three,
  g: GemPhysics,
  shape: GemShape,
  gain: number,
): THREE_NS.MeshPhysicalMaterial {
  const m = new T.MeshPhysicalMaterial(frontParams(g));
  const ior = channelIor(g);
  const disperse = disperses(g);
  m.onBeforeCompile = (shader) => {
    shader.defines = {
      ...shader.defines,
      GEM_SHAPE: SHAPE_ID[shape],
      ...(disperse ? { GEM_DISPERSE: "" } : {}),
    };
    shader.uniforms.gemIor = { value: new T.Vector3(...ior) };
    shader.uniforms.gemAbsorb = { value: new T.Vector3(...absorbOf(g, shape)) };
    shader.uniforms.gemGain = { value: gain };
    shader.vertexShader =
      VERT_DECL +
      shader.vertexShader.replace("#include <worldpos_vertex>", VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <envmap_physical_pars_fragment>", FRAG_FUNCS)
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += gemLight();",
      );
  };
  m.customProgramCacheKey = () =>
    `gem-${shape}-${disperse ? 1 : 0}-${GEM_BOUNCES}`;
  return m;
}

/** WebGPU 묶음(three/webgpu)에서 쓰는 만큼의 TSL 이름 */
// biome-ignore lint/suspicious/noExplicitAny: TSL 노드는 형이 느슨하다
type N = any;
interface Tsl {
  MeshPhysicalNodeMaterial: new (
    p: object,
  ) => THREE_NS.Material & {
    emissiveNode: N;
  };
  positionLocal: N;
  normalLocal: N;
  cameraPosition: N;
  modelWorldMatrix: N;
  modelWorldMatrixInverse: N;
  vec3: (...a: N[]) => N;
  vec4: (...a: N[]) => N;
  float: (a: number) => N;
  normalize: (a: N) => N;
  refract: (i: N, n: N, eta: N) => N;
  reflect: (i: N, n: N) => N;
  select: (c: N, a: N, b: N) => N;
  exp: (a: N) => N;
  max: (a: N, b: N) => N;
  min: (a: N, b: N) => N;
  abs: (a: N) => N;
  sqrt: (a: N) => N;
  sign: (a: N) => N;
  dot: (a: N, b: N) => N;
  clamp: (a: N, lo: N, hi: N) => N;
  pmremTexture: (t: THREE_NS.Texture, uv: N, level: N) => N;
}

/** WebGPU 묶음에 TSL이 있는지(WebGL 묶음 `three`에는 없다) */
export function hasTsl(T: object): boolean {
  return "MeshPhysicalNodeMaterial" in T && "pmremTexture" in T;
}

/** WebGPU 보석 재질(빛길은 반사 지도가 생긴 뒤 `gemNodeEmissive`로 붙인다) */
export function gemMaterialNode(T: object, g: GemPhysics): THREE_NS.Material {
  const W = T as unknown as Tsl;
  return new W.MeshPhysicalNodeMaterial(frontParams(g));
}

/**
 * GLSL `gemLight`와 같은 계산을 TSL 노드로 짓는다. 벽에 닿는 횟수만큼 JS에서 펼친다(분기는 `select`). 여러 번 쓰는
 * 노드는 TSL이 임시 변수로 한 번만 계산한다.
 */
export function gemNodeEmissive(
  T: object,
  env: THREE_NS.Texture,
  g: GemPhysics,
  shape: GemShape,
  gain: number,
): N {
  const W = T as unknown as Tsl;
  const { vec3, vec4, float, normalize, refract, reflect, select, dot } = W;
  const { exp, max, min, abs, sqrt, sign, clamp } = W;
  const camObj = W.modelWorldMatrixInverse.mul(vec4(W.cameraPosition, 1)).xyz;
  const p0 = W.positionLocal;
  const n0 = normalize(W.normalLocal);
  const v = normalize(p0.sub(camObj));
  const absorb = vec3(...absorbOf(g, shape).map((x) => float(x)));
  const envAt = (o: N) =>
    W.pmremTexture(
      env,
      normalize(W.modelWorldMatrix.mul(vec4(o, 0)).xyz),
      float(0),
    );
  const fres = (cosI: N, n1: number, n2: number) => {
    const s = sqrt(max(float(0), float(1).sub(cosI.mul(cosI)))).mul(n1 / n2);
    const cosT = sqrt(max(float(0), float(1).sub(s.mul(s))));
    const a = cosI.mul(n1);
    const b = cosT.mul(n2);
    const c = cosT.mul(n1);
    const e = cosI.mul(n2);
    const rs = a.sub(b).div(a.add(b).add(1e-6));
    const rp = c.sub(e).div(c.add(e).add(1e-6));
    return select(
      s.greaterThanEqual(1),
      float(1),
      rs.mul(rs).add(rp.mul(rp)).mul(0.5),
    );
  };
  const exitBox = (p: N, d: N) => {
    const s = sign(d);
    const t = vec3(GEM_BOX_HALF)
      .sub(p.mul(s))
      .div(max(abs(d), vec3(1e-5)));
    const xMin = t.x.lessThan(t.y).and(t.x.lessThan(t.z));
    const yMin = t.y.lessThan(t.z);
    return {
      t: max(select(xMin, t.x, select(yMin, t.y, t.z)), float(0)),
      m: select(
        xMin,
        vec3(s.x, 0, 0),
        select(yMin, vec3(0, s.y, 0), vec3(0, 0, s.z)),
      ),
    };
  };
  const exitOcta = (p: N, d: N) => {
    let t: N = float(1e9);
    let m: N = vec3(0, 0, 1);
    const k = 1 / Math.sqrt(3);
    for (const x of [-k, k])
      for (const y of [-k, k])
        for (const z of [-k, k]) {
          const n = vec3(x, y, z);
          const dn = dot(n, d);
          const tk = select(
            dn.greaterThan(1e-6),
            float(GEM_OCTA_R * k)
              .sub(dot(n, p))
              .div(max(dn, float(1e-6))),
            float(1e9),
          );
          m = select(tk.lessThan(t), n, m);
          t = min(t, tk);
        }
    return { t: max(t, float(0)), m };
  };
  const exitSlab = (p: N, d: N) => {
    const sz = select(d.z.lessThan(0), float(-1), float(1));
    return {
      t: max(
        float(GEM_SLAB_HALF)
          .sub(p.z.mul(sz))
          .div(max(abs(d.z), float(1e-5))),
        float(0),
      ),
      m: vec3(0, 0, sz),
    };
  };
  const exit =
    shape === "octa" ? exitOcta : shape === "slab" ? exitSlab : exitBox;
  const trace = (ior: number) => {
    const cosI = clamp(dot(v.negate(), n0), float(0), float(1));
    let d: N = refract(v, n0, float(1 / ior));
    let p: N = p0.sub(n0.mul(1e-4));
    let thr: N = vec3(float(1).sub(fres(cosI, 1, ior)));
    let acc: N = vec3(0, 0, 0);
    for (let i = 0; i < GEM_BOUNCES; i++) {
      const { t, m } = exit(p, d);
      p = p.add(d.mul(t));
      thr = thr.mul(exp(absorb.mul(t).negate()));
      const F = fres(dot(d, m), ior, 1);
      const o = select(F.lessThan(1), refract(d, m.negate(), float(ior)), d);
      acc = acc.add(thr.mul(float(1).sub(F)).mul(envAt(o)));
      thr = thr.mul(F);
      d = reflect(d, m);
      p = p.sub(m.mul(1e-4));
    }
    return acc.add(thr.mul(envAt(d)));
  };
  const [r, gIor, b] = channelIor(g);
  const light = disperses(g)
    ? vec3(trace(r).x, trace(gIor).y, trace(b).z)
    : trace(gIor);
  return light.mul(gain);
}
