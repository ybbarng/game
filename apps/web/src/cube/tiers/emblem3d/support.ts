/**
 * 3D 엠블럼이 어느 길로 그릴지 가른다(docs/47 14-7). 브라우저 이름이 아니라 기능으로 본다.
 *
 * - `hdr`: 보석, HDR 화면(`hdrScreen`·`canHdrCanvas`). WebGPU 캔버스에 SDR 길과 같은 생김새를 그리고 반짝임만 흰색보다
 *   밝게 내보낸다(`stage.ts` `HDR_HEADROOM`). `?emblem3d=hdr`면 SDR 화면에서도 켠다(시험·찍기).
 * - `bloom`: 보석, 그 밖. SDR에 밝은 곳이 번지는 효과로 반짝임을 흉내 낸다.
 * - `plain`: 금속(골드). 번짐 없이 그린다.
 * - 3D를 못 그리면(WebGL2 없음, 시험의 3D 끄기) 지금 SVG 엠블럼을 보인다.
 */

export type DrawPath = "hdr" | "bloom" | "plain";

/** 시험·사람이 길을 고정해 볼 때(`?emblem3d=hdr|bloom`). 제품 화면은 쓰지 않는다 */
export function pathOverride(search: string): DrawPath | null {
  const v = new URLSearchParams(search).get("emblem3d");
  return v === "hdr" || v === "bloom" ? v : null;
}

/** WebGL2로 그릴 수 있는지. 화면 시험의 「3D 끄기」(`window.__cubeNo3d`)도 여기서 거른다 */
export function canDraw3d(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as { __cubeNo3d?: boolean }).__cubeNo3d === true) return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// WebGPU 형 이름을 전역에 들이지 않으려고 쓰는 만큼만 적는다
interface GpuDevice {
  destroy(): void;
}
interface GpuAdapter {
  requestDevice(): Promise<GpuDevice>;
}
interface GpuLike {
  requestAdapter(): Promise<GpuAdapter | null>;
}
interface GpuCanvasContext {
  configure(c: Record<string, unknown>): void;
  getConfiguration?(): { toneMapping?: { mode?: string } } | null;
}

/**
 * HDR 화면이고 브라우저가 흰색보다 밝은 그림을 그대로 그리는지(`dynamic-range: high`와 `dynamic-range-limit` 지원,
 * Chrome 136+·Safari 26+). HDR 대기 그림을 보이는 CSS 조건(`emblem.css` `.emblem3d-hdr-poster`)과 같다. 그래서 대기
 * 그림과 3D 길이 같은 밝기를 고른다
 */
export function hdrScreen(): boolean {
  try {
    return (
      matchMedia("(dynamic-range: high)").matches &&
      CSS.supports("dynamic-range-limit", "no-limit")
    );
  } catch {
    return false;
  }
}

/** HDR 캔버스(WebGPU, rgba16float, toneMapping extended)를 쓸 수 있는지. HDR 화면(`hdrScreen`)에서 보석 티어가 쓴다 */
export async function canHdrCanvas(): Promise<boolean> {
  try {
    if (!matchMedia("(dynamic-range: high)").matches) return false;
    const gpu = (navigator as { gpu?: GpuLike }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext(
        "webgpu" as "2d",
      ) as unknown as GpuCanvasContext | null;
      if (!ctx) return false;
      ctx.configure({
        device,
        format: "rgba16float",
        toneMapping: { mode: "extended" },
        alphaMode: "premultiplied",
      });
      return ctx.getConfiguration?.()?.toneMapping?.mode === "extended";
    } finally {
      device.destroy();
    }
  } catch {
    return false;
  }
}
