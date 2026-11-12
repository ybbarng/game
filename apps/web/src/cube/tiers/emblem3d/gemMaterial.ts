import type * as THREE_NS from "three";

import {
  GEM_BOUNCES,
  GEM_BOX_HALF,
  GEM_CUBE_FILL,
  GEM_CUBE_HALF,
  GEM_OCTA_R,
  GEM_SLAB_HALF,
  type GemPhysics,
  type GemShape,
  THROUGH_HI,
  THROUGH_LO,
} from "./gem";
import { type FacetCut, type GemStyleLook, JARDIN } from "./gemStyle";

/**
 * 보석 재질(docs/47 14-7 「셋째 시안」·「넷째 시안」). 겉 반사(프레넬, 점 조명의 반짝 점)는 `MeshPhysicalMaterial`이
 * 그리고(몸 색은 검정이라 난반사 없음, 투과 없음), 보석 안의 빛은 조각마다 빛길을 따라가 자체 발광(emissive) 자리에
 * 더한다. 계산은 `gem.ts`의 `traceGem`과 같다. WebGL은 GLSL을 끼워 넣고(`onBeforeCompile`), WebGPU(HDR 길)는 같은
 * 계산을 TSL 노드로 짓는다(`gemNodeEmissive`).
 *
 * 나가는 빛은 어디를 보는지에 따라 둘 중 하나를 읽는다(`gem.ts` `throughWeight`): 보석을 꿰뚫어 뒤로 나가는 빛은 뒤
 * 배경판(장면의 그 그림, 돌지 않는 평면)을 직접 읽고, 안에서 되튀어 옆·앞으로 나가는 빛은 스튜디오 반사 지도를 읽는다.
 * 그래서 보석 너머 배경이 굴절돼 비치고(투명), 가장자리·면에서만 스튜디오 빛이 반짝인다. 배경판은 평면 하나라 장면을
 * 한 번 더 그리지 않고 텍스처 한 번 읽기로 끝난다.
 */

type Three = typeof THREE_NS;

/**
 * 겉 반사 세기(반사 지도). 1이면 물리 그대로: 정면 반사율이 굴절률대로 에메랄드 5.0%, 자수정 4.6%, 루비 7.7%,
 * 다이아몬드 17%. 예전 1.5는 정면에서도 반사가 커서 금속처럼 보이는 데 한몫했다
 */
export const GEM_FRONT_ENV = 1;

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

/** 날개 조각 판이 비추는 금속 판 빛 세기(스튜디오 반사 지도 세기에 곱한다). 닦은 금속이 판 뒤에서 한 번 더 비춘다 */
export const SLAB_ENV = 1.5;

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

/** 보석이 꿰뚫어 볼 뒤 배경판과 빛 세기(장면이 하나 만들어 모든 보석 재질이 같이 쓴다) */
export interface GemSee {
  /** 배경판 그림(장면의 배경판과 같은 것) */
  back: THREE_NS.Texture;
  /** 배경판 자리(z)와 한 변. 배경판은 돌지 않는다(월드 좌표) */
  backZ: number;
  backSize: number;
  /** 꿰뚫어 본 배경 세기 */
  backGain: number;
  /** 되튄 빛이 읽는 스튜디오 반사 지도 세기 */
  envGain: number;
  /** 월드 → 큐브 좌표(큐브 전체 두께로 더 흡수할 때). 매 장 `EmblemScene.update`가 고친다 */
  cubeInv: THREE_NS.Matrix4;
}

const VERT_DECL = /* glsl */ `
varying vec3 vGemPos;
varying vec3 vGemNrm;
varying vec3 vGemCam;
varying vec3 vGemM0;
varying vec3 vGemM1;
varying vec3 vGemM2;
varying vec3 vGemM3;
`;

const VERT_BODY = /* glsl */ `
#include <worldpos_vertex>
vGemPos = transformed;
vGemNrm = objectNormal;
vGemCam = ( inverse( modelMatrix ) * vec4( cameraPosition, 1.0 ) ).xyz;
vGemM0 = modelMatrix[ 0 ].xyz;
vGemM1 = modelMatrix[ 1 ].xyz;
vGemM2 = modelMatrix[ 2 ].xyz;
vGemM3 = modelMatrix[ 3 ].xyz;
`;

const f = (x: number) => x.toFixed(5);

/**
 * 깎은 면 법선(`gemStyle.ts` `facetNormal`과 같은 계산). 띠 값은 시안마다 달라 셰이더 글로 펼친다. 깎지 않으면 면의
 * 축 법선을 그대로 돌려준다
 */
function facetGlsl(cut: FacetCut): string {
  const rings = cut.rings
    .map(
      (r) =>
        `  if ( r >= ${f(r.from)} ) { tilt = ${f((r.tilt * Math.PI) / 180)}; k = ${f(r.sectors ?? 8)}; off = ${f(r.offset ?? 0)}; }`,
    )
    .join("\n");
  const dir =
    cut.kind === 2
      ? `  float st = 6.2831853 / k;
  float s = floor( atan( v, u ) / st + off );
  float c = ( s + 0.5 - off ) * st;
  vec3 e = U * cos( c ) + V * sin( c );`
      : `  vec3 e = abs( u ) >= abs( v ) ? U * ( u < 0.0 ? - 1.0 : 1.0 ) : V * ( v < 0.0 ? - 1.0 : 1.0 );`;
  return /* glsl */ `
vec3 gemFacet( vec3 p, vec3 n ) {
  vec3 a = abs( n );
  vec3 N; vec3 U; vec3 V;
  if ( a.x >= a.y && a.x >= a.z ) { N = vec3( n.x < 0.0 ? - 1.0 : 1.0, 0.0, 0.0 ); U = vec3( 0.0, 1.0, 0.0 ); V = vec3( 0.0, 0.0, 1.0 ); }
  else if ( a.y >= a.z ) { N = vec3( 0.0, n.y < 0.0 ? - 1.0 : 1.0, 0.0 ); U = vec3( 1.0, 0.0, 0.0 ); V = vec3( 0.0, 0.0, 1.0 ); }
  else { N = vec3( 0.0, 0.0, n.z < 0.0 ? - 1.0 : 1.0 ); U = vec3( 1.0, 0.0, 0.0 ); V = vec3( 0.0, 1.0, 0.0 ); }
  float u = dot( p, U ) / ${f(GEM_BOX_HALF)};
  float v = dot( p, V ) / ${f(GEM_BOX_HALF)};
  float r = max( abs( u ), abs( v ) );
  float tilt = 0.0; float k = 8.0; float off = 0.0;
${rings}
  if ( tilt <= 0.0 ) return N;
${dir}
  return normalize( N * cos( tilt ) + e * sin( tilt ) );
}
`;
}

/** 내포물(결·알갱이) 노이즈(`gemStyle.ts` `jardinAt`과 같은 계산) */
const JARDIN_GLSL = /* glsl */ `
float gemHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 ) * 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float gemNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 w = fract( x );
  w = w * w * ( 3.0 - 2.0 * w );
  return mix(
    mix( mix( gemHash( i ), gemHash( i + vec3( 1, 0, 0 ) ), w.x ), mix( gemHash( i + vec3( 0, 1, 0 ) ), gemHash( i + vec3( 1, 1, 0 ) ), w.x ), w.y ),
    mix( mix( gemHash( i + vec3( 0, 0, 1 ) ), gemHash( i + vec3( 1, 0, 1 ) ), w.x ), mix( gemHash( i + vec3( 0, 1, 1 ) ), gemHash( i + vec3( 1, 1, 1 ) ), w.x ), w.y ),
    w.z );
}
// 한 구간(p에서 d로 t만큼)에서 결과 알갱이를 지나는 양
vec2 gemJardin( vec3 p, vec3 d, float t, vec3 seed ) {
  vec2 s = vec2( 0.0 );
  for ( int k = 0; k < ${JARDIN.samples}; k ++ ) {
    vec3 q = p + d * ( t * ( float( k ) + 0.5 ) / ${f(JARDIN.samples)} ) + seed;
    vec3 qs = vec3( q.x, q.y * ${f(JARDIN.veilStretch)}, q.z );
    float n = gemNoise( qs * ${f(JARDIN.veilScale)} ) * 0.65 + gemNoise( qs * ${f(JARDIN.veilFine)} ) * 0.35;
    float veil = smoothstep( ${f(JARDIN.veilLo)}, ${f(JARDIN.veilMid)}, n ) * ( 1.0 - smoothstep( ${f(JARDIN.veilMid)}, ${f(JARDIN.veilHi)}, n ) );
    float speck = smoothstep( ${f(JARDIN.speckLo)}, ${f(JARDIN.speckHi)}, gemNoise( q * ${f(JARDIN.speckScale)} ) );
    s += vec2( veil, speck );
  }
  return s * ( t / ${f(JARDIN.samples)} );
}
`;

const fragFuncs = (cut: FacetCut) => /* glsl */ `
#include <envmap_physical_pars_fragment>
varying vec3 vGemPos;
varying vec3 vGemNrm;
varying vec3 vGemCam;
varying vec3 vGemM0;
varying vec3 vGemM1;
varying vec3 vGemM2;
varying vec3 vGemM3;
uniform vec3 gemIor;
uniform vec3 gemAbsorb;
uniform sampler2D gemBack;
uniform vec4 gemSeeK;
uniform mat4 gemCubeInv;
${facetGlsl(cut)}
${JARDIN_GLSL}

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
    float tk = ( ${f(GEM_OCTA_R)} / sqrt( 3.0 ) - dot( n, p ) ) / dn;
    if ( tk < t ) { t = tk; m = n; }
  }
  return max( t, 0.0 );
#elif GEM_SHAPE == 2
  float sz = d.z < 0.0 ? - 1.0 : 1.0;
  m = vec3( 0.0, 0.0, sz );
  return max( ( ${f(GEM_SLAB_HALF)} - p.z * sz ) / max( abs( d.z ), 1e-5 ), 0.0 );
#else
  vec3 s = sign( d );
  vec3 t = ( vec3( ${f(GEM_BOX_HALF)} ) - p * s ) / max( abs( d ), vec3( 1e-5 ) );
  if ( t.x < t.y && t.x < t.z ) { m = vec3( s.x, 0.0, 0.0 ); return max( t.x, 0.0 ); }
  if ( t.y < t.z ) { m = vec3( 0.0, s.y, 0.0 ); return max( t.y, 0.0 ); }
  m = vec3( 0.0, 0.0, s.z );
  return max( t.z, 0.0 );
#endif
}

vec3 gemEnvAt( vec3 w ) {
#ifdef ENVMAP_TYPE_CUBE_UV
  return textureCubeUV( envMap, envMapRotation * w, 0.0 ).rgb;
#else
  return vec3( 0.0 );
#endif
}

#ifdef GEM_IN_CUBE
float gemBoxPath( vec3 p, vec3 d ) {
  vec3 inv = 1.0 / mix( d, vec3( 1e-6 ), lessThan( abs( d ), vec3( 1e-6 ) ) );
  vec3 a = ( vec3( - ${f(GEM_CUBE_HALF)} ) - p ) * inv;
  vec3 b = ( vec3( ${f(GEM_CUBE_HALF)} ) - p ) * inv;
  vec3 lo = min( a, b );
  vec3 hi = max( a, b );
  float t0 = max( max( lo.x, lo.y ), max( lo.z, 0.0 ) );
  float t1 = min( min( hi.x, hi.y ), hi.z );
  return max( t1 - t0, 0.0 );
}
#endif

// 물체 좌표의 나가는 점 p와 방향 d: 뒤로 꿰뚫어 보면 배경판, 아니면 스튜디오 빛(gem.ts throughWeight)
vec3 gemSee( vec3 p, vec3 d ) {
  mat3 M = mat3( vGemM0, vGemM1, vGemM2 );
  vec3 ow = normalize( M * d );
  vec3 env = gemEnvAt( ow ) * gemSeeK.w;
#if GEM_SHAPE == 2
  // 날개 조각 판은 닦은 금속 판 위에 붙어 있어 뒤가 배경이 아니라 금속(스튜디오를 비춘다)
  return env * ${f(SLAB_ENV)};
#endif
  vec3 pw = M * p + vGemM3;
  vec3 view = normalize( pw - cameraPosition );
  float w = smoothstep( ${f(THROUGH_LO)}, ${f(THROUGH_HI)}, dot( ow, view ) );
  if ( w <= 0.0 || ow.z > - 1e-3 ) return env;
  float t = ( gemSeeK.x - pw.z ) / ow.z;
  vec2 uv = ( pw.xy + ow.xy * t ) / gemSeeK.y + 0.5;
  vec3 back = texture2D( gemBack, uv ).rgb * gemSeeK.z;
#ifdef GEM_IN_CUBE
  vec3 pc = ( gemCubeInv * vec4( pw, 1.0 ) ).xyz;
  vec3 dc = normalize( mat3( gemCubeInv ) * ow );
  back *= exp( - gemAbsorb * gemBoxPath( pc, dc ) * ${f(GEM_CUBE_FILL)} );
#endif
  return mix( env, back, w );
}

vec3 gemTrace( float ior ) {
  vec3 n = normalize( vGemNrm );
#ifdef GEM_FACET
  n = gemFacet( vGemPos, n );
#endif
  vec3 v = normalize( vGemPos - vGemCam );
  float cosI = clamp( dot( - v, n ), 0.0, 1.0 );
  vec3 d = refract( v, n, 1.0 / ior );
  vec3 p = vGemPos - n * 1e-4;
  vec3 thr = vec3( 1.0 - gemFresnel( cosI, 1.0, ior ) );
  vec3 acc = vec3( 0.0 );
#ifdef GEM_JARDIN
  // 조각마다 다른 결: 큐브 안 조각 자리(돌려도 그대로)를 씨앗으로
  vec3 seed = ( gemCubeInv * vec4( vGemM3, 1.0 ) ).xyz * 5.3;
#endif
  for ( int i = 0; i < ${GEM_BOUNCES}; i ++ ) {
    vec3 m;
    float t = gemExit( p, d, m );
#ifdef GEM_JARDIN
    if ( i < ${JARDIN.segments} ) {
      vec2 j = gemJardin( p, d, t, seed );
      acc += thr * j.x * ${f(JARDIN.veilGlow)} * vec3( 0.62, 0.8, 0.66 ) * gemSeeK.w;
      thr *= exp( - ( j.x * ${f(JARDIN.veilBlock)} + j.y * ${f(JARDIN.speckBlock)} ) );
    }
#endif
    p += d * t;
#ifdef GEM_FACET
    vec3 mf = gemFacet( p, m );
    if ( dot( d, mf ) > 0.05 ) m = mf;
#endif
    thr *= exp( - gemAbsorb * t );
    float F = gemFresnel( dot( d, m ), ior, 1.0 );
    if ( F < 1.0 ) acc += thr * ( 1.0 - F ) * gemSee( p, refract( d, - m, ior ) );
    thr *= F;
    d = reflect( d, m );
    p -= m * 1e-4;
  }
  return acc + thr * gemSee( p, d );
}

vec3 gemLight() {
#ifdef GEM_DISPERSE
  return vec3( gemTrace( gemIor.r ).r, gemTrace( gemIor.g ).g, gemTrace( gemIor.b ).b );
#else
  return gemTrace( gemIor.g );
#endif
}
`;

const NO_CUT: FacetCut = { kind: 0, rings: [] };

/** 깎은 면이면 겉 반사(프레넬·점 조명 반짝 점)도 그 면의 기울기로 그린다(보기 좌표 법선을 바꾼다) */
const FACET_NORMAL = /* glsl */ `
#ifdef GEM_FACET
{
  vec3 gemFo = gemFacet( vGemPos, normalize( vGemNrm ) );
  normal = normalize( ( viewMatrix * vec4( normalize( mat3( vGemM0, vGemM1, vGemM2 ) * gemFo ), 0.0 ) ).xyz );
}
#endif
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

/**
 * WebGL 보석 재질. `inCube`면 큐브 조각이라 꿰뚫어 보는 빛이 뒤쪽 조각들을 지나며 더 흡수된다(왕관 상자·팔면체·판은
 * 홀로 놓인 보석)
 */
export function gemMaterialGL(
  T: Three,
  g: GemPhysics,
  shape: GemShape,
  see: GemSee,
  inCube: boolean,
  style?: GemStyleLook,
  styleKey = "now",
): THREE_NS.MeshPhysicalMaterial {
  const m = new T.MeshPhysicalMaterial(frontParams(g));
  const ior = channelIor(g);
  const disperse = disperses(g);
  // 깎은 면은 큐브 조각·왕관 같은 상자 보석에만(팔면체·판은 이미 깎인 모양이다)
  const cut = style && shape === "box" ? style.cut : NO_CUT;
  const facet = cut.kind !== 0;
  const jardin = !!style?.jardin && inCube;
  m.onBeforeCompile = (shader) => {
    shader.defines = {
      ...shader.defines,
      GEM_SHAPE: SHAPE_ID[shape],
      ...(disperse ? { GEM_DISPERSE: "" } : {}),
      ...(inCube ? { GEM_IN_CUBE: "" } : {}),
      ...(facet ? { GEM_FACET: "" } : {}),
      ...(jardin ? { GEM_JARDIN: "" } : {}),
    };
    shader.uniforms.gemIor = { value: new T.Vector3(...ior) };
    shader.uniforms.gemAbsorb = { value: new T.Vector3(...absorbOf(g, shape)) };
    shader.uniforms.gemBack = { value: see.back };
    shader.uniforms.gemSeeK = {
      value: new T.Vector4(see.backZ, see.backSize, see.backGain, see.envGain),
    };
    shader.uniforms.gemCubeInv = { value: see.cubeInv };
    shader.vertexShader =
      VERT_DECL +
      shader.vertexShader.replace("#include <worldpos_vertex>", VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <envmap_physical_pars_fragment>", fragFuncs(cut))
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${FACET_NORMAL}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += gemLight();",
      );
  };
  m.customProgramCacheKey = () =>
    `gem3-${shape}-${disperse ? 1 : 0}-${inCube ? 1 : 0}-${GEM_BOUNCES}-${facet || jardin ? styleKey : "flat"}`;
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
  vec2: (...a: N[]) => N;
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
  mix: (a: N, b: N, t: N) => N;
  smoothstep: (lo: N, hi: N, x: N) => N;
  texture: (t: THREE_NS.Texture, uv: N) => N;
  uniform: (v: unknown) => N;
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
  see: GemSee,
  inCube: boolean,
): N {
  const W = T as unknown as Tsl;
  const { vec2, vec3, vec4, float, normalize, refract, reflect, select } = W;
  const { exp, max, min, abs, sqrt, sign, clamp, dot, mix, smoothstep } = W;
  const camObj = W.modelWorldMatrixInverse.mul(vec4(W.cameraPosition, 1)).xyz;
  const p0 = W.positionLocal;
  const n0 = normalize(W.normalLocal);
  const v = normalize(p0.sub(camObj));
  const absorb = vec3(...absorbOf(g, shape).map((x) => float(x)));
  const cubeInv = W.uniform(see.cubeInv);
  const envAt = (w: N) => W.pmremTexture(env, w, float(0));
  const boxPath = (p: N, d: N) => {
    // 0으로 나누지 않게 성분마다 1e-6보다 작아지지 않게(WGSL select는 스칼라 조건만 받는다)
    const safe = (c: N) =>
      select(c.lessThan(0), min(c, float(-1e-6)), max(c, float(1e-6)));
    const inv = vec3(1).div(vec3(safe(d.x), safe(d.y), safe(d.z)));
    const a = vec3(-GEM_CUBE_HALF).sub(p).mul(inv);
    const b = vec3(GEM_CUBE_HALF).sub(p).mul(inv);
    const lo = min(a, b);
    const hi = max(a, b);
    const t0 = max(max(lo.x, lo.y), max(lo.z, float(0)));
    const t1 = min(min(hi.x, hi.y), hi.z);
    return max(t1.sub(t0), float(0));
  };
  /** 물체 좌표의 나가는 점 p, 방향 d가 보는 빛(GLSL gemSee) */
  const seeAt = (p: N, d: N) => {
    const ow = normalize(W.modelWorldMatrix.mul(vec4(d, 0)).xyz);
    const envC = envAt(ow).rgb.mul(see.envGain);
    // 날개 조각 판은 닦은 금속 판 위에 붙어 있어 뒤가 배경이 아니라 금속(스튜디오를 비춘다)
    if (shape === "slab") return envC.mul(SLAB_ENV);
    const pw = W.modelWorldMatrix.mul(vec4(p, 1)).xyz;
    const view = normalize(pw.sub(W.cameraPosition));
    const behind = ow.z.lessThan(-1e-3);
    const w = select(
      behind,
      smoothstep(float(THROUGH_LO), float(THROUGH_HI), dot(ow, view)),
      float(0),
    );
    const t = float(see.backZ)
      .sub(pw.z)
      .div(select(behind, ow.z, float(-1)));
    const uv = pw.xy.add(ow.xy.mul(t)).div(see.backSize).add(vec2(0.5, 0.5));
    let back: N = W.texture(see.back, uv).rgb.mul(see.backGain);
    if (inCube) {
      const pc = cubeInv.mul(vec4(pw, 1)).xyz;
      const dc = normalize(cubeInv.mul(vec4(ow, 0)).xyz);
      back = back.mul(
        exp(absorb.mul(boxPath(pc, dc)).mul(GEM_CUBE_FILL).negate()),
      );
    }
    return mix(envC, back, w);
  };
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
      acc = acc.add(thr.mul(float(1).sub(F)).mul(seeAt(p, o)));
      thr = thr.mul(F);
      d = reflect(d, m);
      p = p.sub(m.mul(1e-4));
    }
    return acc.add(thr.mul(seeAt(p, d)));
  };
  const [r, gIor, b] = channelIor(g);
  return disperses(g)
    ? vec3(trace(r).x, trace(gIor).y, trace(b).z)
    : trace(gIor);
}
