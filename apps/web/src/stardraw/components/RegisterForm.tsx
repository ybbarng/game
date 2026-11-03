"use client";

import { type ReactNode, useMemo } from "react";
import { cn } from "@/lib/cn";
import { FingerMark } from "../astronaut/FingerMark";
import { type Astronaut, astronautOf } from "../astronaut/identity";
import { FX } from "../fx-timing";
import { Sheet } from "./EnterSubmit";
import { FingerButton, FingerprintIcon } from "./IdFlyer";
import { useIdleHint } from "./IdleHint";
import { StageOverlay } from "./StageOverlay";

/**
 * 신청서 단계(docs/36 11-65): 문구만 / 아래에서 올라와 지문 서명을 기다림 / 패스키 만드는 중 / 도장이 찍히고 성명·주소가
 * 채워짐 / 밀어 올려 제출하기를 기다림 / 위로 제출
 */
export type ApplyStage =
  | "text"
  | "sign"
  | "signing"
  | "stamp"
  | "submit"
  | "away";

/** 서명을 마친 단계(도장이 찍혀 있다) */
export const signedStage = (s: ApplyStage) =>
  s === "stamp" || s === "submit" || s === "away";

/**
 * 위쪽 문구. 서명 전에는 지문 단추를 가리킨다(신분증 제시의 idText와 같은 결, 11-63): 터치 화면은 지문 그림,
 * PC(마우스)는 단추 글자 「본인 확인」. 서명 뒤에는 밀어 올려 낸다
 */
export const applyText = (stage: ApplyStage, touch: boolean) =>
  stage === "submit" || stage === "away"
    ? "신청서를 밀어 올려서 제출해 주세요."
    : touch
      ? "지문을 눌러 신청서에 서명해 주세요."
      : "「본인 확인」을 눌러 신청서에 서명해 주세요.";

/**
 * 서명 전 안심 한 줄(2026-11-03 사용자: 갑자기 뜨는 얼굴·지문 창에 놀랐다). 군더더기 문구 금지의 예외로, 지문·얼굴
 * 창이 무엇을 가져가는지에 대한 걱정만 덜어 준다
 */
export const APPLY_NOTE =
  "지문·얼굴 정보는 이 기기 밖으로 나가지 않습니다. 이름·이메일·비밀번호는 받지 않습니다.";

/** 작성일 "2026. 11. 3. 14:05"(한국 시각) */
export function writtenAt(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${hh}:${mm}`;
}

/** 신청서 주소 칸: 등록증 앞면과 같은 짧은 경로(다른 은하면 앞을 줄인다) */
export const addressLine = (a: Astronaut) =>
  `${a.otherGalaxy ? "… › " : ""}${a.short.join(" › ")}`;

/**
 * 서명 뒤 채우기 시간표(ms, 도장이 찍히기 시작한 때부터): 도장 → 쉼 → 성명 한 칸씩 → 쉼 → 주소 한 칸씩 → 쉼.
 * 한 번에 하나만 움직인다. 부르는 쪽(useAstronautSetup)은 `end`만큼 기다린 뒤 제출 단계로 넘긴다
 */
export function fillPlan(a: Astronaut) {
  const name = [...a.name].length;
  const address = [...addressLine(a)].length;
  const nameAt = FX.stampDrop + FX.pause;
  const addressAt = nameAt + name * FX.typeKey + FX.pause;
  const end = addressAt + address * FX.typeKey + FX.pause;
  return { nameAt, addressAt, end };
}

/**
 * 우주인 등록 신청서(관공서 서식, 2026-10-31 사용자 → 2026-11-03 지문 서명, docs/36 11-65). 오버레이 위쪽에 우주국 말,
 * 아래에서 신청서가 올라와 내 앞에 놓인다. 신청서 아래(엄지 자리, 「취소」 바로 위) 지문 단추를 누르면 그 처리기 안에서
 * 바로 `onSign`(패스키 만들기). 서명 칸에는 같은 박자로 빛나는 지문 자리가 있어 거기를 눌러도 같다(11-71). 서명 전에는 신청서를 밀어 올려도 내지 않는다. 패스키가 만들어지면 서명 칸에 지문 도장이
 * 찍히고 성명·주소가 차례로 채워진 뒤, 밀어 올리거나 누르면(Enter·Space·↑도) `onSubmit`. 작은 「취소」로 닫는다
 */
export function RegisterForm({
  stage,
  now,
  touch,
  pub,
  onSign,
  onSubmit,
  onCancel,
  help,
}: {
  /** 우주국 말 아래 안내(앱 안 브라우저에서 패스키가 실패했을 때 바깥 브라우저로 여는 안내) */
  help?: ReactNode;
  stage: ApplyStage;
  now: number;
  /** 터치 화면인지(위쪽 문구). 부르는 쪽이 신청서를 열 때 한 번 정한다(첫 렌더와 어긋나지 않고 도중에 바뀌지 않게) */
  touch: boolean;
  /** 서명한 패스키의 공개 열쇠(서명 뒤에만) */
  pub: Uint8Array | null;
  onSign: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const signed = signedStage(stage) && pub !== null;
  const a = useMemo(
    () => (signed && pub ? astronautOf(pub) : null),
    [signed, pub],
  );
  const plan = a ? fillPlan(a) : null;
  const text = applyText(stage, touch);
  return (
    // 낮은 화면(높이 700px 이하)은 칸·사이를 조금 좁혀 360×640에서도 지문 단추·「취소」까지 한 화면에 담는다.
    // 앱 안 안내까지 붙으면 그래도 길어진다: 오버레이 안에서 스크롤
    <StageOverlay label="우주인 등록 신청" scroll>
      <section
        className="flex min-h-full flex-1 flex-col"
        aria-label="우주인 등록 신청서"
        data-register-stage={stage}
      >
        <p
          key={text}
          role="status"
          className="sd-text-in sd-submit-status min-h-8 break-keep px-2 text-center font-bold text-amber-100 text-lg"
        >
          {text}
        </p>
        {/* 앱 안 안내가 뜨면 안심 줄은 걷는다(할 일은 안내가 말한다). 서명한 뒤에도 걷는다 */}
        {!signed && !help && (
          <p
            data-register-note
            className="sd-text-in mx-auto mt-2 max-w-sm break-keep px-4 text-center text-sm text-white/70 leading-relaxed [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:leading-snug"
          >
            {APPLY_NOTE}
          </p>
        )}
        {help && (
          <div data-register-help className="mx-auto mt-2 w-full max-w-md">
            {help}
          </div>
        )}
        <div className="min-h-4 flex-1 [@media(max-height:700px)]:min-h-1" />
        <Sheet
          sheet={stage === "text" ? "below" : stage === "away" ? "away" : "in"}
          awaiting={stage === "submit"}
          onSwiped={onSubmit}
          label="신청서 제출"
        >
          <article
            data-register-form
            className="mx-auto w-full max-w-md rounded-sm bg-[#f3eedf] px-5 pt-3 pb-4 text-slate-800 [@media(max-height:700px)]:pt-2 [@media(max-height:700px)]:pb-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
          >
            <p className="text-[10px] text-slate-500">별지 제1호 서식</p>
            <h2 className="mt-1 text-center font-black text-lg tracking-[0.2em]">
              우주인 등록 신청서
            </h2>
            <table className="mt-3 [@media(max-height:700px)]:mt-2 w-full border-collapse text-[13px]">
              <tbody>
                <Row head="신청 구분">신규 등록</Row>
                <Row head="작성일">
                  <span className="tabular-nums">{writtenAt(now)}</span>
                </Row>
                <Row head="성명" data="name">
                  {a && plan && <Typed text={a.name} at={plan.nameAt} />}
                </Row>
                <Row head="주소" data="address">
                  {a && plan && (
                    <Typed text={addressLine(a)} at={plan.addressAt} />
                  )}
                </Row>
                <Row head="신분 확인">이 기기의 지문·얼굴</Row>
                <tr>
                  <th className="w-24 border border-slate-400/70 bg-slate-800/5 px-2 py-2 text-left font-semibold">
                    서명
                  </th>
                  <td className="relative h-16 [@media(max-height:700px)]:h-12 border border-slate-400/70 px-2">
                    {/* 도장 자리: 서식에 찍힌 「(인)」 */}
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 text-xs"
                    >
                      (인)
                    </span>
                    {(stage === "sign" || stage === "signing") && (
                      <SealSpot waiting={stage === "sign"} onPress={onSign} />
                    )}
                    {signed && pub && (
                      <span
                        data-register-signed
                        className="absolute top-1/2 right-2 grid h-14 w-12 -translate-y-1/2 place-items-center"
                        style={
                          {
                            "--stamp-ms": `${FX.stampDrop}ms`,
                          } as React.CSSProperties
                        }
                      >
                        <span
                          aria-hidden="true"
                          className="sd-ink-spread absolute inset-0 rounded-[45%] bg-[radial-gradient(closest-side,rgba(190,18,60,0.55),rgba(190,18,60,0))]"
                        />
                        <FingerMark
                          pub={pub}
                          className="sd-fingerstamp relative h-12"
                          label="지문 서명"
                        />
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 [@media(max-height:700px)]:mt-2 text-center text-[13px]">
              위와 같이 우주인 등록을 신청합니다.
            </p>
            <p className="mt-2 text-right font-semibold text-[13px]">
              카노푸스 우주국장 귀하
            </p>
          </article>
        </Sheet>
        {/* 지문 단추 자리(신분증 제시와 같은 모양·자리: 엄지가 닿는 화면 아래쪽, 「취소」 바로 위). 늘 자리를 차지해
            단추가 생기고 사라져도 신청서가 움직이지 않는다 */}
        <div className="relative mt-4 [@media(max-height:700px)]:mt-1 h-[5.75rem] w-full shrink-0">
          {stage === "sign" && (
            <FingerButton
              label="신청서 서명"
              onPress={onSign}
              delay={FX.sheetIn}
            />
          )}
        </div>
        {/* 흐름 안 맨 아래(오버레이 아래 여백 위, 신분증 제시의 「취소」와 같은 높이). 앱 안 안내가 붙어 화면보다 길어지면
            지문 단추와 겹치지 않고 함께 스크롤된다 */}
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "mt-2 self-center rounded-xl px-4 py-2 text-sm text-white/60 transition-opacity hover:text-white",
            stage === "sign" ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          취소
        </button>
      </section>
    </StageOverlay>
  );
}

/**
 * 서명 칸의 지문 자리(2026-11-03 사용자, docs/36 11-71): 「(인)」 위에 아래 지문 단추와 같은 지문 그림을 인주색으로 두고,
 * 아래 단추와 같은 박자로 은은하게 숨 쉬듯 빛나 「여기에 찍힌다」로 읽히게 한다. 아래 단추와 함께 나타나고(신청서가 다
 * 올라온 뒤) 함께 생겨 박자가 맞는다. 가만히 있어 아래 단추 위에 손짓이 도는 동안은 같이 멈춘다(손짓은 아래 단추 하나).
 * 이 자리를 눌러도 같은 서명이다(그 처리기 안에서 바로 `onPress`, 누름 직후에만 패스키 창을 여는 브라우저가 있다).
 * 패스키를 만드는 동안(`waiting` 거짓)은 빛남을 걷고 옅게 멈춰 있다가, 서명되면 이 자리에 지문 도장이 찍힌다(빛남과
 * 도장이 함께 움직이지 않게). 자리·크기는 도장(`data-register-signed`)과 같아 그 자리에서 바뀌어 보인다
 */
function SealSpot({
  waiting,
  onPress,
}: {
  waiting: boolean;
  onPress: () => void;
}) {
  const hint = useIdleHint(waiting);
  // 종이색 바탕이 「(인)」을 덮는다(지문 그림 선과 글자가 겹쳐 지저분했다). 빛남은 그 위 그림만 숨 쉬어 바탕은 그대로다
  const mark = (
    <span className="rounded-full bg-[#f3eedf]">
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full border border-rose-700/35 border-dashed text-rose-700 [@media(max-height:700px)]:size-10",
          waiting ? "sd-seal-glow" : "opacity-35",
        )}
        style={
          waiting
            ? { animationPlayState: hint ? "paused" : "running" }
            : undefined
        }
      >
        <FingerprintIcon className="size-8 [@media(max-height:700px)]:size-7" />
      </span>
    </span>
  );
  const place =
    "absolute inset-y-0 right-2 flex w-12 items-center justify-center";
  if (!waiting)
    return (
      <span data-register-seal="signing" aria-hidden="true" className={place}>
        {mark}
      </span>
    );
  return (
    <button
      type="button"
      data-register-seal="waiting"
      aria-label="서명 칸에 지문으로 서명"
      onClick={onPress}
      className={cn(
        place,
        "sd-finger-in rounded-full outline-none focus-visible:ring-2 focus-visible:ring-rose-700/60",
      )}
      style={{ ["--finger-delay" as string]: `${FX.sheetIn}ms` }}
    >
      {mark}
    </button>
  );
}

/** 타자기처럼 한 칸씩 나타나는 글(`at`ms부터 FX.typeKey 간격). 화면 읽기 프로그램에는 처음부터 온 글로 읽힌다 */
function Typed({ text, at }: { text: string; at: number }) {
  return (
    <span data-typed={text}>
      {[...text].map((ch, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 글자 차례가 곧 자리다(같은 글자가 되풀이될 수 있다)
          key={i}
          className="sd-type"
          style={
            {
              "--type-at": `${at + i * FX.typeKey}ms`,
            } as React.CSSProperties
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

function Row({
  head,
  data,
  children,
}: {
  head: string;
  /** 서명 뒤 채워지는 칸 표시(`data-register-field`) */
  data?: string;
  children?: React.ReactNode;
}) {
  return (
    <tr>
      <th className="w-24 border border-slate-400/70 bg-slate-800/5 px-2 py-1.5 text-left font-semibold">
        {head}
      </th>
      <td
        data-register-field={data}
        className="h-8 break-keep border border-slate-400/70 px-2 py-1.5 [@media(max-height:700px)]:h-6 [@media(max-height:700px)]:py-0.5"
      >
        {children}
      </td>
    </tr>
  );
}
