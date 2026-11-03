"use client";

import { useRef, useState } from "react";
import { FX } from "../fx-timing";
import { buzz } from "../haptics";
import { inAppFailed, passkeyProblem } from "../passkey-env";
import type { Services } from "../services";
import { type CardSpot, IdFlyer } from "./IdFlyer";
import { InAppTriedNotice } from "./InAppNotice";

/** 신분증 제시 화면의 한 순간(useIdPresent가 정한다) */
export interface IdPresent {
  pub: Uint8Array | null;
  card: CardSpot;
  checked: boolean;
  text: string;
  /** 위쪽 문구 아래 작은 글(제시하는 까닭). 결과 문구로 바뀌면 걷힌다 */
  note: string | null;
  closing: boolean;
  /** 사람이 지문 단추(또는 등록증) 누르기를 기다리는 중 */
  asking: boolean;
  /** 카드 단추 이름(화면 읽기 프로그램) */
  label: string;
  /** 아직 누구인지 모를 때 실루엣 카드를 보인다(입장·발급) */
  blank: boolean;
  /** 앱 안 브라우저에서 패스키 시도가 실패했으면 그 앱 이름: 등록증이 다시 기다리는 동안 바깥 브라우저 안내를 함께 보인다 */
  inApp: string | null;
}

/** 신분증 제시 틀의 목적 */
export type IdVerb = "제시" | "제출" | "확인";

/**
 * 신분증 제시 틀의 위쪽 문구. 목적 자리만 다르고, 등록증 아래 지문 단추를 가리킨다(docs/36 11-63).
 * 「패스키로」는 무엇을 하라는 말인지 와닿지 않았고(2026-11-03 지인), 「지문·얼굴 인증으로」도 화면에서 무엇을 누를지는
 * 말하지 않았다. 터치 화면(`touch`)은 지문 그림을, PC(마우스)는 단추 글자 「본인 확인」을 가리킨다. 얼굴 인식 휴대폰도
 * 지문 그림이면 본인 확인이라는 걸 알아볼 수 있고, 맥북 Touch ID는 지문이 맞지만 윈도우는 PIN 창이 뜰 수 있어서다
 */
export const idText = (verb: IdVerb, touch: boolean) =>
  touch
    ? `지문을 눌러 신분증을 ${verb}해 주세요.`
    : `「본인 확인」을 눌러 신분증을 ${verb}해 주세요.`;

/**
 * 터치 화면인지(주된 입력이 손가락). 문구는 사람이 단추를 누른 뒤 `run` 안에서 한 번 정해 상태에 담으므로 서버 렌더·첫
 * 렌더와 어긋나지 않고, 기다리는 동안 바뀌지 않는다
 */
export const touchScreen = () =>
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/**
 * 신분증 제시 틀: 패스키 서명을 요구하는 곳이 같은 차례·같은 문구 틀·같은 시간으로 쓴다(2026-10-31 사용자:
 * 같은 행동은 어디서나 같게). 위쪽 문구(idText) → (지문 단추 누름) → 패스키 → 등록증이 가운데에 자리 잡음 → 확인 표시 →
 * 결과 문구 → 내려감 → 걷힘(Apple Pay의 카드 제시 리듬). 목적(제시·제출)과 결과 문구만 다르다.
 * 취소·실패면 등록증은 올라오지 않고 걷힌다. 움직임 줄이기면 연출 없이 패스키만. 반환 값은 `action`의 결과(없으면 null)
 */
export function useIdPresent(services: Services) {
  const [present, setPresent] = useState<IdPresent | null>(null);
  /** 「신분증 제시/제출」(true)·「취소」(false)를 기다리는 곳 */
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const wait = (ms: number) =>
    new Promise<void>((r) => services.clock.after(ms, r));
  const run = async <T,>(
    action: () => Promise<T | null>,
    opts: {
      /** 문구의 목적 자리 */
      verb: IdVerb;
      /** 위쪽 문구를 따로 정할 때(발급: "패스키로 우주인 등록증을 발급합니다.") */
      text?: string;
      /** 위쪽 문구 아래 작은 글: 무엇을 위해 제시하는지와 무엇이 보이는지 */
      note?: string;
      /** 카드 단추 이름을 따로 정할 때(발급: "등록증 발급") */
      label?: string;
      /** 누구인지 모를 때 실루엣 카드로 기다린다 */
      blank?: boolean;
      /**
       * 확인 뒤 등록증 올라옴·확인 표시·인사를 보인다(기본). false면 패스키가 끝나는 대로 걷지 않고 바로 넘긴다
       * (발급: 다음 연출인 등록증 발급 화면이 이어서 뜬다)
       */
      reveal?: boolean;
      /** 등록증에 그릴 공개 열쇠(미리 알면), 아니면 결과에서 */
      pub?: Uint8Array | ((r: T) => Uint8Array);
      /** 확인 뒤 바뀌는 결과 문구(없으면 그대로) */
      done?: string | ((r: T) => string);
      /** 확인 뒤 머무는 시간 */
      hold?: number;
      /**
       * 문구를 읽을 틈을 두고 패스키를 연다. 단추를 누른 그 순간 패스키를 열어야 하는 곳(브라우저가 누름 없이 연 창을
       * 막을 수 있다)은 false: 문구와 패스키 창이 함께 뜬다
       */
      readFirst?: boolean;
      /** 패스키가 끝난 순간(연출이 이어지는 동안 뒤 화면을 바꾸거나 제출을 시작할 때) */
      onConfirmed?: (r: T) => void;
      /** 끝에서 걷지 않고 남긴다(바로 다음 연출이 이어질 때) */
      keep?: boolean;
      /**
       * 패스키 전에 사람이 지문 단추를 누르게 한다(등록증이 아래에서 가운데로 올라와 기다리고, 아래 지문 단추를 누르거나
       * 등록증을 밀어 올리거나 누르면 그 동작 직후 패스키). 앞서 누른 단추에서 시간이 흘러(연출 등) 패스키 창이 막힐 수 있는 곳에 쓴다. 단추를 누르자마자 이 틀을
       * 부르는 곳은 그 누름이 곧 제시라 두지 않는다(같은 동작을 두 번 시키지 않는다). 취소하면 등록증은 그 자리에서 다시 기다린다
       */
      tap?: boolean;
    },
  ): Promise<T | null> => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = await action();
      if (r !== null) opts.onConfirmed?.(r);
      return r;
    }
    let p: IdPresent = {
      pub: opts.pub instanceof Uint8Array ? opts.pub : null,
      card: "hidden",
      checked: false,
      text: opts.text ?? idText(opts.verb, touchScreen()),
      note: opts.note ?? null,
      closing: false,
      asking: false,
      label: opts.label ?? `신분증 ${opts.verb}`,
      blank: opts.blank ?? false,
      inApp: null,
    };
    const go = (patch: Partial<IdPresent>) => {
      p = { ...p, ...patch };
      setPresent(p);
    };
    go({});
    if (opts.readFirst) await wait(FX.read);
    let r: T | null = null;
    if (opts.tap) {
      // 등록증이 아래에서 가운데로 올라와 지문 단추 누르기를 기다린다. 누르면(누름 처리 안에서 이어져) 바로 패스키
      go({ card: "ready" });
      for (;;) {
        go({ asking: true });
        const ok = await new Promise<boolean>((res) => {
          answer.current = res;
        });
        answer.current = null;
        if (!ok) {
          setPresent(null);
          return null;
        }
        // 내민 등록증이 살짝 떠오르는 동안 패스키를 연다(움직임은 보이기만, 패스키를 늦추지 않는다)
        go({ asking: false, card: "lift" });
        try {
          r = await action();
        } catch (err) {
          // 앱 안 브라우저에서 실패하면(취소처럼 보여도) 등록증은 다시 기다리고 바깥 브라우저 안내를 함께 보인다.
          // 다시 내미는 것도 막지 않는다(2026-11-03 사용자: 막기보다 시도할 수 있게)
          const app = inAppFailed(err, navigator.userAgent);
          if (app || passkeyProblem(err) === "cancelled") {
            go({ card: "ready", ...(app ? { inApp: app } : {}) });
            continue;
          }
          setPresent(null);
          throw err;
        }
        if (r !== null) break;
        go({ card: "ready" });
      }
    } else {
      try {
        r = await action();
      } catch (err) {
        setPresent(null);
        throw err;
      }
      if (r === null) {
        setPresent(null);
        return null;
      }
    }
    const got = r;
    opts.onConfirmed?.(got);
    if (opts.reveal === false) {
      setPresent(null);
      return got;
    }
    if (typeof opts.pub === "function") go({ pub: opts.pub(got) });
    await wait(FX.pause);
    go({ card: "up" });
    await wait(FX.idIn + FX.pause);
    go({ checked: true });
    buzz("confirm");
    await wait(FX.idCheck + FX.pause);
    if (opts.done)
      go({
        text: typeof opts.done === "function" ? opts.done(got) : opts.done,
        note: null,
      });
    await wait(opts.hold ?? FX.idHold);
    go({ card: "hidden" });
    await wait(FX.idOut + FX.pause);
    if (opts.keep) {
      setPresent(null);
      return got;
    }
    go({ closing: true });
    await wait(FX.stageOut);
    setPresent(null);
    return got;
  };
  return {
    present,
    run,
    confirm: (ok: boolean) => answer.current?.(ok),
  };
}

/** useIdPresent의 화면(떠 있을 때만) */
export function IdPresentView({
  services,
  id,
  backdrop = true,
}: {
  services: Services;
  id: ReturnType<typeof useIdPresent>;
  backdrop?: boolean;
}) {
  const p = id.present;
  if (!p) return null;
  return (
    <IdFlyer
      services={services}
      pub={p.pub}
      card={p.card}
      checked={p.checked}
      text={p.text}
      note={p.note}
      closing={p.closing}
      backdrop={backdrop}
      blank={p.blank}
      help={
        p.inApp && p.asking ? <InAppTriedNotice app={p.inApp} /> : undefined
      }
      press={
        p.asking
          ? {
              label: p.label,
              onPress: () => id.confirm(true),
              onCancel: () => id.confirm(false),
            }
          : undefined
      }
    />
  );
}
