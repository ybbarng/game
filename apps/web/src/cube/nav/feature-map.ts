// 큐브 기능 지도(`/cube/map`, docs/47 16-2): 큐브의 모든 화면을 첫 화면 뼈대 차례로 한 쪽에 모은다.
// 화면을 새로 두거나 옮기면 여기도 고친다(시험이 주소마다 page가 있는지 본다).
// 설명은 처음 오는 사람이 읽는다. 해법·기능 이름은 하는 일로 먼저 풀고, 위에서 아래로 읽을 때 뜻을 알린 뒤에
// 쓴다(`feature-map.test.ts`, docs/standing-rules.md 1·3절).

export interface FeatureItem {
  icon: string;
  title: string;
  href: string;
  /** 한두 문장 설명(마침표로 끝낸다) */
  what: string;
}

export interface FeatureSection {
  title: string;
  items: FeatureItem[];
}

/** 제목 아래 첫 글: 이 쪽이 무엇인지 */
export const MAP_INTRO =
  "큐브 맞추기의 모든 화면을 한 페이지에 모았어요. 큐브 첫 화면과 같은 차례로 묶었고, 화면마다 무엇을 하는 곳인지와 주소를 적었어요.";

export const FEATURE_MAP: FeatureSection[] = [
  {
    title: "처음이라면",
    items: [
      {
        icon: "👋",
        title: "사이트 쓰는 법",
        href: "/cube/intro",
        what: "돌리기를 적는 글자인 표기 읽기, 화면 읽기, 키 배치 고르기를 알려 줘요.",
      },
      {
        icon: "⌨️",
        title: "키 익히기",
        href: "/cube/intro?part=keys",
        what: "지금 고른 키 배치로 손 놓는 자리부터 익혀요. 마지막에는 정해진 돌리기 묶음인 짧은 공식까지 한 단계씩 쳐 봐요.",
      },
      {
        icon: "🎹",
        title: "조작 연습",
        href: "/cube/intro?part=practice",
        what: "화면에 뜬 돌리기를 키로 치거나, 키를 보고 어떤 돌리기인지 맞히거나, 공식을 따라 쳐요.",
      },
      {
        icon: "🧩",
        title: "처음 맞추기",
        href: "/cube/learn?lesson=333-start",
        what: "3×3을 한 층씩 맞추는 해법을 처음부터 따라 해요.",
      },
    ],
  },
  {
    title: "해법 익히기",
    items: [
      {
        icon: "🎓",
        title: "해법 고르기",
        href: "/cube/methods",
        what: "처음 맞추는 해법부터 골라 배우고 연습해요. 이름이 CFOP·루·ZZ인 빠른 해법 셋, 4×4 이상의 큰 큐브를 맞추는 법, 눈을 가리고 맞추는 블라인드도 있어요.",
      },
      {
        icon: "🎯",
        title: "공식 연습",
        href: "/cube/train",
        what: "해법의 단계마다 화면에 뜨는 공식을 따라 치며, 섞인 큐브를 끝까지 맞춰요.",
      },
      {
        icon: "🎲",
        title: "자유 훈련",
        href: "/cube/train?mode=free",
        what: "연습할 공식 묶음을 골라 시간을 재요. 2×2, 큰 큐브, 눈 가리고 맞추기에 쓰는 공식도 있어요.",
      },
      {
        icon: "✚",
        title: "십자 훈련",
        href: "/cube/train/cross",
        what: "첫 면을 맞추는 첫걸음인 십자를 연습해요. 면 가운데 조각인 센터 블럭 둘레로, 모서리 조각인 엣지 블럭 4개를 제자리에 옮기면 십자 모양이 돼요. 미리 살펴본 뒤 몇 수 만에 하는지 재요.",
      },
      {
        icon: "📒",
        title: "내 공식",
        href: "/cube/algs",
        what: "같은 모양에 쓸 수 있는 공식이 여럿일 때, 내가 쓸 공식을 골라 넣어 둬요.",
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
        what: "섞인 큐브를 맞추며 시간을 재요. 최근 5번·12번 기록의 평균과, 맞추는 속도로 나눈 등급인 티어도 보여요.",
      },
      {
        icon: "📅",
        title: "오늘의 섞기",
        href: "/cube/daily",
        what: "날마다 모두에게 같은 섞기가 나오고, 하루에 한 번 도전해요.",
      },
      {
        icon: "⏳",
        title: "제한 도전",
        href: "/cube/challenge",
        what: "주어진 시간이나 돌리는 수가 바닥나기 전에 맞춰요.",
      },
      {
        icon: "🙈",
        title: "블라인드",
        href: "/cube/blind",
        what: "섞인 큐브를 보고 외운 뒤, 가려진 큐브를 맞춰요. 눈을 가리고 맞추는 연습이에요.",
      },
      {
        icon: "🏁",
        title: "친구와 대결",
        href: "/cube/online",
        what: "2~8명이 같은 섞기로 동시에 겨뤄요. 서버 없이 서로의 기기를 바로 이어서 겨뤄요.",
      },
      {
        icon: "🤖",
        title: "컴퓨터와 대결",
        href: "/cube/vs",
        what: "실력 단계를 고른 컴퓨터와 같은 섞기로 겨뤄요.",
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
        what: "큐브 면에 예쁜 무늬를 만드는 공식을 한 수씩 보고 따라 만들어요.",
      },
      {
        icon: "🖼",
        title: "모양 만들기",
        href: "/cube/patterns?tab=make",
        what: "보여 주는 무늬를 시간을 재며 직접 만들어요.",
      },
      {
        icon: "🏅",
        title: "티어표",
        href: "/cube/tiers",
        what: "큐브 크기마다 티어를 나누는 시간을 표로 보여요.",
      },
      {
        icon: "🔢",
        title: "큐브의 수학",
        href: "/cube/math",
        what: "섞으면 나오는 모양의 수, 다시 끼우면 못 맞추는 까닭, 가장 짧은 풀이 수 같은 큐브 속 수학을 직접 해 보며 읽어요.",
      },
      {
        icon: "⏱",
        title: "타이머",
        href: "/cube/timer",
        what: "실물 큐브를 맞출 때 시간을 재요.",
      },
      {
        icon: "✋",
        title: "핑거 트릭",
        href: "/cube/fingers",
        what: "실물 큐브를 손가락으로 빠르게 돌리는 법인 핑거 트릭을 되풀이해 연습해요.",
      },
      {
        icon: "⚙️",
        title: "설정",
        href: "/cube/settings",
        what: "키 배치, 색, 그림 품질, 돌리는 빠르기를 바꿔요.",
      },
      {
        icon: "🗂",
        title: "단축키 표",
        href: "/cube/keys",
        what: "지금 키 배치를 키보드 모양으로 보여 주고, 인쇄할 수 있어요.",
      },
    ],
  },
];
