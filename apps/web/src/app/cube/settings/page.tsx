import type { Metadata } from "next";

import { CubeSettingsApp } from "@/cube/components/CubeSettingsApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 설정" },
  description:
    "큐브 키 배치(두 손·표기·사용자), 색, 그리기 품질, 회전 빠르기를 바꾼다.",
};

export default function CubeSettingsPage() {
  return <CubeSettingsApp />;
}
