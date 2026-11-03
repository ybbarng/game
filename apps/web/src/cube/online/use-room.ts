"use client";

import { useEffect, useState } from "react";

import type { CubeRoom } from "./room";

/** 방이 바뀔 때마다 오르는 값. 화면이 다시 그리게 한다 */
export function useCubeRoom(room: CubeRoom | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!room) return;
    setVersion((v) => v + 1);
    return room.onChange(() => setVersion((v) => v + 1));
  }, [room]);
  return version;
}
