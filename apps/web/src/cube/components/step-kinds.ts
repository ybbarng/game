// 배우기 단계 종류의 이름과 단계 띠 아이콘(LearnApp·처음 안내가 함께 쓴다)

export const KIND_LABEL = {
  text: "설명",
  demo: "시연",
  try: "해보기",
  look: "둘러보기",
  find: "찾아보기",
  quiz: "문제",
  turn: "따라 하기",
  play: "돌려 보기",
  welcome: "환영",
  parts: "조각 보기",
  build: "분해·조립",
} as const;

export const KIND_MARK = {
  demo: "▶",
  try: "✋",
  look: "↻",
  find: "◎",
  quiz: "?",
  turn: "✋",
  play: "✦",
  welcome: "★",
  parts: "▦",
  build: "⚙",
} as const;
