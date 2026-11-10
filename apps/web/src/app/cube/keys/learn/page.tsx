import type { Metadata } from "next";

import { CubeRedirect } from "@/cube/nav/CubeRedirect";

export const metadata: Metadata = {
  title: { absolute: "큐브 사이트 쓰는 법" },
  robots: { index: false },
};

/** 옛 주소: 키 익히기는 사이트 쓰는 법의 「키」 부분으로 옮겼다(docs/47 16-6) */
export default function CubeKeysLearnPage() {
  return <CubeRedirect to="/cube/intro?part=keys" label="키 익히기로" />;
}
