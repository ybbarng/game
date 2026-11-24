"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { leaveQuietly } from "@/game/screen-history";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

/**
 * 온라인 방 이름 칸. 저장해 둔 이름은 그린 뒤 처음 한 번만 채운다(설정 저장소가 늦게 불려 와도).
 * 사람이 칸을 고치거나 다 지운 뒤에는 다시 채우지 않는다
 */
export function usePlayerNameField(): [string, (name: string) => void] {
  const savedName = useSettings((s) => s.playerName);
  const [name, setNameState] = useState("");
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || !savedName) return;
    settled.current = true;
    setNameState(savedName);
  }, [savedName]);
  const setName = useCallback((next: string) => {
    settled.current = true;
    setNameState(next);
  }, []);
  return [name, setName];
}

/** 입력 칸 글자 크기: 휴대폰은 16px(iOS가 칸을 누를 때 화면을 키우지 않는다), 넓은 화면만 작게 */
export const INPUT_TEXT = "text-base sm:text-sm";

/** 이름 입력 단계. Enter(휴대폰 「이동」)로도 방을 만들거나 들어간다 */
export function NameForm({
  onSubmit,
  children,
}: {
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** 이름 칸(대기실 화면들이 함께 쓴다) */
export function NameInput({
  value,
  onChange,
  placeholder = "친구에게 보일 이름",
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      내 이름
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={12}
        enterKeyHint="go"
        autoComplete="nickname"
        placeholder={placeholder}
        className={cn(
          "rounded-lg border border-white/15 bg-black/40 px-3 py-2",
          INPUT_TEXT,
        )}
      />
    </label>
  );
}

/** 대기실 맨 아래 「처음으로」(오류 화면은 `RoomError`가 단추로 따로 둔다) */
export function RoomBackLink({
  onBack,
  phase,
}: {
  onBack: () => void;
  /** 대기실 단계. 방에 아직 들지 않았거나(이름) 못 들었으면(꽉 참·내보냄) 나갈지 묻지 않는다 */
  phase: string;
}) {
  const quiet = phase === "name" || phase === "full" || phase === "kicked";
  return (
    <button
      type="button"
      onClick={() => (quiet ? leaveQuietly(onBack) : onBack())}
      className="text-center text-white/80 text-xs underline"
    >
      처음으로
    </button>
  );
}

/** 대기실 맨 아래 연결 안내 글(작은 글이라 바탕과 대비를 넉넉히) */
export function RoomFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="text-center text-white/75 text-xs leading-relaxed">
      {children}
    </p>
  );
}

/** 방에 연결하지 못했을 때: 오류와 「다시 연결」·「처음으로」 단추 */
export function RoomError({
  error,
  onRetry,
  onBack,
}: {
  error: string | null;
  onRetry: () => void;
  /** 없으면 「처음으로」를 두지 않는다(화면 머리에 따로 있을 때) */
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-center text-red-300 text-sm">
        {error ? `연결하지 못했어요: ${error}` : "연결하지 못했어요."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-xl bg-amber-300 py-3 font-semibold text-black"
        >
          다시 연결
        </button>
        {onBack && (
          <button
            type="button"
            // 방에 잇지 못했으니 나갈지 다시 묻지 않는다
            onClick={() => leaveQuietly(onBack)}
            className="flex-1 rounded-xl bg-white/10 py-3 font-semibold"
          >
            처음으로
          </button>
        )}
      </div>
    </div>
  );
}
