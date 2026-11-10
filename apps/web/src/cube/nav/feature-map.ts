// 큐브 기능 지도(`/cube/map`, docs/47 16-2): 큐브의 모든 화면을 첫 화면 뼈대 차례로 한 쪽에 모은다.
// 화면을 새로 두거나 옮기면 여기도 고친다(시험이 주소마다 page가 있는지 본다).

export interface FeatureItem {
  icon: string;
  title: string;
  href: string;
  /** 한 줄 설명 */
  what: string;
}

export interface FeatureSection {
  title: string;
  items: FeatureItem[];
}

export const FEATURE_MAP: FeatureSection[] = [
  {
    title: "처음이라면",
    items: [
      {
        icon: "👋",
        title: "사이트 쓰는 법",
        href: "/cube/intro",
        what: "표기 읽기, 화면 읽기, 키 배치 고르기",
      },
      {
        icon: "⌨️",
        title: "키 익히기",
        href: "/cube/intro?part=keys",
        what: "손 자리부터 짧은 공식까지 지금 배치로 한 단계씩",
      },
      {
        icon: "🎹",
        title: "조작 연습",
        href: "/cube/intro?part=practice",
        what: "수 보고 치기, 키 보고 맞히기, 공식 따라 치기",
      },
      {
        icon: "🧩",
        title: "처음 맞추기",
        href: "/cube/learn?lesson=333-start",
        what: "3×3 층별 해법을 처음부터 따라 하기",
      },
    ],
  },
  {
    title: "해법 익히기",
    items: [
      {
        icon: "🎓",
        title: "해법 익히기",
        href: "/cube/methods",
        what: "초보자 해법, CFOP, 루, ZZ, 큰 큐브, 블라인드를 배우고 연습",
      },
      {
        icon: "🎯",
        title: "공식 연습",
        href: "/cube/train",
        what: "뜨는 공식을 따라 치며 이어 맞추기(십자부터 PLL까지)",
      },
      {
        icon: "🎲",
        title: "자유 훈련",
        href: "/cube/train?mode=free",
        what: "상황을 골라 시간 재기, 오르테가·패리티·블라인드 공식",
      },
      {
        icon: "✚",
        title: "십자 훈련",
        href: "/cube/train/cross",
        what: "살펴보고 몇 수 안에 십자를 만드는지",
      },
      {
        icon: "📒",
        title: "내 공식",
        href: "/cube/algs",
        what: "상황마다 쓸 공식을 넣고 고르기",
      },
    ],
  },
  {
    title: "맞추기·겨루기",
    items: [
      {
        icon: "🧊",
        title: "혼자 맞추기",
        href: "/cube/solo",
        what: "섞고 맞춰 시간 재기, 5번·12번 평균, 티어",
      },
      {
        icon: "📅",
        title: "오늘의 섞기",
        href: "/cube/daily",
        what: "날마다 모두 같은 섞기를 하루 한 번",
      },
      {
        icon: "⏳",
        title: "제한 도전",
        href: "/cube/challenge",
        what: "시간이나 수에 체력바를 두고 맞추기",
      },
      {
        icon: "🙈",
        title: "블라인드",
        href: "/cube/blind",
        what: "보고 외운 뒤 가려진 큐브 맞추기",
      },
      {
        icon: "🏁",
        title: "친구와 대결",
        href: "/cube/online",
        what: "2~8명이 같은 섞기로, 서버 없이",
      },
      {
        icon: "🤖",
        title: "컴퓨터와 대결",
        href: "/cube/vs",
        what: "단계를 고른 컴퓨터와 같은 섞기로",
      },
    ],
  },
  {
    title: "더 보기",
    items: [
      {
        icon: "🎨",
        title: "패턴",
        href: "/cube/patterns",
        what: "예쁜 무늬를 한 수씩 보고 직접 만들기",
      },
      {
        icon: "🧩",
        title: "모양 만들기",
        href: "/cube/patterns?tab=make",
        what: "목표 모양을 시간 재며 만들기",
      },
      {
        icon: "🏅",
        title: "티어표",
        href: "/cube/tiers",
        what: "크기마다 맞추기 속도 티어",
      },
      {
        icon: "🔢",
        title: "큐브의 수학",
        href: "/cube/math",
        what: "경우의 수, 패리티, 신의 수를 직접 해 보며",
      },
      {
        icon: "⏱",
        title: "타이머",
        href: "/cube/timer",
        what: "실물 큐브 시간 재기",
      },
      {
        icon: "✋",
        title: "핑거 트릭",
        href: "/cube/fingers",
        what: "실물 큐브 손가락 쓰는 법 반복 연습",
      },
      {
        icon: "⚙️",
        title: "설정",
        href: "/cube/settings",
        what: "키 배치, 색, 그리기, 회전 빠르기",
      },
      {
        icon: "🗂",
        title: "단축키 표",
        href: "/cube/keys",
        what: "지금 키 배치를 키보드 모양으로, 인쇄",
      },
    ],
  },
];
