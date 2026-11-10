/**
 * 화면에 그려진 티어 엠블럼(`TierEmblem`, 인라인 SVG)을 PNG 그림으로(docs/47 15-20). 맥 앱 Cubie 메뉴의 프로필 칸이
 * 사이트와 같은 그림을 쓰게 웹이 그려 다리로 넘긴다.
 *
 * 그림 파일로 떼어 내면 문서의 CSS가 닿지 않으므로 두 가지를 그 안에 넣는다:
 * - 넓은 색역 색 `var(--emb-…, #hex)`는 기본 색 `#hex`로 바꾼다.
 * - 빛 띠·블럭 번쩍임은 숨기고 반짝임 점은 화면과 같은 밝기로 둔다(globals.css의 멈춘 모습).
 * 날개·왕관이 상자 밖으로 나가는 위 티어도 잘리지 않게 그린 범위(`getBBox`)로 상자를 넓힌다.
 */

const STILL_CSS = ".emb-band,.emb-block-flash{opacity:0}.emb-glint{opacity:.9}";

/** `var(--x, #abc)` → `#abc`(그림 안에는 CSS 변수가 없다) */
export function resolveEmblemVars(svg: string): string {
  return svg.replace(/var\(--[\w-]+,\s*([^()]+?)\)/g, "$1");
}

/** 그린 범위와 기본 상자를 합친 viewBox */
export function unionBox(
  box: { x: number; y: number; width: number; height: number },
  drawn: { x: number; y: number; width: number; height: number } | null,
): [number, number, number, number] {
  if (!drawn || !(drawn.width > 0) || !(drawn.height > 0))
    return [box.x, box.y, box.width, box.height];
  const x0 = Math.min(box.x, drawn.x);
  const y0 = Math.min(box.y, drawn.y);
  const x1 = Math.max(box.x + box.width, drawn.x + drawn.width);
  const y1 = Math.max(box.y + box.height, drawn.y + drawn.height);
  return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * `host` 안의 엠블럼 SVG를 가로 `px`(실제 화소, 2배 화면이면 두 배로 넘긴다) PNG data URL로. 실패하면 null
 */
export async function emblemPng(
  host: Element,
  px: number,
): Promise<string | null> {
  const svg = host.querySelector("svg");
  if (!svg) return null;
  const vb = svg.viewBox.baseVal;
  let drawn: DOMRect | null = null;
  try {
    drawn = svg.getBBox();
  } catch {
    drawn = null;
  }
  const [x, y, w, h] = unionBox(
    { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
    drawn,
  );
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  const height = Math.round((px * h) / w);
  clone.setAttribute("width", String(px));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = STILL_CSS;
  clone.insertBefore(style, clone.firstChild);
  const text = resolveEmblemVars(new XMLSerializer().serializeToString(clone));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("emblem"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, px, height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
