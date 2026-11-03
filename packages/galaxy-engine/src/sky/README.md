# 은하 한 바퀴 별 자료

판 위 별 24개를 어느 별자리로 채울지(「하늘」)와 그 별의 실제 값이다(docs/48 5-7·5-9). 엔진과 화면은 이 파일들만 읽는다. 손으로 고치지 않고 스크립트로 다시 만든다.

| 파일 | 내용 |
|---|---|
| `constellations.json` | 별자리 후보 47개(`GalaxyConstellation[]`, 약어 차례). IAU 이름이 있는 별이 둘 이상인 별자리이고, 별은 밝은 순으로 셋까지. 「내가 고른 하늘」이 고르는 목록 |
| `seasons.json` | 사계절 하늘(기본). docs/48 2-1 판 배치와 5-8의 별 그대로 |
| `zodiac.json` | 황도 12궁. 양자리부터 해가 지나는 차례, 별자리마다 이름 있는 가장 밝은 별 둘 |
| `south.json` | 남쪽 하늘. 남십자·센타우루스·용골·돛·에리다누스·공작·두루미·궁수 가운데 이름 별이 셋 이상인 것, 모자라면 가운데 적위 −25° 아래 별자리에서 합친 밝기 순으로 채움 |
| `summer.json` · `autumn.json` · `winter.json` | 한 계절 하늘. 그 계절 별자리 가운데 서울에서 뜨는(적위 −45° 위) 이름 별이 셋 이상인 것을 합친 밝기 순으로 여덟 |

하늘 파일 모양은 docs/48 5-9의 `GalaxySky`(`id`, `ko`, `constellations`: 약어 목록, 판 차례)에 **`board`를 더한 것**이다. `board`는 `constellations`와 같은 차례의 `GalaxyConstellation[]`이고, 별자리마다 판 위 별(판 칸 순서)·선·흐린 점이 들어 있어 하늘 파일 하나만 읽으면 판을 만들 수 있다. 같은 별자리라도 하늘마다 고른 별이 다를 수 있어서다(사계절 하늘의 페가수스는 사각형의 마르카브·셰아트·알게니브, 후보 목록과 가을 하늘은 가장 밝은 에니프·셰아트·마르카브).

## 다시 만들기

```sh
node packages/galaxy-engine/scripts/build-sky.mjs ~/personal/projects/star.byb.kr
pnpm exec biome format --write packages/galaxy-engine/src/sky/*.json
```

star.byb.kr 저장소는 읽기만 한다. 스크립트는 끝에서 스스로 검사하고(하늘마다 별 24개, 하늘 안 별 id 겹침 없음, 별자리마다 별 수 같음, 모든 필드 있음, 온도 100 단위), 하나라도 어긋나면 파일을 쓰지 않고 멈춘다. 같은 입력이면 늘 같은 파일이 나온다. 돌리면 아래 「밸런스용 숫자」 표와 사계절 하늘 합친 밝기를 찍는다.

## 출처와 라이선스

| 자료 | 출처 | 라이선스·조건 | 쓰는 곳 |
|---|---|---|---|
| 위치·등급·온도·별자리·바이어 부호 | Hoffleit, D. & Warren, W. H. Jr.(1991), The Bright Star Catalogue, 5th Revised Ed.(Yale Bright Star Catalogue 5판, VizieR V/50)의 요약 `bsc5-short.json`(star.byb.kr `data/database/`) | 공개 천문 목록, 출처 표기 | `ra`·`dec`·`mag`·`k`·`bayer`, 별자리 나누기 |
| 연주 시차·색지수 B−V | 같은 목록 원본 `bsc5.dat`(162~166칸, 110~114칸) | 위와 같음 | 후보 목록에만 있는 별의 `ly`(B−V는 온도가 없을 때만, 지금은 쓰인 별 없음) |
| 판 위 별 거리 | van Leeuwen 2007(Hipparcos 신판 시차) 등 논문 값을 별마다 손으로 옮김(스크립트 `DISTANCE`) | 숫자는 사실 | `ly` |
| 별 영문 이름 | IAU 별 이름 실무단(WGSN) IAU Catalog of Star Names(IAU-CSN, Mamajek 정리), https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt (2022-04-04 판, 2026-11-03에 받음) | **CC BY**(IAU-CSN 머리말, E. Mamajek 정리: 「All IAU-produced products (Images, Videos, Texts) are released under Creative Commons Attribution」). 이름과 번호는 사실이기도 하다. 공식 판은 https://www.iau.org/public/themes/naming_stars/ 를 인용하라고 권함 | HR 번호와 이름만 스크립트의 `IAU` 표로 옮김 |
| 한글 별 이름 | star.byb.kr `src/search/utils/starNames.ts`(리브레 위키 표기 바탕, 소리 나는 대로) | 사실 | `ko`. 이 파일에 없는 IAU 이름 88개는 같은 방식으로 옮겨 스크립트 `KO_EXTRA` 표에 둠 |
| 한글 별자리 이름 | 한국천문연구원 표기(star.byb.kr `buildConstellations.ts` 표, 별 따기 `CON` 표와 같음) | 사실 | 별자리 `ko` |
| 별자리 선 | d3-celestial `constellations.lines.json`(Olaf Frohn, star.byb.kr `build/database/vectors-constellations.json` 경유, 꼭짓점은 BSC 별 위치에 붙음) | BSD 3조항, Copyright (c) 2015, Olaf Frohn(전문은 아래 「d3-celestial 라이선스」) | `lines`, `extra` |

쓰지 않는 것: Hipparcos 목록(CC BY-NC, 비상업 조건), Stellarium 별자리 선(CC BY-SA), 위키백과 글(CC BY-SA).

### d3-celestial 라이선스

별자리 선(`lines`·`extra`)은 d3-celestial 자료에서 왔다. 원본 LICENSE(star.byb.kr `data/database/d3-celestial/LICENSE` 사본) 전문:

```text
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 별 이름

- 영문 이름(`id`)은 IAU 이름을 따른다. BSC5 요약의 옛 이름은 쓰지 않는다(예: HR 6165 Alniyat → Paikauhale, HR 7235 Deneb el Okab → Okab. 바뀐 이름 35개 모두 스크립트가 찍는다).
- IAU 이름이 있어도 BSC5 요약에 별자리가 없는 별(바이어·플램스티드 부호가 없는 어두운 별 6개: Intercrus, Felis, Tonatiuh, La Superba, Alruba, Fuyue)은 뺀다.
- 눈으로는 한 점인 짝별(0.05° 안)은 밝은 쪽만 남긴다: 톨리만(α Cen B)을 빼고 리길 켄타우루스(한글 「알파 센타우리」)만 둔다.
- `KO_EXTRA`의 한글 표기는 이 스크립트에서 새로 옮긴 것이 많다(※ 표시는 starNames.ts가 옛 BSC 이름 열쇠로 이미 적어 둔 것). 한국천문연구원 목록과 대조하지 못했다.

## 온도(`k`)

BSC5 요약의 `K`를 100 단위로 반올림한다. 별 따기(`apps/web/scripts/build-stardraw-sky.mjs`)와 같은 값이다. 이 값은 분광형에서 정한 어림이라 뜨거운 B형 별은 26,000 K처럼 크게 묶인다. `K`가 없으면 색지수 B−V에서 Ballesteros(2012) 식 `4600 × (1 / (0.92 B−V + 1.7) + 1 / (0.92 B−V + 0.62))`으로 계산하지만, 지금 쓰인 별 가운데 그런 별은 없다.

## 거리(`ly`)

**판 위 별(하늘 파일의 `board` 별 104개)은 모두 문헌 값을 손으로 옮긴 표**(스크립트의 `DISTANCE`, HR 번호 → [광년, 출처])로 덮어쓴다(2026-11-04, docs/48 14절 「거리 값」). 엔진(공문 4)과 화면이 같은 값을 쓴다.

- 출처: 대부분 Hipparcos 신판 시차(van Leeuwen 2007, A&A 474, 653)에서 낸 값. 그 밖은 베텔게우스 Joyce 2020, 알키오네 Melis 2014(플레이아데스 성단 VLBI), 데네브 Schiller & Przybilla 2008, 나오스 Howarth & van Leeuwen 2019, 리길 켄타우루스 Kervella 2016, 미람 Gaia DR3. 숫자 하나는 사실이라 옮겼고 Hipparcos 목록 파일 자체는 쓰지 않는다(아래 「쓰지 않는 것」).
- 어림: 10광년 안은 소수 첫째 자리(시리우스 8.6, 리길 켄타우루스 4.4), 100광년 안은 정수, 1,000광년 안은 10 단위, 그 밖은 100 단위.
- 확인하지 못한 별은 `null`로 둔다. 지금은 없다.
- 표에 없는 판 위 별이 생기면(하늘을 바꾸거나 더하면) 스크립트가 멈춘다. 표에 값을 더하고 다시 돌린다.
- 후보 목록(`constellations.json`)에만 있는 별은 표에 있으면 같은 값, 없으면 BSC5 연주 시차 p(각초)에서 `3.26156 / p` 광년이다. 이 값은 Hipparcos 전 측정이라 먼 별에서 크게 어긋난다(리겔은 0.013″ → 250광년). 「내가 고른 하늘」을 열 때 판 위에 오는 별은 표에 더한다.

| BSC5 시차(후보 목록에만 있는 별) | 거리 | 반올림 |
|---|---|---|
| 0.02″ 이상 | 163광년 안 | 10광년 안은 0.1, 100광년 안은 1, 그 밖은 10 단위 |
| 0.005″ ~ 0.02″ | 163 ~ 650광년(어림) | 500광년 안은 50 단위, 그 밖은 100 단위 |
| 0.005″ 아래, 0 이하, 없음 | | `null`(모른다) |

## 계절과 판 차례

- 별자리 `season`은 별자리 가운데(선 꼭짓점의 평균 방향)의 적경으로 정한다: 겨울 3~9시, 봄 9~15시, 여름 15~21시, 가을 21~3시. 가운데가 서울(북위 37.6°)에서 뜨지 않으면(적위 −52.4° 아래) `null`(용골·남십자).
- 별자리 안 칸 순서: 별 셋이면 가장 밝은 별을 가운데(둘째, 첫째, 셋째), 둘이면 밝은 순. 등급이 같으면 HR 번호가 작은 별이 앞(안드로메다의 알페라츠·미라크는 둘 다 2.06).
- 판 차례: 사계절 하늘은 docs/48 2-1 표, 황도 12궁은 양자리부터, 나머지는 별자리 가운데 적경 차례로 별자리 사이가 가장 크게 빈 곳에서 시작한다.

## 빠진 하늘

- **봄 하늘**: 봄 별자리 가운데 서울에서 뜨는 이름 별이 셋 이상인 것이 여섯뿐이다(목동·큰곰·처녀·사자·까마귀·바다뱀). 센타우루스·돛은 가운데가 봄 적경이지만 이름 별 대부분(리길 켄타우루스·하다르, 알세피나·마르케브)이 서울에서 뜨지 않는다. 게자리는 적경 8.6시라 겨울로 나뉜다. 이름 별이 둘인 사냥개자리 등을 넣으려면 별자리마다 별 수가 같아야 하는 규칙(8 × 3)을 바꿔야 한다.

## 밸런스용 숫자(공문 2·3·4·8)

판 위 별 24개 가운데:

| 하늘 | 별자리 | 1.5등급보다 밝은 별 | 1만 K 넘는 별 | 4,000 K 아래 별 | 500광년 넘는 별 | 거리 모름 |
|---|---|---|---|---|---|---|
| 사계절 하늘 | 페가수스 · 안드로메다 · 오리온 · 큰개 · 사자 · 목동 · 거문고 · 독수리 | 7 | 9 | 3 | 5 | 0 |
| 황도 12궁 | 양 · 황소 · 쌍둥이 · 게 · 사자 · 처녀 · 천칭 · 전갈 · 궁수 · 염소 · 물병 · 물고기 | 5 | 7 | 1 | 4 | 0 |
| 남쪽 하늘 | 용골 · 돛 · 남십자 · 센타우루스 · 전갈 · 궁수 · 두루미 · 에리다누스 | 7 | 10 | 4 | 5 | 0 |
| 여름 하늘 | 작은곰 · 전갈 · 뱀주인 · 용 · 거문고 · 궁수 · 독수리 · 백조 | 4 | 5 | 2 | 6 | 0 |
| 가을 하늘 | 세페우스 · 물병 · 페가수스 · 안드로메다 · 물고기 · 카시오페이아 · 고래 · 양 | 0 | 4 | 4 | 4 | 0 |
| 겨울 하늘 | 페르세우스 · 에리다누스 · 황소 · 오리온 · 마차부 · 큰개 · 쌍둥이 · 고물 | 6 | 7 | 2 | 7 | 0 |

- 가을 하늘은 1.5등급보다 밝은 별이 없어 공문 2를 더미에서 뺀다(docs/48 5-9).
- 500광년 넘는 별은 문헌 거리 표로 센다(사계절 하늘: 베텔게우스·리겔·웨젠·술라팟·셸리악).

## 그 밖에

- 판 위에 올 수 있는 별 가운데 자기 별자리 선의 꼭짓점이 아닌 별: 스카트(물병), 알게디(염소), 엘쿠루드(비둘기), 알키오네(황소, 플레이아데스). 그림에서는 선 밖에 홀로 뜬다.
- 별마다 짧은 사실 문장은 여기 두지 않는다(웹 단계).
