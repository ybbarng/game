/**
 * 3D 엠블럼 시안이 어느 길로 그릴지 가른다(docs/47 14-7). 브라우저 이름이 아니라 기능으로 본다.
 *
 * - `hdr`: HDR 화면(`dynamic-range: high`)이고 WebGPU 캔버스가 흰색보다 밝은 값을 그대로 내보낼 수 있을 때
 *   (`toneMapping: { mode: "extended" }`를 받아들였는지 `getConfiguration()`으로 확인). 반짝임이 1.0보다 밝다.
 * - `bloom`: 그 밖의 보석. SDR에 밝은 곳이 번지는 효과로 반짝임을 흉내 낸다.
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

/** HDR 캔버스(WebGPU, rgba16float, toneMapping extended)를 쓸 수 있는지 */
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
