// @vitest-environment jsdom
import { ManualClock } from "@game/fair-play";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { astronautOf } from "../astronaut/identity";
import { FX } from "../fx-timing";
import { DEMO_NS, type Services } from "../services";
import type { KeyInfo } from "../wallet";
import { useAstronautSetup, WelcomeFlyer } from "./AstronautSetup";
import {
  type ApplyStage,
  addressLine,
  applyText,
  fillPlan,
  RegisterForm,
  writtenAt,
} from "./RegisterForm";

/*
 * 우주인 등록 신청서: 지문 서명으로 완성하는 서류(docs/36 11-65). 지문 단추가 그 누름 안에서 패스키를 만들고, 서명 뒤에야
 * 밀어 올려 낼 수 있으며, 낼 때는 패스키 창을 다시 열지 않는다
 */

/** 등록증 계산에 쓰는 공개 열쇠(P-256 비압축 꼴 65바이트: 0x04 + x + y. 등록증·지문 도장은 해시만 하므로 곡선 위 점일 필요는 없다) */
const PUB = Uint8Array.from({ length: 65 }, (_, i) =>
  i === 0 ? 0x04 : (i * 37 + 11) & 0xff,
);

let coarse = false;
beforeEach(() => {
  coarse = false;
  window.matchMedia = ((q: string) => ({
    matches: coarse && q.includes("coarse"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

function form(
  stage: ApplyStage,
  over: Partial<Parameters<typeof RegisterForm>[0]> = {},
) {
  const props = {
    stage,
    now: Date.UTC(2026, 10, 3, 5, 7),
    touch: true,
    pub: null,
    onSign: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  return { ...render(<RegisterForm {...props} />), props };
}

const sheet = (c: HTMLElement) =>
  c.querySelector("[aria-label='신청서 제출']") as HTMLElement;
const finger = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>("[data-id-finger]");
const status = (c: HTMLElement) =>
  c.querySelector("[role='status']")?.textContent;

describe("신청서 칸", () => {
  it("신청 구분·작성일·성명·주소·신분 확인·서명. 등록번호는 등록증에만 있다", () => {
    const { container } = form("sign");
    const heads = [...container.querySelectorAll("th")].map(
      (t) => t.textContent,
    );
    expect(heads).toEqual([
      "신청 구분",
      "작성일",
      "성명",
      "주소",
      "신분 확인",
      "서명",
    ]);
    expect(container.textContent).not.toContain("등록번호");
    expect(container.textContent).not.toContain("우주국이 부여합니다");
    expect(container.textContent).toContain("이 기기의 지문·얼굴");
  });

  it("작성일은 한국 시각 날짜와 시각", () => {
    expect(writtenAt(Date.UTC(2026, 10, 3, 5, 7))).toBe("2026. 11. 3. 14:07");
    expect(writtenAt(Date.UTC(2026, 10, 3, 15, 30))).toBe("2026. 11. 4. 00:30");
  });

  it("서명 전에는 성명·주소가 비어 있고 서명 칸에는 도장이 없다", () => {
    const { container } = form("sign");
    for (const f of ["name", "address"])
      expect(
        container.querySelector(`[data-register-field='${f}']`)?.textContent,
      ).toBe("");
    expect(container.querySelector("[data-register-signed]")).toBeNull();
    expect(container.querySelector("[data-fingermark]")).toBeNull();
  });
});

describe("서명 전: 지문 단추", () => {
  it("위쪽 문구는 터치 화면이면 지문, PC면 「본인 확인」을 가리키고, 그 아래 안심 한 줄", () => {
    const touch = form("sign", { touch: true }).container;
    expect(status(touch)).toBe("지문을 눌러 신청서에 서명해 주세요.");
    expect(touch.querySelector("[data-register-note]")?.textContent).toBe(
      "지문·얼굴 정보는 이 기기 밖으로 나가지 않습니다. 이름·이메일·비밀번호는 받지 않습니다.",
    );
    cleanup();
    const pc = form("sign", { touch: false }).container;
    expect(status(pc)).toBe("「본인 확인」을 눌러 신청서에 서명해 주세요.");
    expect(applyText("submit", true)).toBe(
      "신청서를 밀어 올려서 제출해 주세요.",
    );
    expect(applyText("submit", false)).toBe(applyText("submit", true));
  });

  it("지문 단추를 누르면 그 처리기 안에서 바로 onSign(기다림 없이)", () => {
    const { container, props } = form("sign");
    const f = finger(container) as HTMLButtonElement;
    expect(f.getAttribute("aria-label")).toBe("본인 확인으로 신청서 서명");
    expect(f.textContent).toBe("본인 확인");
    fireEvent.click(f);
    expect(props.onSign).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("서명 전에는 신청서를 밀거나 눌러도 내지 않는다", () => {
    const { container, props } = form("sign");
    const s = sheet(container);
    expect(s.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(s, { key: "Enter" });
    fireEvent.keyDown(s, { key: "ArrowUp" });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("앱 안 안내가 뜨면 안심 줄은 걷고, 패스키를 만드는 동안 지문 단추와 「취소」는 숨는다", () => {
    const help = form("sign", { help: <p>안내</p> }).container;
    expect(help.querySelector("[data-register-help]")).not.toBeNull();
    expect(help.querySelector("[data-register-note]")).toBeNull();
    cleanup();
    const signing = form("signing").container;
    expect(finger(signing)).toBeNull();
    const cancel = [...signing.querySelectorAll("button")].find(
      (b) => b.textContent === "취소",
    );
    expect(cancel?.className).toContain("pointer-events-none");
  });
});

describe("서명 칸의 지문 자리(11-70)", () => {
  const seal = (c: HTMLElement) =>
    c.querySelector<HTMLElement>("[data-register-seal]");

  it("서명 전에는 서명 칸에 빛나는 지문 자리가 있고, 아래 단추와 이름이 겹치지 않는다", () => {
    const { container } = form("sign");
    const s = seal(container) as HTMLElement;
    expect(s.tagName).toBe("BUTTON");
    expect(s.dataset.registerSeal).toBe("waiting");
    expect(s.getAttribute("aria-label")).toBe("서명 칸에 지문으로 서명");
    expect(s.getAttribute("aria-label")).not.toBe(
      finger(container)?.getAttribute("aria-label"),
    );
    expect(s.closest("td")?.textContent).toContain("(인)");
    expect(s.querySelector(".sd-seal-glow")).not.toBeNull();
    // 아래 지문 단추와 같은 때 나타난다(신청서가 다 올라온 뒤)
    expect(s.style.getPropertyValue("--finger-delay")).toBe(`${FX.sheetIn}ms`);
  });

  it("지문 자리를 누르면 그 처리기 안에서 바로 onSign(기다림 없이), 제출은 아니다", () => {
    const { container, props } = form("sign");
    fireEvent.click(seal(container) as HTMLElement);
    expect(props.onSign).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("패스키를 만드는 동안은 빛남을 걷고 누를 수 없다", () => {
    const { container } = form("signing");
    const s = seal(container) as HTMLElement;
    expect(s.dataset.registerSeal).toBe("signing");
    expect(s.tagName).not.toBe("BUTTON");
    expect(s.querySelector(".sd-seal-glow")).toBeNull();
  });

  it("서명하면 지문 자리는 사라지고 그 자리에 지문 도장이 남는다", () => {
    for (const stage of ["stamp", "submit"] as const) {
      const { container } = form(stage, { pub: PUB });
      expect(seal(container)).toBeNull();
      expect(
        container.querySelector("[data-register-signed] [data-fingermark]"),
      ).not.toBeNull();
      cleanup();
    }
  });

  it("가만히 있으면 손짓은 아래 지문 단추 위에 하나만 나오고, 그동안 지문 자리 빛남도 멈춘다", () => {
    vi.useFakeTimers();
    try {
      const { container } = form("sign");
      const glow = seal(container)?.querySelector<HTMLElement>(".sd-seal-glow");
      expect(glow?.style.animationPlayState).toBe("running");
      act(() => {
        vi.advanceTimersByTime(FX.idleHint);
      });
      expect(glow?.style.animationPlayState).toBe("paused");
      expect(seal(container)?.querySelector("[data-idle-hint]")).toBeNull();
      expect(container.querySelectorAll("[data-idle-hint]").length).toBe(1);
      expect(
        finger(container)?.querySelector("[data-idle-hint]"),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("서명 뒤: 도장 → 성명 → 주소", () => {
  it("서명 칸에 이 열쇠의 지문 도장이 찍히고, 성명·주소가 그 뒤 차례로 한 칸씩", () => {
    const { container } = form("stamp", { pub: PUB });
    const a = astronautOf(PUB);
    const plan = fillPlan(a);
    const stamp = container.querySelector("[data-register-signed]");
    expect(stamp?.querySelector("[aria-label='지문 서명']")).not.toBeNull();
    expect(stamp?.querySelector(".sd-fingerstamp")).not.toBeNull();
    const at = (field: string) =>
      [
        ...container.querySelectorAll<HTMLElement>(
          `[data-register-field='${field}'] .sd-type`,
        ),
      ].map((s) => Number.parseInt(s.style.getPropertyValue("--type-at"), 10));
    const name = at("name");
    const address = at("address");
    expect(
      container.querySelector("[data-register-field='name']")?.textContent,
    ).toBe(a.name);
    expect(
      container.querySelector("[data-register-field='address']")?.textContent,
    ).toBe(addressLine(a));
    // 도장이 다 찍힌 뒤 성명, 성명이 다 쳐진 뒤 주소(동시에 움직이지 않는다)
    expect(name[0]).toBe(FX.stampDrop + FX.pause);
    expect(name).toEqual(name.map((_, i) => plan.nameAt + i * FX.typeKey));
    expect(address[0]).toBeGreaterThan(name[name.length - 1] as number);
    expect(address[0]).toBe(plan.addressAt);
    expect(plan.end).toBeGreaterThan(address[address.length - 1] as number);
    // 채우는 동안에도 아직 내지 않는다. 안심 줄은 걷혔다
    expect(sheet(container).getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector("[data-register-note]")).toBeNull();
    expect(finger(container)).toBeNull();
  });

  it("제출 단계: 문구가 바뀌고 밀어 올리거나 누르면 onSubmit", () => {
    const { container, props } = form("submit", { pub: PUB });
    expect(status(container)).toBe("신청서를 밀어 올려서 제출해 주세요.");
    const s = sheet(container);
    expect(s.getAttribute("aria-disabled")).toBe("false");
    fireEvent.keyDown(s, { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSign).not.toHaveBeenCalled();
  });
});

/** 등록 흐름 전체(useAstronautSetup + WelcomeFlyer). 시간은 ManualClock으로만 흐른다 */
function setupFlow(createPasskey: () => Promise<KeyInfo>) {
  const clock = new ManualClock();
  const services = {
    ns: DEMO_NS,
    clock,
    wallet: { createPasskey },
  } as unknown as Services;
  let setup!: ReturnType<typeof useAstronautSetup>;
  function Host() {
    setup = useAstronautSetup(services, () => {});
    return <WelcomeFlyer services={services} setup={setup} />;
  }
  const view = render(<Host />);
  return { view, clock, get: () => setup };
}

const key: KeyInfo = {
  kind: "passkey",
  pub: PUB,
  credentialId: new Uint8Array([1, 2, 3]),
} as KeyInfo;

describe("등록 흐름", () => {
  it("지문 단추가 패스키를 한 번 만들고, 도장·성명·주소 뒤 제출해도 패스키를 다시 열지 않는다", async () => {
    coarse = true;
    const create = vi.fn(async () => key);
    const { view, clock, get } = setupFlow(create);
    await act(async () => {
      void get().create();
    });
    expect(get().apply).toBe("text");
    await act(async () => clock.advance(FX.read));
    expect(get().apply).toBe("sign");
    expect(status(view.container)).toBe("지문을 눌러 신청서에 서명해 주세요.");
    // 서명 전에 밀어 올려도 아무 일 없다
    fireEvent.keyDown(sheet(view.container), { key: "Enter" });
    expect(create).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(finger(view.container) as HTMLButtonElement);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(get().apply).toBe("stamp");
    expect(
      view.container.querySelector("[data-register-signed] [data-fingermark]"),
    ).not.toBeNull();
    const end = fillPlan(astronautOf(PUB)).end;
    await act(async () => clock.advance(end - 1));
    expect(get().apply).toBe("stamp");
    await act(async () => clock.advance(1));
    expect(get().apply).toBe("submit");
    await act(async () => {
      fireEvent.keyDown(sheet(view.container), { key: "Enter" });
    });
    expect(get().apply).toBe("away");
    await act(async () => clock.advance(FX.paperAway + FX.pause));
    expect(get().apply).toBeNull();
    expect(get().issued?.pub).toBe(PUB);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("패스키를 취소하면 서명 전으로 돌아가 다시 지문 단추", async () => {
    const create = vi
      .fn<() => Promise<KeyInfo>>()
      .mockRejectedValueOnce(new DOMException("취소", "NotAllowedError"))
      .mockResolvedValueOnce(key);
    const { view, clock, get } = setupFlow(create);
    await act(async () => {
      void get().create();
    });
    await act(async () => clock.advance(FX.read));
    expect(status(view.container)).toBe(
      "「본인 확인」을 눌러 신청서에 서명해 주세요.",
    );
    await act(async () => {
      fireEvent.click(finger(view.container) as HTMLButtonElement);
    });
    expect(get().apply).toBe("sign");
    expect(get().error).toBeNull();
    expect(view.container.querySelector("[data-register-signed]")).toBeNull();
    await act(async () => {
      fireEvent.click(finger(view.container) as HTMLButtonElement);
    });
    expect(get().apply).toBe("stamp");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
