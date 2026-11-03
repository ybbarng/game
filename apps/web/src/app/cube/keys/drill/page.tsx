import type { Metadata } from "next";

import { KeyDrillApp } from "@/cube/components/KeyDrillApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 조작 훈련" },
  description:
    "표기를 보고 키를 치고, 빛나는 키의 동작을 맞히고, 공식을 키로 반복한다. 키별 맞힘률·반응 시간, 약한 키를 더 자주.",
};

export default function CubeKeysDrillPage() {
  return <KeyDrillApp />;
}
