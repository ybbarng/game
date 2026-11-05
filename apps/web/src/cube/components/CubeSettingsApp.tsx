"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  findHeroMethod,
  HERO_ALTERNATE,
  HERO_SIZES,
  heroMethodsFor,
} from "../hero/methods";
import {
  type ActionGroup,
  actionLabel,
  actionsFor,
  chordLabel,
  exportKeymap,
  findConflicts,
  importKeymap,
  type KeyChord,
  type Keymap,
  loadKeymap,
  PRESET_LABEL,
  presetKeymap,
  saveKeymap,
  unbind,
} from "../input";
import {
  assignedText,
  assignKey,
  checkAssign,
  chordFromEvent,
  clearAction,
  conflictQuestion,
  customFrom,
  keylessActions,
  keysOf,
  toCustom,
} from "../keymap-editor";
import {
  BACK_VIEW_LABEL,
  COLOR_SCHEME_LABEL,
  FLOW_STRIP_LABEL,
  hexColor,
  RACE_ALERT_LABEL,
  updateSettings,
  useCubeSettings,
  withFaceColor,
  withScheme,
} from "../settings";
import type { Quality } from "../view/types";
import { CubeNet } from "./CubeNet";

/** 큐브 설정 화면(`/cube/settings`): 키 배치·사용자 배치 편집, 색, 보기, 소리 */

const FACE_LABEL = [
  "위(U)",
  "오른쪽(R)",
  "앞(F)",
  "아래(D)",
  "왼쪽(L)",
  "뒤(B)",
];
const GROUP_LABEL: Record<ActionGroup, string> = {
  face: "면 돌리기",
  wide: "넓게 돌리기",
  inner: "안쪽 한 층",
  slice: "가운데 층",
  rotate: "큐브 돌리기",
  depth: "다음 수 깊이",
  command: "명령",
};
const QUALITY_LABEL: Record<Quality, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};
const SOLVED_FACES = Array.from({ length: 6 }, (_, f) =>
  new Array<number>(9).fill(f),
);

const chip = (on: boolean) =>
  cn(
    "rounded-lg px-3 py-1 text-sm",
    on ? "bg-sky-500 text-black" : "bg-white/10 hover:bg-white/15",
  );

export function CubeSettingsApp() {
  const settings = useCubeSettings();
  const [keymap, setKeymapState] = useState<Keymap | null>(null);
  useEffect(() => setKeymapState(loadKeymap()), []);
  const setKeymap = (km: Keymap) => {
    setKeymapState(km);
    saveKeymap(km);
  };

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5">
        <header className="flex items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-xl">큐브 설정</h1>
        </header>

        {keymap && <KeymapSection keymap={keymap} setKeymap={setKeymap} />}

        <section className="flex flex-col gap-3" data-settings-colors>
          <h2 className="font-semibold text-lg">색</h2>
          <div className="flex flex-wrap gap-2">
            {(["standard", "highContrast", "colorblind"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={settings.colorScheme === s}
                onClick={() => updateSettings(withScheme(settings, s))}
                className={chip(settings.colorScheme === s)}
              >
                {COLOR_SCHEME_LABEL[s]}
              </button>
            ))}
            {settings.colorScheme === "custom" && (
              <span className={chip(true)}>{COLOR_SCHEME_LABEL.custom}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <CubeNet
              n={3}
              faces={SOLVED_FACES}
              colors={settings.colors}
              hidden={settings.hidden}
              className="h-24 w-auto"
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {FACE_LABEL.map((label, f) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexColor(settings.colors[f] ?? 0)}
                    onChange={(e) =>
                      updateSettings(
                        withFaceColor(
                          settings,
                          f,
                          Number.parseInt(e.target.value.slice(1), 16),
                        ),
                      )
                    }
                    className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 text-sm">
          <h2 className="font-semibold text-lg">보기와 소리</h2>
          <label className="flex items-center gap-2">
            회전 속도 <b className="w-14 tabular-nums">{settings.moveMs}ms</b>
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={settings.moveMs}
              onChange={(e) =>
                updateSettings({ ...settings, moveMs: Number(e.target.value) })
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            그리기 품질
            {(["high", "medium", "low"] as const).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={settings.quality === q}
                onClick={() => updateSettings({ ...settings, quality: q })}
                className={chip(settings.quality === q)}
              >
                {QUALITY_LABEL[q]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-back-view>
            뒷면 보기
            {(["mirror", "net", "off"] as const).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={settings.backView === b}
                onClick={() => updateSettings({ ...settings, backView: b })}
                className={chip(settings.backView === b)}
              >
                {BACK_VIEW_LABEL[b]}
              </button>
            ))}
          </div>
          <p className="-mt-2 break-keep text-white/50 text-xs">
            거울은 안 보이는 뒤·왼쪽·아래 면을 큐브 둘레에 비춰 보여요. 좁은
            자리나 3D를 못 그리는 기기에서는 펼친 그림으로 보여요.
          </p>
          <div className="flex flex-wrap items-center gap-2" data-flow-setting>
            수 흐름 띠
            {(["on", "small", "off"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={settings.flowStrip === v}
                onClick={() => updateSettings({ ...settings, flowStrip: v })}
                className={chip(settings.flowStrip === v)}
              >
                {FLOW_STRIP_LABEL[v]}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            data-race-alert-setting
          >
            대결 알림
            {(["on", "quiet", "off"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={settings.raceAlerts === v}
                onClick={() => updateSettings({ ...settings, raceAlerts: v })}
                className={chip(settings.raceAlerts === v)}
              >
                {RACE_ALERT_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            가린 스티커
            {(["black", "gray"] as const).map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={settings.hidden === h}
                onClick={() => updateSettings({ ...settings, hidden: h })}
                className={chip(settings.hidden === h)}
              >
                {h === "black" ? "검정" : "회색"}
              </button>
            ))}
          </div>
          {(
            [
              ["stickerless", "스티커 없는 모양"],
              ["sound", "큐브 소리"],
              ["inspection", "혼자 맞추기 15초 살펴보기"],
              ["caseAlert", "혼자 맞추기 상황 알림(내 목록)"],
              ["keyColors", "키 그림에 면 색"],
              ["keyPairs", "키 그림에서 같은 면의 두 키 잇기"],
              ["keyFingers", "키 그림에 손가락 자리"],
              ["touchKeyboard", "휴대폰에서 단추 대신 키보드 그림을 눌러 치기"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                data-setting={k}
                className="size-4 shrink-0 accent-sky-400"
                checked={settings[k]}
                onChange={(e) =>
                  updateSettings({ ...settings, [k]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-3 text-sm" data-settings-hero>
          <h2 className="font-semibold text-lg">첫 화면 큐브</h2>
          <div className="flex flex-wrap items-center gap-2">
            크기
            {HERO_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                data-hero-size={n}
                aria-pressed={settings.heroSize === n}
                onClick={() =>
                  updateSettings({
                    ...settings,
                    heroSize: n,
                    heroMethod:
                      findHeroMethod(settings.heroMethod)?.size === n
                        ? settings.heroMethod
                        : HERO_ALTERNATE,
                  })
                }
                className={chip(settings.heroSize === n)}
              >
                {n}×{n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            해법
            {[
              { id: HERO_ALTERNATE, label: "번갈아" },
              ...heroMethodsFor(settings.heroSize),
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                data-hero-method={m.id}
                aria-pressed={settings.heroMethod === m.id}
                onClick={() =>
                  updateSettings({ ...settings, heroMethod: m.id })
                }
                className={chip(settings.heroMethod === m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function KeymapSection({
  keymap,
  setKeymap,
}: {
  keymap: Keymap;
  setKeymap: (km: Keymap) => void;
}) {
  const [n, setN] = useState(3);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** 이미 다른 동작이 놓인 키를 지정하려 할 때 바꿀지 묻는 중 */
  const [pending, setPending] = useState<{
    action: string;
    chord: KeyChord;
    current: string;
    /** 바꾸면 지금 동작에 남는 키가 없다 */
    orphan: boolean;
  } | null>(null);
  /** 편 묶음(동작이 90개 남짓이라 묶음별로 접는다. 처음엔 면 돌리기만) */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(["face"]),
  );
  const keyless = useMemo(() => keylessActions(keymap, n), [keymap, n]);
  const applyRef = useRef<(action: string, chord: KeyChord) => void>(() => {});
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const conflicts = useMemo(() => findConflicts(keymap), [keymap]);
  const actions = useMemo(() => actionsFor(n), [n]);

  // 키 지정: 다음 키 누름을 받는다(조합 키만 누르면 계속 기다린다, Esc는 그만두기)
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        setCapturing(null);
        setMessage(null);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      setCapturing(null);
      const check = checkAssign(keymap, capturing, chord);
      // 이미 다른 동작이 놓인 키: 저장 전에 묻는다(설계 4-1)
      if (check.current) {
        setPending({
          action: capturing,
          chord,
          current: check.current,
          orphan: check.orphan,
        });
        setMessage(null);
        return;
      }
      applyRef.current(capturing, chord);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, keymap]);

  /** 키를 놓고 무엇이 바뀌었는지 알린다 */
  function apply(action: string, chord: KeyChord) {
    const r = assignKey(keymap, action, chord);
    setKeymap(r.keymap);
    setPending(null);
    const rest = r.replaced ? keysOf(r.keymap, r.replaced).map(chordLabel) : [];
    setMessage(
      assignedText(
        chordLabel(chord),
        actionLabel(action),
        r.replaced ? actionLabel(r.replaced) : null,
        rest,
      ),
    );
  }

  applyRef.current = apply;

  const groups = [...new Set(actions.map((a) => a.group))];

  return (
    <section className="flex flex-col gap-3" data-settings-keymap>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-semibold text-lg">키 배치</h2>
        <a
          href="/cube/keys"
          data-keys-map-link
          className="text-sky-300 text-sm underline-offset-2 hover:underline"
        >
          키보드 그림으로 보기
        </a>
        <a
          href="/cube/keys/learn"
          className="text-sky-300 text-sm underline-offset-2 hover:underline"
        >
          키 익히기
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["twoHand", "notation"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={keymap.preset === p}
            onClick={() => {
              setKeymap(presetKeymap(p));
              setMessage(null);
            }}
            className={chip(keymap.preset === p)}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={keymap.preset === "custom"}
          onClick={() => setKeymap(toCustom(keymap))}
          className={chip(keymap.preset === "custom")}
        >
          {PRESET_LABEL.custom}
        </button>
      </div>

      {keymap.preset === "custom" && (
        <div
          className="flex flex-col gap-3 rounded-xl bg-white/5 p-3"
          data-keymap-editor
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              data-mouse-rotate
              checked={keymap.mouseRotate}
              onChange={(e) =>
                setKeymap({ ...keymap, mouseRotate: e.target.checked })
              }
              className="mt-0.5 size-4 shrink-0 accent-sky-400"
            />
            <span className="break-keep">
              마우스로 끌어 큐브 전체 돌리기(x·y·z)
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              동작 목록 크기
              <select
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="rounded bg-white/10 px-2 py-1"
              >
                {[2, 3, 4, 5, 6, 7].map((s) => (
                  <option key={s} value={s} className="bg-neutral-800">
                    {s}×{s}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto text-white/60 text-xs">
              기본으로 되돌리기:
            </span>
            {(["twoHand", "notation"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setKeymap(customFrom(p));
                  setMessage(`「${PRESET_LABEL[p]}」 배치로 되돌렸어요.`);
                }}
                className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
          {pending && (
            <div
              role="alertdialog"
              aria-label="키 바꾸기 확인"
              data-keymap-conflict={`${pending.current}>${pending.action}`}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-200/10 py-2 pr-2 pl-4"
            >
              <span className="min-w-0 flex-1 break-keep font-semibold text-amber-50 text-sm">
                {conflictQuestion(
                  chordLabel(pending.chord),
                  actionLabel(pending.current),
                  actionLabel(pending.action),
                  pending.orphan,
                )}
              </span>
              <button
                type="button"
                data-conflict-yes
                onClick={() => apply(pending.action, pending.chord)}
                className="min-h-9 shrink-0 rounded-lg bg-amber-200 px-3 font-bold text-slate-950 text-sm hover:bg-amber-100"
              >
                바꾸기
              </button>
              <button
                type="button"
                data-conflict-no
                onClick={() => setPending(null)}
                className="min-h-9 shrink-0 rounded-lg px-3 text-amber-100/80 text-sm hover:bg-white/10"
              >
                그만두기
              </button>
            </div>
          )}
          {message && (
            <p
              className="break-keep text-amber-200 text-xs"
              role="status"
              data-keymap-message
            >
              {message}
            </p>
          )}
          {keyless.length > 0 && (
            <p
              className="break-keep text-rose-200 text-xs"
              data-keymap-keyless={keyless.join(" ")}
            >
              키가 없는 동작: {keyless.map(actionLabel).join(", ")}. 「키
              지정」으로 놓아 주세요.
            </p>
          )}
          {conflicts.length > 0 && (
            <p className="text-red-300 text-xs" role="alert">
              겹친 키:{" "}
              {conflicts
                .map((c) => `${c.chord}(${c.actions.join("·")})`)
                .join(", ")}
            </p>
          )}
          {groups.map((g) => {
            const inGroup = actions.filter((a) => a.group === g);
            const missing = inGroup.filter((a) => keyless.includes(a.id));
            return (
              <details
                key={g}
                data-keymap-group={g}
                open={openGroups.has(g)}
                onToggle={(e) => {
                  const open = e.currentTarget.open;
                  setOpenGroups((s) => {
                    if (s.has(g) === open) return s;
                    const next = new Set(s);
                    if (open) next.add(g);
                    else next.delete(g);
                    return next;
                  });
                }}
              >
                <summary className="flex min-h-8 cursor-pointer items-center gap-2 font-semibold text-white/80 text-xs">
                  {GROUP_LABEL[g]}
                  <span className="font-normal text-white/45">
                    {inGroup.length}
                  </span>
                  {missing.length > 0 && (
                    <span className="rounded bg-rose-500/20 px-1.5 font-normal text-rose-200">
                      키 없음 {missing.length}
                    </span>
                  )}
                </summary>
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  {actions
                    .filter((a) => a.group === g)
                    .map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded bg-black/20 px-2 py-1 text-sm"
                      >
                        <span className="w-28 shrink-0 truncate font-mono text-xs">
                          {a.label}
                        </span>
                        <span className="flex flex-1 flex-wrap gap-1">
                          {keyless.includes(a.id) && (
                            <span
                              data-no-key
                              className="rounded bg-rose-500/20 px-1.5 text-rose-200 text-xs"
                            >
                              키 없음
                            </span>
                          )}
                          {keysOf(keymap, a.id).map((c) => (
                            <button
                              key={chordLabel(c)}
                              type="button"
                              title="이 키 빼기"
                              onClick={() => setKeymap(unbind(keymap, c))}
                              className="rounded bg-white/15 px-1.5 text-xs hover:bg-red-500/40"
                            >
                              {chordLabel(c)} ×
                            </button>
                          ))}
                        </span>
                        <button
                          type="button"
                          data-assign={a.id}
                          onClick={() => {
                            setCapturing(a.id);
                            setMessage(null);
                            setPending(null);
                          }}
                          className={cn(
                            "shrink-0 rounded px-2 py-0.5 text-xs",
                            capturing === a.id
                              ? "bg-amber-400 text-black"
                              : "bg-white/10 hover:bg-white/20",
                          )}
                        >
                          {capturing === a.id ? "키 기다리는 중" : "키 지정"}
                        </button>
                        {keysOf(keymap, a.id).length > 0 && (
                          <button
                            type="button"
                            title="이 동작의 키 모두 지우기"
                            onClick={() => setKeymap(clearAction(keymap, a.id))}
                            className="shrink-0 text-white/40 text-xs hover:text-white"
                          >
                            비우기
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <details className="rounded-xl bg-white/5 p-3 text-sm">
        <summary className="cursor-pointer">내보내기·가져오기(JSON)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            지금 배치
            <textarea
              readOnly
              value={exportKeymap(keymap)}
              rows={6}
              className="rounded bg-black/30 p-2 font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard?.writeText(exportKeymap(keymap))
              }
              className="self-start rounded bg-white/10 px-2 py-1"
            >
              복사
            </button>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            가져올 배치
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={6}
              className="rounded bg-black/30 p-2 font-mono"
            />
            <button
              type="button"
              onClick={() => {
                const r = importKeymap(importText);
                if (r.ok) {
                  setKeymap(r.keymap);
                  setImportError(null);
                  setMessage("배치를 가져왔어요.");
                } else setImportError(r.error);
              }}
              className="self-start rounded bg-white/10 px-2 py-1"
            >
              가져오기
            </button>
            {importError && <span className="text-red-300">{importError}</span>}
          </label>
        </div>
      </details>
    </section>
  );
}
