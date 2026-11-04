import type { Metadata } from "next";

import { CubeOnlineApp } from "@/cube/online/CubeOnlineApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 온라인 대결" },
  description:
    "친구 2~8명이 같은 섞기로 겨루는 큐브 대결. 서버 없이, 섞기는 모두가 함께 정한다.",
};

export default function CubeOnlinePage() {
  return <CubeOnlineApp />;
}
