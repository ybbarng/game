"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ScreenLoading } from "@/components/ScreenLoading";

import {
  deleteArchive,
  exportArchives,
  type GameArchive,
  importArchives,
  listArchives,
  loadArchive,
} from "./archive";
import { GAME_NAME, when } from "./labels";

/** 게임 하나 다시 보기는 목록에서 고를 때 불러온다(게임마다 다시 보기 화면을 첫 화면 묶음에서 뺀다) */
const ArchiveView = dynamic(
  () => import("./ArchiveView").then((m) => m.ArchiveView),
  { loading: () => <ScreenLoading /> },
);

/**
 * 복기: 이 기기에 남긴 게임 목록 → 판마다 한눈에 보기(주공·공약·돈·턴 표) → 다시 보기(게임 화면으로 한 걸음씩).
 * 주소 `?id=`가 있으면 그 게임을 연다
 */
export function ReviewPage() {
  const [list, setList] = useState<GameArchive[] | null>(null);
  const [archive, setArchive] = useState<GameArchive | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const download = async () => {
    const blob = new Blob([await exportArchives()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-review-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (f: File) => {
    const count = await importArchives(await f.text());
    setNotice(
      count === null
        ? "복기 기록 파일이 아니에요."
        : `${count}게임을 가져왔어요.`,
    );
    setList(await listArchives());
  };

  /** 목록에서 연 게임이면 기록에 한 칸 쌓았다(뒤로가기·「목록」이 그 칸을 되돌린다) */
  const pushed = useRef(false);

  useEffect(() => {
    const openFromUrl = () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) {
        setArchive(null);
        return;
      }
      void loadArchive(id).then((a) => {
        if (a) setArchive(a);
        else setMissing(true);
      });
    };
    openFromUrl();
    void listArchives().then(setList);
    // 휴대폰 뒤로가기: 보던 게임에서 목록으로(페이지 밖으로 나가지 않게)
    const onPop = () => {
      pushed.current = false;
      openFromUrl();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (archive)
    return (
      <ArchiveView
        archive={archive}
        onBack={() => {
          if (pushed.current) {
            window.history.back();
            return;
          }
          setArchive(null);
          window.history.replaceState(null, "", "/review");
        }}
      />
    );

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">지난 게임 복기</h1>
          <a
            href="/profile"
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
          >
            ← 내 기록
          </a>
        </div>
        {missing && (
          <p className="text-sm text-rose-300">
            그 게임 기록이 이 기기에 없어요.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => void download()}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
          >
            내보내기
          </button>
          <button
            type="button"
            onClick={() => file.current?.click()}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
          >
            가져오기
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="복기 기록 파일"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          {notice && (
            <span role="status" className="text-white/70">
              {notice}
            </span>
          )}
        </div>
        {list === null ? null : list.length === 0 ? (
          <p className="rounded-2xl bg-black/35 p-4 text-sm text-white/70">
            아직 남긴 게임이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-2xl bg-black/35 px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    setArchive(a);
                    pushed.current = true;
                    window.history.pushState(
                      null,
                      "",
                      `/review?id=${encodeURIComponent(a.id)}`,
                    );
                  }}
                  className="flex min-w-0 flex-1 flex-col text-left"
                >
                  <span className="font-semibold">
                    {GAME_NAME[a.game] ?? a.game} ·{" "}
                    {a.mode === "solo" ? "혼자" : "친구와"}
                  </span>
                  <span className="text-white/60 text-xs">
                    {when(a.startedAt)} · {a.rounds}판
                    {a.over ? " · 끝남" : " · 하던 중"}
                    {a.invalid && (
                      <span data-review-invalid className="text-rose-300">
                        {" · 무효"}
                      </span>
                    )}
                  </span>
                </button>
                <ConfirmButton
                  question="정말 지울까요?"
                  confirmLabel="지우기"
                  onConfirm={() =>
                    void deleteArchive(a.id).then(() =>
                      setList((l) => l?.filter((x) => x.id !== a.id) ?? null),
                    )
                  }
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                >
                  지우기
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
