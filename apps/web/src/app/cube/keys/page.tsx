import type { Metadata } from "next";

import { KeysApp } from "@/cube/components/KeysApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 단축키 표" },
  description:
    "큐브 맞추기 키 배치를 실제 키보드 모양으로 본다. 그냥·Shift·Alt 층, 면마다 색, 크기별로 흐리게, 동작으로 키 찾기, 인쇄.",
};

export default function CubeKeysPage() {
  return <KeysApp />;
}
