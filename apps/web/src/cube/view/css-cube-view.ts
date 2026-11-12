import {
  apply,
  type Camera,
  cameraFor,
  cssMatrix,
  cssRotate,
  cubeDist,
  faceRotation,
  type Mat4,
  mirrorFlatten,
  mirrorShownAt,
  multiply,
  panelMatrix,
  perspectivePx,
  project,
  rootMatrix,
  rotation,
  snap,
  toCss,
  translation,
} from "./css-math";
import {
  coordOfLayer,
  cubiePositions,
  inMove,
  moveAngle,
  moveDuration,
  normalOf,
  normalVec,
  solvedStickers,
  type Vec3,
} from "./geometry";
import {
  cellPoint,
  MIRROR_CELL,
  MIRROR_FADE_MS,
  MIRROR_PAD,
  MIRROR_PLATE_RADIUS,
  MIRROR_STICKER,
  type MirrorFade,
  type MirrorPanel,
  mirrorFadeAt,
  mirrorPanels,
} from "./mirror";
import {
  type CubeMove,
  type CubeScene,
  type CubeViewOptions,
  DEFAULT_COLORS,
  MAX_CUBE_SIZE,
  type MarkTone,
  MIN_CUBE_SIZE,
  type Normal,
  type Sticker,
} from "./types";

/**
 * CSS 3D 큐브 장면(docs/52 5-4, Cubie 미니 화면의 실험 주소 `?render=css`). three.js(WebGL) 대신
 * `transform-style: preserve-3d`인 상자들로 조각·스티커를 그리고, 층 돌리기는 Web Animations의 `transform`으로만 한다.
 *
 * 왜: 맥 그래픽 드라이버는 GPU로 그리기를 보낸 프로세스에 약 108MB를 붙인다(docs/52 5-3). CSS 3D는 WebKit이 층을
 * Core Animation 층(`CATransformLayer`)으로 넘기고 움직임도 합성기가 맡아, 웹 쪽 프로세스가 장마다 그리지 않는다.
 * 그래서 이 장면은 **돌리는 동안 칸의 색이나 글자를 바꾸지 않는다**(다시 칠하면 GPU 프로세스가 그려 108MB가 다시 붙는다).
 * 색은 `setStickers`(섞기·판 바꾸기)에서만 칠하고, 수 하나는 조각 상자의 행렬만 바꾼다.
 *
 * - 큐브: 조각마다 상자 하나와 면 여섯(겉면은 스티커 색 + 검은 테두리, 속면은 검정). 층을 돌릴 때는 그 층 조각을
 *   돌림 상자에 옮겨 그 상자를 돌리고, 끝나면 각을 조각 행렬에 굳혀 다시 큐브로 옮긴다(`css3d-mini.html` 시안과 같다).
 * - 거울 판(뒤·왼쪽·아래): 판마다 **큐브 스티커를 한 벌 더** 두고 판 평면으로 눌러(`mirrorFlatten`) 거울상을 만든다.
 *   돌리기도 같은 행렬로 함께 돌아, 수마다 판 칸을 다시 칠하지 않는다. 판 밖으로 나가는 면은 깊이로 가린다.
 * - 카메라·판 자리는 3D 장면(`cube-view.ts`)과 같은 식이라 같은 창에서 같은 크기·자리에 온다.
 * - 조명·광택은 없다(면마다 평평한 색, 옅은 비스듬한 빛 띠로 흉내). 끌어 둘러보기·밀기·칸 표시도 없다
 *   (Cubie는 마우스 둘러보기를 끄고, 미니 화면은 칸 표시를 쓰지 않는다).
 */

const CUBIE = 0.97;
const STICKER_INSET = 0.1;
const RADIUS = 0.13;
const BODY = "#0d0d0f";
const STICKERLESS_BODY = "#1a1a1c";
const HIDDEN_COLOR = { black: 0x111111, gray: 0x6b6b6b } as const;
const MIRROR_TINT = 0.86;
/** 장면 행렬을 1:1로 그릴 때 한 칸(px)과 지금 한 칸이 이 비율을 넘게 벌어지면 상자를 다시 만든다(흐림 방지) */
const REBUILD_RATIO = 1.6;
const PITCH_LIMIT = 80;
const DEFAULT_YAW = 32;
const DEFAULT_PITCH = 26;
/** 3D 장면의 `easeInOut`(세제곱)과 같은 곡선 */
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const NORMALS: readonly Normal[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

interface Cubie {
  home: Vec3;
  /** 세계 행렬(조각 중심·방향) */
  m: Mat4;
  /** 판마다(0 = 큐브, 1~3 = 거울 판) 조각 상자 */
  els: HTMLDivElement[];
  /** 겉면(스티커가 붙는 면): 제자리 기준 면 방향 → 판마다 면 상자 */
  faces: Map<Normal, HTMLDivElement[]>;
}

interface Running {
  move: CubeMove;
  members: number[];
  pivots: HTMLDivElement[];
  anims: Animation[];
  /** 자르는 면에 둔 검은 판 중 돌지 않는 쪽(도는 쪽은 돌림 상자와 함께 버린다) */
  cuts: HTMLDivElement[];
}

const slotKey = (c: readonly number[], n: Normal) =>
  `${c.map((v) => Math.round(v * 2)).join(",")}|${n}`;

function hex(color: number, tint = 1): string {
  const r = Math.round(((color >> 16) & 255) * tint);
  const g = Math.round(((color >> 8) & 255) * tint);
  const b = Math.round((color & 255) * tint);
  return `rgb(${r},${g},${b})`;
}

function div(css: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = css;
  return d;
}

const BOX =
  "position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d;";

export class CssCubeView implements CubeScene {
  readonly n: number;
  private readonly host: HTMLElement;
  private readonly cubies: Cubie[] = [];
  /** 스티커 자리(제자리 조각 중심·면) → 색 번호(null = 가림) */
  private readonly slots = new Map<string, { cubie: number; normal: Normal }>();
  private readonly colorOf = new Map<string, number | null>();
  private readonly reduced: MediaQueryList | null;

  private colors: readonly number[];
  private stickerless: boolean;
  private moveMs: number;
  private hidden: "black" | "gray";

  private stage: HTMLDivElement | null = null;
  private root: HTMLDivElement | null = null;
  private spinEl: HTMLDivElement | null = null;
  /** 판마다 조각을 담는 상자(0 = 큐브) */
  private holders: HTMLDivElement[] = [];
  private panelEls: HTMLDivElement[] = [];
  private panels: MirrorPanel[] | null = null;
  private unit = 0;

  private queue: { move: CubeMove; ms?: number }[] = [];
  private pumping = false;
  private running: Running | null = null;
  private spinAnim: Animation | null = null;
  private done = 0;
  private disposed = false;

  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private mirrorFade = 0;
  private fading: MirrorFade | null = null;
  private fadeAnims: Animation[] = [];
  private fadeTimer = 0;
  private width = 1;
  private height = 1;

  static create(host: HTMLElement, options: CubeViewOptions): CssCubeView {
    return new CssCubeView(host, options);
  }

  private constructor(host: HTMLElement, o: CubeViewOptions) {
    if (!Number.isInteger(o.n) || o.n < MIN_CUBE_SIZE || o.n > MAX_CUBE_SIZE)
      throw new Error(`큐브 크기가 맞지 않습니다: ${o.n}`);
    this.n = o.n;
    this.host = host;
    this.colors = o.colors ?? DEFAULT_COLORS;
    this.stickerless = o.stickerless ?? false;
    this.moveMs = Math.min(200, Math.max(0, o.moveMs ?? 90));
    this.hidden = o.hidden ?? "black";
    this.reduced =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const h = (this.n - 1) / 2;
    for (const home of cubiePositions(this.n)) {
      const i = this.cubies.length;
      const faces = new Map<Normal, HTMLDivElement[]>();
      for (const normal of NORMALS) {
        const v = normalVec(normal);
        const a = v.findIndex((c) => c !== 0);
        // 겉면: 그 축의 끝(±h)에서 바깥을 향한 면
        if ((home[a] ?? 0) * (v[a] ?? 0) !== h) continue;
        faces.set(normal, []);
        this.slots.set(slotKey(home, normal), { cubie: i, normal });
      }
      this.cubies.push({
        home,
        m: translation(home[0], home[1], home[2]),
        els: [],
        faces,
      });
    }
    for (const s of solvedStickers(this.n))
      this.colorOf.set(slotKey(s.center, s.normal), s.color);

    host.dataset.cubeRender = "css";
    host.dataset.cubeMirror = "off";
    this.resize(host.clientWidth || 300, host.clientHeight || 300);
    if (o.mirror) this.setMirror(true);
    if (
      typeof window !== "undefined" &&
      (window as { __cubeTestHooks?: boolean }).__cubeTestHooks
    )
      (host as unknown as { __cubeView?: CssCubeView }).__cubeView = this;
  }

  // ---------------------------------------------------------------- 상자 만들기

  /** 상자를 (다시) 만든다. 한 칸 = `unit` px */
  private build(unit: number): void {
    this.stopRunning(true);
    this.stage?.remove();
    this.unit = unit;
    const stage = div(
      "position:absolute;inset:0;overflow:visible;pointer-events:none;",
    );
    const root = div(`${BOX}left:50%;top:50%;`);
    const spin = div(BOX);
    const cube = div(BOX);
    spin.appendChild(cube);
    root.appendChild(spin);
    stage.appendChild(root);
    this.stage = stage;
    this.root = root;
    this.spinEl = spin;
    this.holders = [cube];
    this.panelEls = [];
    for (const c of this.cubies) {
      c.els = [];
      for (const list of c.faces.values()) list.length = 0;
    }
    this.buildCube(cube);
    if (this.panels) this.buildPanels(root, this.panels);
    this.host.appendChild(stage);
    this.paintColors(true);
    for (const c of this.cubies) this.writeCubie(c);
  }

  private buildCube(holder: HTMLDivElement): void {
    const u = this.unit;
    // 큐브 면은 조각 사이 틈 없이 살짝 겹친다(틈이 투명하면 그 사이로 윤곽 선이 비친다)
    const size = 1.02 * u;
    for (const c of this.cubies) {
      const el = div(BOX);
      // 겉면만 둔다. 속면은 층을 돌리는 동안만 자르는 면에 검은 판으로 대신한다(`cutPlanes`, 층 수가 3×3에서 156 → 54)
      for (const normal of c.faces.keys()) {
        // 조각 면은 거의 네모(둥글게 깎으면 그 틈으로 뒤쪽 칸 색이 비친다). 스티커는 변환 없는 자식 상자라 면과
        // 같은 층에 한 번 칠해진다(층이 늘지 않는다)
        const f = div(
          `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;` +
            // 뒤를 향한 면은 그리지 않는다(큐브 장면은 뒤집는 변환이 없어 엔진마다 같게 가린다)
            `border-radius:${0.03 * u}px;background:${this.body()};backface-visibility:hidden;` +
            `transform:${cssMatrix(toCss(multiply(faceRotation(normal), translation(0, 0, 0.5)), u))};`,
        );
        const list = c.faces.get(normal);
        if (list) {
          const sticker = div("position:absolute;");
          f.appendChild(sticker);
          list.push(sticker);
        }
        el.appendChild(f);
      }
      c.els.push(el);
      holder.appendChild(el);
    }
  }

  private buildPanels(root: HTMLDivElement, panels: MirrorPanel[]): void {
    const u = this.unit;
    const n = this.n;
    const h = (n - 1) / 2;
    const plate = (n + MIRROR_PAD * 2) * MIRROR_CELL * u;
    const cell = CUBIE * u;
    for (const p of panels) {
      // 판: 평평한 상자(안의 3D를 판 평면으로 누른다). 바탕 유리 + 거울상 한 벌
      const panel = div(
        `position:absolute;left:0;top:0;width:0;height:0;transform:${cssMatrix(toCss(panelMatrix(p), u))};opacity:0;visibility:hidden;`,
      );
      panel.appendChild(
        div(
          `position:absolute;left:${-plate / 2}px;top:${-plate / 2}px;width:${plate}px;height:${plate}px;box-sizing:border-box;` +
            `border-radius:${MIRROR_PLATE_RADIUS * MIRROR_CELL * u}px;border:1px solid rgba(255,255,255,0.26);` +
            "background:linear-gradient(135deg,rgba(46,56,78,0.62),rgba(14,18,28,0.5));",
        ),
      );
      const copy = div(
        `${BOX}transform:${cssMatrix(toCss(mirrorFlatten(p, MIRROR_CELL), u))};`,
      );
      // 판 밖을 향한 면(큐브의 나머지 스티커)을 가리는 판: 그 면 바로 안쪽 깊이
      const out: Vec3 = [-p.facing[0], -p.facing[1], -p.facing[2]];
      const side = n * u;
      copy.appendChild(
        div(
          `position:absolute;left:${-side / 2}px;top:${-side / 2}px;width:${side}px;height:${side}px;` +
            `background:rgb(24,30,44);border-radius:${0.06 * side}px;` +
            `transform:${cssMatrix(toCss(multiply(translation(out[0] * (h + 0.2), out[1] * (h + 0.2), out[2] * (h + 0.2)), faceRotation(normalOf(out))), u))};`,
        ),
      );
      const holder = div(BOX);
      copy.appendChild(holder);
      for (const c of this.cubies) {
        const el = div(BOX);
        for (const [normal, list] of c.faces) {
          const f = div(
            `position:absolute;left:${-cell / 2}px;top:${-cell / 2}px;width:${cell}px;height:${cell}px;` +
              `box-sizing:border-box;border:${((CUBIE - MIRROR_STICKER) / 2) * u}px solid transparent;background-clip:padding-box;` +
              `border-radius:${0.16 * u}px;` +
              `transform:${cssMatrix(toCss(multiply(faceRotation(normal), translation(0, 0, CUBIE / 2)), u))};`,
          );
          list.push(f);
          el.appendChild(f);
        }
        c.els.push(el);
        holder.appendChild(el);
      }
      panel.appendChild(copy);
      root.appendChild(panel);
      this.holders.push(holder);
      this.panelEls.push(panel);
    }
  }

  private body(): string {
    return this.stickerless ? STICKERLESS_BODY : BODY;
  }

  /** 겉면 색을 칠한다(바뀐 칸만, `all`이면 모두). 칸을 다시 칠하는 일은 여기에서만 생긴다 */
  private paintColors(all = false, changed?: Set<string>): void {
    const inset = (this.stickerless ? 0.012 : STICKER_INSET) * this.unit;
    for (const [key, slot] of this.slots) {
      if (!all && !changed?.has(key)) continue;
      const c = this.cubies[slot.cubie];
      const list = c?.faces.get(slot.normal);
      if (!list) continue;
      const color = this.colorOf.get(key) ?? null;
      const value =
        color === null
          ? HIDDEN_COLOR[this.hidden]
          : (this.colors[color] ?? HIDDEN_COLOR[this.hidden]);
      list.forEach((f, i) => {
        if (i === 0) {
          f.style.inset = `${inset}px`;
          f.style.borderRadius = `${(this.stickerless ? 0.03 : RADIUS) * this.unit}px`;
          f.style.background = `linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0) 55%,rgba(0,0,0,0.1)) ${hex(value)}`;
        } else f.style.background = hex(value, MIRROR_TINT);
      });
    }
  }

  private writeCubie(c: Cubie): void {
    const t = cssMatrix(toCss(c.m, this.unit));
    for (const el of c.els) el.style.transform = t;
  }

  // ---------------------------------------------------------------- 상태

  setStickers(stickers: readonly Sticker[]): void {
    this.queue = [];
    this.stopRunning(false);
    for (const c of this.cubies) {
      c.m = translation(c.home[0], c.home[1], c.home[2]);
      this.writeCubie(c);
    }
    const next = new Map<string, number | null>();
    for (const key of this.slots.keys()) next.set(key, null);
    for (const s of stickers) {
      const key = slotKey(s.center, s.normal);
      if (next.has(key)) next.set(key, s.color);
    }
    const changed = new Set<string>();
    for (const [key, color] of next)
      if (this.colorOf.get(key) !== color) {
        this.colorOf.set(key, color);
        changed.add(key);
      }
    if (changed.size > 0) this.paintColors(false, changed);
  }

  /** 미니 화면은 칸 표시를 쓰지 않는다(받기만 한다) */
  setMarks(_marks: readonly (MarkTone | null)[] | null): void {}

  setOptions(
    o: Partial<
      Pick<CubeViewOptions, "colors" | "stickerless" | "moveMs" | "hidden">
    >,
  ): void {
    if (o.moveMs !== undefined)
      this.moveMs = Math.min(200, Math.max(0, o.moveMs));
    let repaint = false;
    if (o.colors && o.colors.join() !== this.colors.join()) {
      this.colors = o.colors;
      repaint = true;
    }
    if (o.hidden && o.hidden !== this.hidden) {
      this.hidden = o.hidden;
      repaint = true;
    }
    if (o.stickerless !== undefined && o.stickerless !== this.stickerless) {
      this.stickerless = o.stickerless;
      for (const c of this.cubies)
        for (const el of c.els[0]?.children ?? [])
          (el as HTMLElement).style.background = this.body();
      repaint = true;
    }
    if (repaint) this.paintColors(true);
  }

  /** 지금 스티커(조각 행렬로 계산, 시험이 장면이 맞춘 모양인지 본다) */
  stickers(): Sticker[] {
    const out: Sticker[] = [];
    for (const [key, slot] of this.slots) {
      const c = this.cubies[slot.cubie];
      if (!c) continue;
      const nv = normalVec(slot.normal);
      const lin = [...c.m.slice(0, 12), 0, 0, 0, 1];
      out.push({
        center: apply(c.m, [0, 0, 0]).map((v) => Math.round(v * 2) / 2 + 0) as [
          number,
          number,
          number,
        ],
        normal: normalOf(apply(lin, nv)),
        color: this.colorOf.get(key) ?? null,
      });
    }
    return out;
  }

  get movesDone(): number {
    return this.done;
  }

  get idle(): boolean {
    return !this.running && this.queue.length === 0;
  }

  // ---------------------------------------------------------------- 돌리기

  enqueue(move: CubeMove, ms?: number): void {
    if (this.disposed) return;
    if (this.running) this.finish(this.running);
    this.queue.push(ms === undefined ? { move } : { move, ms });
    if (this.pumping) return;
    this.pumping = true;
    // 같은 순간에 들어온 수는 모아서: 마지막 하나만 돌리고 앞의 것은 바로 끝낸 자리로
    queueMicrotask(() => {
      this.pumping = false;
      this.pump();
    });
  }

  private pump(): void {
    if (this.disposed) return;
    while (this.queue.length > 1) {
      const q = this.queue.shift();
      if (q) this.turnNow(q.move);
    }
    const q = this.queue.shift();
    if (!q) return;
    const ms = this.reduced?.matches
      ? 0
      : (q.ms ?? moveDuration(this.moveMs, q.move));
    if (ms <= 0 || typeof Element.prototype.animate !== "function") {
      this.turnNow(q.move);
      return;
    }
    const members = this.membersOf(q.move);
    const angle = moveAngle(q.move);
    const r: Running = {
      move: q.move,
      members,
      pivots: [],
      anims: [],
      cuts: [],
    };
    // 거울 판이 안 보이면 판 쪽 조각은 돌리지 않고 끝난 자리만 쓴다(돌림 상자·애니메이션 셋을 아낀다)
    const shown = mirrorShownAt(this.yaw, this.pitch, this.mirrorFade) > 0.01;
    for (const holder of shown ? this.holders : this.holders.slice(0, 1)) {
      const pivot = div(BOX);
      holder.appendChild(pivot);
      r.pivots.push(pivot);
    }
    // 큐브 속이 드러나는 자르는 면: 도는 층 쪽과 나머지 쪽에 검은 판 하나씩
    const main = this.holders[0];
    const pivot0 = r.pivots[0];
    if (main && pivot0)
      for (const t of this.cutPlanes(q.move)) {
        const still = div(t);
        main.appendChild(still);
        r.cuts.push(still);
        pivot0.appendChild(div(t));
      }
    const k = r.pivots.length;
    for (const i of members) {
      const c = this.cubies[i];
      c?.els.forEach((el, j) => {
        if (j < k) r.pivots[j]?.appendChild(el);
      });
    }
    for (const pivot of r.pivots)
      r.anims.push(
        pivot.animate(
          [
            { transform: cssRotate(q.move.axis, 0) },
            { transform: cssRotate(q.move.axis, angle) },
          ],
          { duration: ms, easing: EASE, fill: "forwards" },
        ),
      );
    this.running = r;
    const first = r.anims[0];
    if (first)
      first.onfinish = () => {
        if (this.running === r) this.finish(r);
      };
  }

  /** 수가 큐브를 자르는 면마다 검은 판의 CSS(큐브 전체 돌리기는 자르지 않는다) */
  private cutPlanes(move: CubeMove): string[] {
    const n = this.n;
    const u = this.unit;
    const side = n * u;
    const axis = { x: 0, y: 1, z: 2 }[move.axis];
    const normal = `+${move.axis}` as Normal;
    const at: number[] = [];
    if (move.from > 1) at.push(coordOfLayer(n, move.from) + 0.5);
    if (move.to < n) at.push(coordOfLayer(n, move.to) - 0.5);
    return at.map((c) => {
      const t: [number, number, number] = [0, 0, 0];
      t[axis] = c;
      return (
        `position:absolute;left:${-side / 2}px;top:${-side / 2}px;width:${side}px;height:${side}px;background:${this.body()};` +
        `transform:${cssMatrix(toCss(multiply(translation(t[0], t[1], t[2]), faceRotation(normal)), u))};`
      );
    });
  }

  private membersOf(move: CubeMove): number[] {
    const out: number[] = [];
    this.cubies.forEach((c, i) => {
      if (inMove(this.n, move, apply(c.m, [0, 0, 0]))) out.push(i);
    });
    return out;
  }

  /** 수 하나를 움직임 없이 끝낸 자리로 */
  private turnNow(move: CubeMove): void {
    const rot = rotation(move.axis, moveAngle(move));
    for (const i of this.membersOf(move)) {
      const c = this.cubies[i];
      if (!c) continue;
      c.m = snap(multiply(rot, c.m));
      this.writeCubie(c);
    }
    this.done++;
  }

  /** 도는 수를 끝까지: 각을 조각 행렬에 굳히고 조각을 큐브로 돌려놓은 뒤 돌림 상자를 버린다(같은 순간이라 깜빡이지 않는다) */
  private finish(r: Running): void {
    const rot = rotation(r.move.axis, moveAngle(r.move));
    for (const i of r.members) {
      const c = this.cubies[i];
      if (!c) continue;
      c.m = snap(multiply(rot, c.m));
      this.writeCubie(c);
    }
    this.release(r);
    this.done++;
  }

  private release(r: Running): void {
    const k = r.pivots.length;
    for (const i of r.members)
      this.cubies[i]?.els.forEach((el, j) => {
        if (j < k) this.holders[j]?.appendChild(el);
      });
    for (const a of r.anims) a.cancel();
    for (const p of r.pivots) p.remove();
    for (const c of r.cuts) c.remove();
    if (this.running === r) this.running = null;
  }

  /** 도는 수를 멈춘다. `apply`면 끝낸 자리로, 아니면 버린다 */
  private stopRunning(applyIt: boolean): void {
    const r = this.running;
    if (!r) return;
    if (applyIt) this.finish(r);
    else this.release(r);
  }

  spin(ms: number): void {
    if (this.disposed) return;
    this.spinAnim?.cancel();
    this.spinAnim = null;
    if (ms <= 0 || this.reduced?.matches || !this.spinEl?.animate) return;
    this.spinAnim = this.spinEl.animate(
      [{ transform: "rotateY(0deg)" }, { transform: "rotateY(360deg)" }],
      { duration: ms, easing: EASE },
    );
  }

  // ---------------------------------------------------------------- 보기·거울

  setMirror(on: boolean, fade = false): void {
    if (this.disposed) return;
    if (on && !this.panels) {
      this.panels = mirrorPanels(this.n);
      if (this.root) this.buildPanels(this.root, this.panels);
      for (const c of this.cubies) this.writeCubie(c);
      this.paintColors(true);
    }
    const to = on ? 1 : 0;
    const now = performance.now();
    const from = this.fading ? mirrorFadeAt(this.fading, now) : this.mirrorFade;
    this.stopFade();
    if (!fade || this.reduced?.matches || from === to) {
      this.mirrorFade = to;
      this.applyView();
      return;
    }
    this.fading = { from, to, start: now };
    this.mirrorFade = to;
    this.animateFade(from, to, MIRROR_FADE_MS * Math.abs(to - from));
  }

  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
    this.stopFade();
    this.applyView();
  }

  /** 끌어 둘러보기가 없어 처음 각에서 벗어나는 일이 없다 */
  resetView(): boolean {
    return false;
  }

  onViewTurn(fn: (turned: boolean) => void): () => void {
    fn(false);
    return () => {};
  }

  private camera(fade = this.mirrorFade): Camera {
    return cameraFor(
      this.n,
      this.width / this.height,
      this.yaw,
      this.pitch,
      this.panels,
      fade,
    );
  }

  private rootTransform(fade = this.mirrorFade): string {
    const P = perspectivePx(this.height);
    const k = P / cubeDist(this.n, this.width / this.height);
    return cssMatrix(rootMatrix(this.camera(fade), P, k, this.unit));
  }

  /** 다 바뀐 자리로 바로 */
  private applyView(): void {
    if (!this.root) return;
    this.root.style.transform = this.rootTransform();
    const shown = mirrorShownAt(this.yaw, this.pitch, this.mirrorFade);
    for (const p of this.panelEls) {
      p.style.opacity = `${shown}`;
      p.style.visibility = shown > 0.01 ? "visible" : "hidden";
    }
    this.host.dataset.cubeMirror = shown > 0.5 ? "on" : "off";
  }

  /** 판이 짙어지거나 옅어지는 동안 카메라도 판까지 담는 자리로 옮긴다(3D 장면과 같은 길을 몇 장면으로 나눠 잇는다) */
  private animateFade(from: number, to: number, ms: number): void {
    const root = this.root;
    if (!root || typeof root.animate !== "function") {
      this.applyView();
      return;
    }
    const steps = 8;
    const frames: Keyframe[] = [];
    const op: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = from + ((to - from) * i) / steps;
      frames.push({ transform: this.rootTransform(f) });
      op.push({ opacity: mirrorShownAt(this.yaw, this.pitch, f) });
    }
    for (const p of this.panelEls) p.style.visibility = "visible";
    const opt: KeyframeAnimationOptions = { duration: ms, fill: "forwards" };
    this.fadeAnims = [
      root.animate(frames, opt),
      ...this.panelEls.map((p) => p.animate(op, opt)),
    ];
    this.host.dataset.cubeMirror =
      mirrorShownAt(this.yaw, this.pitch, to) > 0.5 ? "on" : "off";
    this.fadeTimer = window.setTimeout(() => {
      this.fading = null;
      this.applyView();
      for (const a of this.fadeAnims) a.cancel();
      this.fadeAnims = [];
    }, ms);
  }

  private stopFade(): void {
    window.clearTimeout(this.fadeTimer);
    for (const a of this.fadeAnims) a.cancel();
    this.fadeAnims = [];
    this.fading = null;
  }

  hitRects(): { x: number; y: number; w: number; h: number }[] {
    const cam = this.camera();
    const rectOf = (points: readonly Vec3[]) => {
      let x0 = Number.POSITIVE_INFINITY;
      let y0 = Number.POSITIVE_INFINITY;
      let x1 = Number.NEGATIVE_INFINITY;
      let y1 = Number.NEGATIVE_INFINITY;
      for (const p of points) {
        const s = project(cam, this.width, this.height, p);
        if (!s) continue;
        x0 = Math.min(x0, s.x);
        y0 = Math.min(y0, s.y);
        x1 = Math.max(x1, s.x);
        y1 = Math.max(y1, s.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const h = (this.n / 2) * 1.15;
    const corners: Vec3[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) corners.push([sx * h, sy * h, sz * h]);
    const out = [rectOf(corners)];
    if (
      this.panels &&
      mirrorShownAt(this.yaw, this.pitch, this.mirrorFade) > 0.5
    ) {
      const e = this.n / 2 + MIRROR_PAD;
      for (const p of this.panels)
        out.push(
          rectOf([
            cellPoint(p, -e, -e),
            cellPoint(p, -e, e),
            cellPoint(p, e, -e),
            cellPoint(p, e, e),
          ]),
        );
    }
    return out;
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const P = perspectivePx(this.height);
    const k = P / cubeDist(this.n, this.width / this.height);
    const want = Math.max(4, Math.round(k));
    if (
      !this.stage ||
      want / this.unit > REBUILD_RATIO ||
      this.unit / want > REBUILD_RATIO
    )
      this.build(want);
    if (this.stage) this.stage.style.perspective = `${P}px`;
    this.stopFade();
    this.applyView();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFade();
    this.stopRunning(false);
    this.spinAnim?.cancel();
    this.stage?.remove();
    this.stage = null;
    this.root = null;
  }
}
