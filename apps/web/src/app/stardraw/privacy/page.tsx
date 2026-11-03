import type { Metadata, Viewport } from "next";
import { HomeLink } from "@/stardraw/components/HomeLink";

export const metadata: Metadata = {
  title: { absolute: "개인정보처리방침 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/**
 * 하늘의 별 따기 개인정보처리방침(docs/36 11-13). 구글 로그인 동의 화면의 브랜딩에 이 주소를 넣는다.
 * 받는 것은 "그 기관 사람이고 이번 기간에 처음 받는다"를 확인하는 데 필요한 것뿐이다
 */
export default function StardrawPrivacyPage() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-xl flex-col gap-5 break-keep text-sm text-white/80 leading-relaxed">
        <HomeLink />
        <h1 className="font-bold text-2xl text-white">개인정보처리방침</h1>
        <p>
          하늘의 별 따기(game.byb.kr/stardraw)가 무엇을 받고 어디에 쓰는지
          적습니다. 2026년 10월 31일부터 적용합니다(11월 3일 방문 통계를 고침).
        </p>

        <h2 className="font-bold text-base text-white">
          소속 받기(구글 로그인)
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            받는 것: 구글이 보내 주는 로그인 결과 중 이메일 주소, 이메일 확인
            여부, 기관 도메인. 이름·사진·연락처는 받지 않습니다.
          </li>
          <li>
            쓰는 곳: 그 기관 사람인지, 이번 자격 기간에 처음 받는지 확인하는
            데만 씁니다.
          </li>
          <li>
            남기는 것: 이메일을 서버 비밀 값으로 바꾼 값(HMAC)과 자격 기간
            번호만 남깁니다. 이메일 원문과 받은 시각은 남기지 않습니다. 자격
            기간 동안 보관합니다.
          </li>
          <li>
            도장은 가린 채로 찍기(블라인드 서명) 때문에, 서버도 어느 소속 번호가
            누구의 것인지 모릅니다. 예측 기록은 계정과 이어지지 않습니다.
          </li>
        </ul>

        <h2 className="font-bold text-base text-white">예측과 공개 장부</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            예측서(고른 별, 우주인 공개 열쇠, 붙인 소속 번호)와 우주인 등록은
            공개 장부에 남아 누구나 볼 수 있습니다. 이름·이메일은 없습니다.
          </li>
          <li>
            별 따기 서버는 접속 주소(IP)를 지나친 요청을 막는 데만 잠깐 쓰고
            저장하지 않습니다.
          </li>
          <li>
            패스키의 비밀 열쇠는 기기(인증기) 밖으로 나오지 않습니다. 소속의
            복구 코드는 이 기기 저장소에만 둡니다.
          </li>
        </ul>

        <h2 className="font-bold text-base text-white">관측지</h2>
        <p>
          관측지의 대화와 응원은 저장하지 않습니다. 서버는 받은 말을 그 순간
          관측지에 있는 사람들에게 건네주기만 하고, 관측을 마치면 남는 것이
          없습니다. 언덕에서 말하는 사람은 우주인 등록증 이름과 얼굴로 보입니다.
        </p>

        <h2 className="font-bold text-base text-white">방문 통계</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            방문 수는 직접 운영하는 통계 도구(Umami, stats.byb.kr)로 셉니다.
            쿠키를 쓰지 않고 IP를 저장하지 않습니다. 통계 스크립트는 이 사이트가
            직접 내보내는 고정된 파일입니다.
          </li>
          <li>
            세는 것: 연 화면의 경로(주소의 ? 와 # 뒤는 지웁니다), 우주인
            등록증을 만들었거나 신분증 제시로 찾았는지와 그 화면, 패스키가 막힌
            까닭 종류(취소·지원 안 함·앱 안 브라우저 등), 예측을 시작했는지(그
            회차에 첫 별을 담을 때, 이 기기의 첫 예측인지), 예측서를 내지 못한
            까닭 종류, 공지 링크로 왔는지.
          </li>
          <li>
            세지 않는 것: 고른 별, 공개 열쇠·등록번호·이름, 예측서와 접수증,
            예측서를 낸 순간(접수 뒤 접수증 화면으로 옮기는 것도 세지 않습니다).
          </li>
          <li>아무것도 보내지 않는 화면: 소속 받기, 입상 확인, 국장 화면.</li>
          <li>
            브라우저에서 &quot;추적하지 말라&quot;(DNT·GPC)를 켰거나{" "}
            <a href="/security" className="underline hover:text-white">
              보안 설명
            </a>
            에서 끄면 보내지 않습니다.
          </li>
        </ul>

        <h2 className="font-bold text-base text-white">문의</h2>
        <p>
          <a
            href="https://github.com/ybbarng/game/issues"
            className="underline hover:text-white"
          >
            github.com/ybbarng/game/issues
          </a>
        </p>
      </article>
    </main>
  );
}
