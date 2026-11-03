import type { Metadata } from "next";

import { KeyLearnApp } from "@/cube/components/KeyLearnApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 키 익히기" },
  description:
    "손 자리부터 R·U·L, 큐브 돌리기, 넓게·가운데 층, 되돌리기·섞기, 짧은 공식까지 지금 키 배치로 단계별로 익힌다.",
};

export default function CubeKeysLearnPage() {
  return <KeyLearnApp />;
}
