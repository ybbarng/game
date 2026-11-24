# 54. 첫 화면 가볍게(첫 로딩 JS 줄이기)

2026-11-25. 휴대폰에서 주소를 처음 열 때 받는 JS를 줄였다. 화면에 보이는 동작은 그대로다(배우기·온라인 방·복기 게임 하나·소리 짜기를 처음 열 때만 그 묶음을 따로 받는다).

## 1. 재는 법

```
pnpm --filter @game/web build
node scripts/bundle-size.mjs                      # 기본 주소들(/ /omok /baduk /mighty /stardraw /cube /profile /review)
node scripts/bundle-size.mjs /hearts /chess       # 고른 주소만
node scripts/bundle-size.mjs --json before.json   # 남겨 두고
node scripts/bundle-size.mjs --compare before.json  # 고친 뒤 견주기
```

- 값은 내보낸 HTML(`apps/web/out/<주소>.html`)이 처음 받는 `/_next/static/chunks/*.js`를 파일마다 gzip한 크기의 합이다. 나중에 동적 불러오기로 받는 묶음은 들지 않는다.
- 어느 패키지·파일이 실렸는지 가르려면 `ANALYZE=1 pnpm --filter @game/web build`(소스 맵을 만든다, 운영 빌드에는 싣지 않는다) 뒤 `--sources /omok`(묶음별)·`--files /omok`(파일별). 크기는 소스 맵에 든 원본 글자 수라 비율로만 본다.

## 2. 결과(KB, gzip)

| 주소 | 전 | 후 | 차이 |
|---|---:|---:|---:|
| / | 230.6 | 183.3 | -21% |
| /omok | 386.8 | 252.7 | -35% |
| /baduk | 414.0 | 254.9 | -38% |
| /mighty | 397.9 | 316.5 | -20% |
| /stardraw | 519.1 | 437.9 | -16% |
| /cube | 263.9 | 211.8 | -20% |
| /profile | 399.8 | 362.8 | -9% |
| /review | 591.0 | 196.1 | -67% |
| /hearts | 391.5 | 287.5 | -27% |
| /janggi | 428.9 | 290.9 | -32% |
| /chess | 420.5 | 265.9 | -37% |
| /gostop | 393.4 | 306.3 | -22% |
| /yut | 387.0 | 272.0 | -30% |
| /galaxy | 449.1 | 329.4 | -27% |
| /baseball | 376.6 | 261.8 | -30% |
| /onecard | 390.0 | 284.7 | -27% |

첫 화면 183KB는 거의 Next·React 자체다(소스 맵 기준 원본 글자 수로 Next 1,673KB, 사이트 코드는 콘솔 이스터에그·목록·기록 저장 등 50KB 안쪽). 게임 코드는 거의 남지 않았다.

## 3. 원인과 고친 것(단계별로 잰 값)

중간에 세 번 쟀다. 단계마다 여러 원인을 함께 고쳐 원인 하나씩의 값은 따로 없다.

| 단계 | / | /omok | /baduk | /mighty | /stardraw | /cube | /profile | /review |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 전 | 230.6 | 386.8 | 414.0 | 397.9 | 519.1 | 263.9 | 399.8 | 591.0 |
| ① 저장소·원카드 이름표·소리·LocalMatch·온라인 방 | 183.5 | 322.8 | 348.8 | 338.5 | 486.9 | 226.7 | 387.3 | 586.3 |
| ② browserPace·시계 길·sideEffects·transpilePackages | 183.5 | 273.7 | 299.3 | 316.9 | 438.6 | 212.1 | 363.2 | 574.1 |
| ③ 판 게임 배우기·복기·packages/core | 183.3 | 252.7 | 254.9 | 316.5 | 437.9 | 211.8 | 362.8 | 196.1 |

① 
- **루트 layout의 StoreHydration이 13개 게임 설정·진행 저장소를 이름으로 불렀다** → 모든 화면이 모든 게임 설정과 그 기본값을 만드는 엔진을 실었다. 저장소 파일이 `hydrateAfterFirstPaint`(`lib/persist-hydration.ts`)로 스스로 올리고, StoreHydration은 그 화면이 불러온 것만 첫 그리기 뒤에 읽는다. 첫 그리기 뒤에 불러온 화면의 저장소는 올리는 순간 읽는다. 새 게임 체크리스트(docs/21)도 이 길로 고쳤다.
- **원카드 설정이 단계 이름표 하나를 위해 `@game/onecard-ai` 전체를 불렀다** → 패키지에 `./levels` 길을 열었다.
- **설정(`game/settings.ts`)이 `setVolume` 하나를 위해 2천 줄 `game/sound.ts`를 불렀다** → 음량은 작은 칸 `game/volume.ts`, 소리가 따라간다. 소리 이름·크기·합성은 `game/sound/render.ts`로 옮기고 첫 누름이나 첫 소리 때 따로 불러온다(그사이 부른 소리는 불러온 뒤 낸다). `game/sound.ts`는 소리 상자 열고 닫기와 `play`만.
- **공통 `LocalMatch`가 kit·bot이 없으면 마이티로 두려고 마이티 키트·컴퓨터를 불렀다** → kit을 꼭 받고, 마이티는 `MightyLocalMatch`(`game/mighty-local-match.ts`)가 채운다.
- **13개 게임 App이 온라인 방 화면(RoomScreen → HostRoom → 멘탈 포커 전체)을 정적으로 불렀다** → `components/LazyRoomScreen.tsx`(next/dynamic, 형은 같다). 불러오는 동안은 글 없는 작은 돌기 표시(`components/ScreenLoading.tsx`).

②
- **모든 게임 저장소가 쓰는 `browserPace`가 마이티 컴퓨터 파일(`game/bots.ts`)에 있었다** → `game/pace.ts`.
- **`LocalMatch`가 시계 하나를 위해 `@game/fair-play` index(멘탈 포커 전체)를 불렀다** → `@game/fair-play/clock`.
- **패키지 35개 가운데 34개에 `"sideEffects": false`가 없었다** → index에서 `export *` 하는 패키지는 이름 하나만 불러도 전부 실렸다. 최상위에서 실행하는 코드·CSS·전역 등록이 없는 34개에 두었다(터미널 진입 파일이 있는 `stardraw-cli`는 뺐다).
- **`next.config.ts` `transpilePackages`(다섯 개)가 낡았다** → 나머지 서른 패키지가 목록 없이 빌드되고 있었다. 지워도 빌드·결과가 같다.

③
- **판 게임 App이 수 배우기 자료(바둑 문제·단원만 10만 자 넘게)·튜토리얼·문제 화면을 정적으로 실었다** → 게임마다 배우기 화면을 `<게임>Learn.tsx`(오목·바둑·체스·장기)로 모으고 next/dynamic으로 부른다.
- **복기(/review)가 열 게임의 다시 보기와 카드 게임 표 묶음을 모두 실었다** → 게임 하나 보기(`review/ArchiveView.tsx`)를 목록에서 고를 때 불러오고, 그 안에서도 게임마다 따로 부른다. 갈래는 가벼운 이름 목록 `CARD_REPLAY_GAMES`로 고르고 어긋남은 `replay-tables.test.ts`가 본다.
- **모든 게임의 공통 도구(난수·개인 시간·조사)가 마이티 엔진에 있었다** → `packages/core`(`@game/core`). 마이티 엔진은 다시 내보내 옛 경로를 잠시 살린다. 판 게임·화투·윷·은하·큐브 엔진과 stardraw-core는 core를 부른다. ②의 sideEffects로 묶음 크기는 이미 거의 같아져, 이 단계는 구조 정리다.

## 4. 남은 것(지도 `platform-shared-pieces` next)

- **온라인 방 묶음의 멘탈 포커 기기·libsodium**: 「다함께」 → 「방 만들기」까지 더 받는 JS가 오목 239KB인데 그 가운데 libsodium 183KB와 fair-play 기기·증명(device·shuffle-proof·sra·ristretto) 12KB가 멘탈 포커를 쓰지 않는 판 게임에도 실린다. `net/session.ts`의 `openTransport`가 모든 게임에서 `prepareGroup("r255")`을 기다리고, 방 코드(`host-room`·`guest-room`·`p2p-transport`·`protocol`)가 `realClock` 등을 `@game/fair-play` index에서 부른다. 멘탈 포커를 쓰는 방(킷에 `loadFairTable`이 있음)에서만 군을 불러 준비하고 시계는 `@game/fair-play/clock`에서 부르면 판 게임 방에서 빠진다. 화투·원카드 판은 2026-11-25에 방 묶음에서 뺐다(docs/13 13절 「화투·원카드도」).

- **/profile 탭별 통계**: 탭 화면과 `KIT_STATS`가 게임 키트(`@/chess/kit` 등)를 불러 컴퓨터(chess-ai·baduk-ai·janggi-ai…)까지 실린다. 탭마다 모듈(통계 화면 + 기록 정의)로 나눠 고른 탭만 불러야 한다. 지금 363KB로 가장 덜 줄었다.
- **카드 게임 배우기**: 마이티·하트·화투 셋·원카드·윷·숫자야구·은하 App은 아직 튜토리얼(LessonPlayer와 단원 자료)을 정적으로 싣는다. 판 게임처럼 `<게임>Learn.tsx`로.
- **소리 짜기 갈래 나누기**: `game/sound/render.ts`(약 1,900줄)를 합성 기본(`synth`)과 영역별(마이티·화투·판 게임·큐브·별 따기)로 나누면 첫 소리 때 받는 양도 줄고 읽기 쉬워진다. 첫 화면 묶음에서는 이미 빠졌다.
- **공통 도구 옛 경로 걷기**: 컴퓨터 패키지·fair-play·웹(약 250파일)이 아직 `@game/mighty-engine`에서 createRng·TimePreset·조사 도우미를 부른다. `@game/core`로 옮긴 뒤 마이티 엔진의 다시 내보내기를 지운다. 윷·은하·민화투 엔진은 시험만 남아 마이티 엔진 의존을 두었다.
- **chunks 폴더 전체가 10.8MB → 13.0MB(원본)로 늘었다**: 동적 경계가 늘며 같은 모듈이 여러 묶음에 겹쳐 들어간 것으로 보인다. 첫 로딩에는 들지 않지만, 겹친 모듈을 찾아 공통 묶음으로 모을 수 있는지 본다.
- **/stardraw 438KB**: `@noble/curves`·`hash-wasm`·`@noble/hashes`가 첫 로딩에 든다. 서명 검사·작업 증명을 쓰는 화면에서만 부르게 나눌 수 있는지 본다.
- **공통 화면 조각이 마이티 설정을 부른다**: LessonPlayer 등이 `game/settings.ts`(마이티 규칙·카드 테마)를 불러, 판 게임 배우기 묶음에도 카드 그림이 실린다. 효과음·속도·이름 같은 사이트 공통 설정을 따로 떼면 줄어든다.
