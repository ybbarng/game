"use client";

import dynamic from "next/dynamic";

import type { RoomScreen as RoomScreenType } from "./RoomScreen";
import { ScreenLoading } from "./ScreenLoading";

/**
 * 온라인 방 화면(`RoomScreen`)을 「다함께」를 눌렀을 때 불러온다. 방 화면은 방장·참가자 방 코드와 멘탈 포커
 * (fair-play) 전체를 끌어와, 게임 첫 화면 묶음에서 뺀다(2026-11-25 첫 화면 가볍게).
 * 쓰는 쪽은 `RoomScreen`과 똑같이 쓴다(형도 같다)
 */
export const RoomScreen = dynamic(
  () => import("./RoomScreen").then((m) => m.RoomScreen),
  { loading: () => <ScreenLoading /> },
) as unknown as typeof RoomScreenType;
