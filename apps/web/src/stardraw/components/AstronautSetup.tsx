"use client";

import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { errorText } from "../errors";
import { FX } from "../fx-timing";
import { greetNow } from "../greeting";
import { originGreeting } from "../origin-greeting";
import {
  inAppFailed,
  type PasskeyProblem,
  passkeyApi,
  passkeyBlocked,
  passkeyProblem,
} from "../passkey-env";
import { ensureRegistered } from "../registrar";
import { DEMO_NS, type Services } from "../services";
import type { KeyInfo } from "../wallet";
import { AstronautPanel } from "./AstronautPanel";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { InAppTriedNotice } from "./InAppNotice";
import { type ApplyStage, RegisterForm } from "./RegisterForm";
import { StageOverlay } from "./StageOverlay";

/**
 * 실패 문구. `inApp`은 앱 안 브라우저에서 패스키 시도가 실패했을 때의 앱 이름: 문구 대신 바깥 브라우저 안내를 보인다
 */
export type Failure = { kind: PasskeyProblem; text: string; inApp?: string };

/** 패스키 오류를 화면 문구로 */
/**
 * 실패를 화면 문구로(오류 → 창구 말은 errors.ts 한 곳). `doing`은 "○○하지 못했습니다"의 ○○,
 * `cancelWhat`은 패스키를 취소했을 때의 앞 문장
 */
export function failureOf(
  err: unknown,
  doing: string,
  cancelWhat: string,
): Failure {
  const kind = passkeyProblem(err);
  const inApp =
    typeof navigator === "undefined"
      ? null
      : inAppFailed(err, navigator.userAgent);
  return {
    kind,
    ...(inApp ? { inApp } : {}),
    text:
      kind === "unsupported"
        ? "이 기기에서는 등록증을 만들 수 없어요. '다른 기기 사용'을 골라 휴대폰으로 만들어 주세요."
        : errorText(err, doing, cancelWhat),
  };
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 우주인 등록(패스키 만들기)과 신분증 제시(이미 있는 패스키 찾기). 첫 화면 입구와 응모 화면이 같이 쓴다.
 * 등록은 신청서 내기(RegisterForm, `SetupOverlays`): 오버레이·우주국 말 → 아래에서 신청서가 올라옴 → 밀어 올리거나
 * 누르면 그 누름에 바로 패스키 만들기 → 서명란에 서명 → 신청서가 위로 → 발급한 등록증이 위에서 내려온다(`IssuedView`),
 * 계속하면 등록증만 아래로 내려가 사라진 뒤 `onReady`.
 * 제시는 신분증 제시 틀(useIdPresent): 오버레이·"패스키로 신분증을 제시해 주세요." → 실루엣 카드가 올라와 기다림 →
 * 내밀면 그 누름에 바로 패스키 → 실제 등록증으로 바뀌며 확인 표시 → 인사 → 내려감(2026-10-31 사용자: 우주국 말 먼저).
 * 취소하면 신청서·카드는 그 자리에서 다시 기다리고, 작은 「취소」로 닫는다. 움직임 줄이기면 단추에서 바로 패스키
 */
export function useAstronautSetup(
  services: Services,
  onReady: (key: KeyInfo, how: "created" | "found") => void,
) {
  const [working, setWorking] = useState<null | "create" | "recover">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  /** 패스키를 못 쓰는 브라우저인데 화면에 입구 안내가 없다(관측지): 누른 단추 곁에 안내(`PasskeyBlockedNotice`)를 그린다 */
  const [blockedHere, setBlockedHere] = useState(false);
  /** 방금 발급한 등록증 */
  const [issued, setIssued] = useState<KeyInfo | null>(null);
  /** 발급한 등록증을 주머니에 넣는 중(아래로 내려가며 사라진다) */
  const [pocketing, setPocketing] = useState(false);
  /** 신분증 제시(입장) 연출 */
  const id = useIdPresent(services);
  /** 우주인 등록 신청서 단계(없으면 null) */
  const [apply, setApply] = useState<ApplyStage | null>(null);
  /** 앱 안 브라우저에서 신청서를 냈는데 패스키가 실패했으면 그 앱 이름(신청서 위에 바깥 브라우저 안내) */
  const [applyInApp, setApplyInApp] = useState<string | null>(null);
  const wait = (ms: number) =>
    new Promise<void>((r) => services.clock.after(ms, r));

  /** 패스키 만들기와 등록 증명 서명(만들자마자 장부에 등록, 작업 증명·올리기는 뒤에서) */
  /**
   * 패스키 만들기 창 하나만 연다(2026-10-31 사용자). 예전에는 곧바로 등록 증명 서명 창이 한 번 더 떴는데, 새 누름
   * 없이 열리는 두 번째 창은 누름 직후에만 패스키 창을 여는 브라우저에서 막히고 사람도 헷갈렸다. 장부 등록은
   * 첫 응모 때 응모권과 함께 낸다(그 응모의 신분증 제출 누름 안에서)
   */
  const makeKey = () => services.wallet.createPasskey();

  /** 입구 안내(KeySetup)가 이 화면에 있으면 그리로 옮긴다(안내·오류가 그 칸에 뜬다). 없으면 false */
  const toKeySetup = (): boolean => {
    const notice = document.querySelector("[data-key-setup]");
    notice?.scrollIntoView({
      block: "center",
      behavior: reduced() ? "auto" : "smooth",
    });
    return notice !== null;
  };

  /**
   * WebAuthn이 아예 없는 브라우저면 신청서·신분증 제시를 띄우지 않는다. 화면에 입구 안내(KeySetup)가
   * 있으면 그리로 옮기고(같은 말이 두 번 나오지 않게), 없으면(관측지) `blockedHere`로 그 화면이 누른 단추 곁에
   * 같은 안내(바깥 브라우저로 열기·주소 복사)를 그리게 한다(2026-11-03 운영 둘러보기: 빨간 글 한 줄만 떨어져 떴다).
   * 앱 안 브라우저라도 WebAuthn이 있으면 막지 않고 시도한다(2026-11-03 사용자). 실패하면 그 자리에 안내(`Failure.inApp`)
   */
  const blocked = (): boolean => {
    if (services.ns === DEMO_NS) return false;
    const why = passkeyBlocked(navigator.userAgent, passkeyApi());
    setBlockedHere(false);
    if (!why) return false;
    if (!toKeySetup()) setBlockedHere(true);
    return true;
  };

  /** 신청서·신분증 제시 밖에서 난 실패: 앱 안 브라우저면 안내가 뜨는 입구 칸으로 옮긴다 */
  const failed = (f: Failure) => {
    setError(f);
    if (f.inApp) toKeySetup();
  };

  /** 우주인 등록: 연출이 있으면 신청서부터(패스키는 신청서를 낼 때), 움직임 줄이기면 바로 패스키 만들기 */
  const create = async () => {
    setNote(null);
    setError(null);
    setApplyInApp(null);
    if (blocked()) return;
    if (!reduced()) {
      setApply("text");
      await wait(FX.read);
      setApply("waiting");
      return;
    }
    setWorking("create");
    try {
      setIssued(await makeKey());
    } catch (err) {
      failed(failureOf(err, "등록", "등록하지 않았어요"));
    } finally {
      setWorking(null);
    }
  };

  /**
   * 신청서를 냈다(밀어 올리거나 누름): 그 누름 안에서 바로 패스키 만들기. 성공하면 서명이 찍히고 신청서가 위로 올라간 뒤
   * 발급한 등록증이 내려온다. 취소하면 신청서가 그 자리에서 다시 기다린다
   */
  const submitApply = async () => {
    setApply("signing");
    setWorking("create");
    try {
      const made = await makeKey();
      setApply("signed");
      navigator.vibrate?.(20);
      await wait(FX.idCheck + FX.pause);
      setApply("away");
      await wait(FX.paperAway + FX.pause);
      setApply(null);
      setIssued(made);
    } catch (err) {
      // 앱 안 브라우저에서 실패하면(취소처럼 보여도) 신청서는 다시 기다리고 바깥 브라우저 안내를 함께 보인다
      const app = inAppFailed(err, navigator.userAgent);
      if (app) setApplyInApp(app);
      if (app || passkeyProblem(err) === "cancelled") setApply("waiting");
      else {
        setApply(null);
        setError(failureOf(err, "등록", "등록하지 않았어요"));
      }
    } finally {
      setWorking(null);
    }
  };

  /** 신분증 제시: 다른 기기에서 만든(따라온) 패스키를 찾아 장부의 등록을 확인한다 */
  const recover = async () => {
    setNote(null);
    setError(null);
    if (blocked()) return;
    setWorking("recover");
    try {
      const found = await id.run(
        async () => {
          const k = await services.wallet.recoverPasskey((cid) =>
            services.ledger.passkeyPub(cid),
          );
          // 없으면 기다리지 않고 닫고 알린다
          if (!k) throw new Error("장부에 없는 등록증이에요.");
          return k;
        },
        {
          verb: "제시",
          pub: (k) => k.pub,
          // 오버레이·우주국 말 먼저, 실루엣 카드를 내밀면 그 누름에 바로 패스키(2026-10-31 사용자)
          blank: true,
          tap: true,
          readFirst: true,
          done: (k) => {
            const special =
              Math.random() < 1 / 3
                ? originGreeting(astronautOf(k.pub), Math.random)
                : null;
            return `${residentPhrase(astronautOf(k.pub))} 님, ${special ?? greetNow(services.clock.now(), "enter")}`;
          },
          onConfirmed: (k) => {
            setWorking(null);
            void ensureRegistered(services, k).catch(() => {});
            onReady(k, "found");
          },
        },
      );
      if (!found) setWorking(null);
    } catch (err) {
      setWorking(null);
      failed(failureOf(err, "신분증을 확인", "등록증을 찾지 못했어요"));
    }
  };

  /** 발급한 등록증을 넣고 계속(아래로 내려가며 사라진 뒤) */
  const pocket = () => {
    const key = issued;
    if (!key) return;
    const done = () => {
      setIssued(null);
      setPocketing(false);
      onReady(key, "created");
    };
    if (reduced()) return done();
    setPocketing(true);
    services.clock.after(FX.issuePocket + FX.pause, done);
  };

  return {
    working,
    note,
    error,
    blockedHere,
    issued,
    pocketing,
    id,
    apply,
    applyInApp,
    submitApply,
    cancelApply: () => {
      setApply(null);
      setApplyInApp(null);
    },
    create,
    recover,
    pocket,
  };
}

/**
 * 발급한 등록증. `overlay`면 화면 전체 오버레이에서 등록증만 위(우주국)에서 내려와 가운데 자리 잡고, 등록 문구와
 * 단추는 아래 고정 자리(엄지 닿는 곳)에 둔다. 계속하면 등록증만 아래(내 주머니)로 내려가 사라지고 문구·단추는
 * 그 자리에서 흐려진다(같이 미끄러지지 않는다, 2026-10-31 사용자). 아니면(움직임 줄이기) 그 화면 자리에 그린다.
 * 특별한 출신(지구·안드로메다·다른 은하 등)이면 등록 문구 다음 줄에 창구 직원이 놀라는 말을 덧붙인다(origin-greeting.ts)
 */
export function IssuedView({
  services,
  setup,
  header,
  overlay = false,
  goLabel = "별을 고르러 가 볼까요?",
}: {
  services: Services;
  setup: ReturnType<typeof useAstronautSetup>;
  header?: ReactNode;
  overlay?: boolean;
  /** 계속 단추 문구(회차 방에서는 방으로 돌아간다) */
  goLabel?: string;
}) {
  const key = setup.issued;
  // 출신 인사는 발급할 때 한 번 고른다(다시 그려도 바뀌지 않게)
  const origin = useMemo(
    () => (key ? originGreeting(astronautOf(key.pub), Math.random) : null),
    [key],
  );
  if (!key) return null;
  const greeting = (
    <div className="flex flex-col items-center gap-2">
      <p
        role="status"
        data-issued="new"
        className="flex flex-col items-center gap-1 break-keep text-center text-amber-100"
      >
        <span className="text-sm text-amber-100/75">
          {residentPhrase(astronautOf(key.pub))} 님,
        </span>
        <span className="font-bold text-xl">
          우주인으로 등록되었습니다. 환영합니다!
        </span>
      </p>
      {origin && (
        <p
          data-issued-origin
          className="break-keep text-center text-amber-50/90 text-base"
        >
          {origin}
        </p>
      )}
    </div>
  );
  const go = (
    <button
      type="button"
      disabled={setup.pocketing}
      onClick={setup.pocket}
      className="sd-cta rounded-2xl py-3.5 font-bold text-lg text-slate-950"
    >
      {goLabel}
    </button>
  );
  if (overlay)
    return (
      <StageOverlay label="우주인 등록증 발급" scroll appear={false}>
        <div
          className={cn(
            "sd-after transition-opacity duration-500",
            setup.pocketing && "opacity-0",
          )}
          style={
            {
              "--fx-delay": `${FX.issueDrop + FX.pause}ms`,
            } as React.CSSProperties
          }
        >
          {greeting}
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col justify-center",
            setup.pocketing ? "sd-id-pocket" : "sd-id-drop",
          )}
          style={
            {
              "--fx-ms": `${setup.pocketing ? FX.issuePocket : FX.issueDrop}ms`,
            } as React.CSSProperties
          }
        >
          <AstronautPanel services={services} pub={key.pub} bare />
        </div>
        <div
          className={cn(
            "sd-after sticky bottom-0 flex flex-col gap-4 bg-gradient-to-t from-[#070b16] via-[#070b16]/90 to-transparent pt-6 pb-1 transition-opacity duration-500",
            setup.pocketing && "opacity-0",
          )}
          style={
            {
              "--fx-delay": `${FX.issueDrop + FX.pause}ms`,
            } as React.CSSProperties
          }
        >
          {go}
        </div>
      </StageOverlay>
    );
  return (
    <section className="flex flex-col gap-4" aria-label="우주인 등록증 발급">
      {header}
      <AstronautPanel services={services} pub={key.pub} greeting={greeting}>
        {go}
      </AstronautPanel>
    </section>
  );
}

/** 신분증을 제시해 들어올 때의 연출(움직임 줄이기면 그리지 않는다) */
export function WelcomeFlyer({
  services,
  setup,
}: {
  services: Services;
  setup: ReturnType<typeof useAstronautSetup>;
}) {
  return (
    <>
      <IdPresentView services={services} id={setup.id} />
      {setup.apply && (
        <RegisterForm
          stage={setup.apply}
          now={services.clock.now()}
          help={
            setup.applyInApp && setup.apply === "waiting" ? (
              <InAppTriedNotice app={setup.applyInApp} />
            ) : undefined
          }
          onSubmit={() => void setup.submitApply()}
          onCancel={setup.cancelApply}
        />
      )}
    </>
  );
}
