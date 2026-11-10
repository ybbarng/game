import type { Metadata } from "next";

import { CubeRedirect } from "@/cube/nav/CubeRedirect";

export const metadata: Metadata = {
  title: { absolute: "큐브 사이트 쓰는 법" },
  robots: { index: false },
};

/** 옛 주소: 조작 훈련은 사이트 쓰는 법의 「연습」 부분으로 옮겼다(docs/47 16-6). `?mode=`는 그대로 넘어간다 */
export default function CubeKeysDrillPage() {
  return <CubeRedirect to="/cube/intro?part=practice" label="조작 연습으로" />;
}
