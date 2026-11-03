// 은하 한 바퀴의 별 자료(별자리 후보와 하늘마다 판 위 별 24개)를 한 번 만들어 고정한다(docs/48 5-7·5-9, G1).
// 엔진과 화면은 이 결과(src/sky/*.json)만 읽는다. 별 목록이나 고르는 규칙을 바꿀 때만 다시 돌린다.
//
//   node packages/galaxy-engine/scripts/build-sky.mjs ~/personal/projects/star.byb.kr
//   pnpm exec biome format --write packages/galaxy-engine/src/sky/*.json
//
// 출처(star.byb.kr 저장소, 읽기만 한다. 라이선스는 src/sky/README.md)
// - data/database/bsc5-short.json: Bright Star Catalogue 5판 요약(VizieR V/50). 위치·등급·온도(K)·별자리·바이어 부호
// - data/database/bsc5.dat: 같은 목록의 원본 줄. 연주 시차(162~166칸)와 색지수 B−V(110~114칸)만 읽는다
// - src/search/utils/starNames.ts: 별의 한글 이름(영문 고유 이름 → 한글)
// - build/database/vectors-constellations.json: 별자리 선(d3-celestial, BSD 3조항). 꼭짓점은 BSC 별 위치에 붙어 있다
// 별 영문 이름은 아래 IAU 표(IAU Catalog of Star Names)를 따른다. BSC5 요약의 이름은 쓰지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("star.byb.kr 저장소 경로를 넘겨라");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../src/sky");

/**
 * IAU 별 이름 실무단(WGSN)이 정한 이름 가운데 HR(BSC5) 번호가 있는 것: HR 번호 → 영문 이름.
 * 출처: IAU Catalog of Star Names(IAU-CSN), https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
 * (2022-04-04 판, 2026-11-03에 받음). 이름과 번호(사실)만 옮겼다.
 */
const IAU = {
  15: "Alpheratz",
  21: "Caph",
  39: "Algenib",
  99: "Ankaa",
  153: "Fulu",
  168: "Schedar",
  188: "Diphda",
  219: "Achird",
  265: "Castula",
  337: "Mirach",
  338: "Wurren",
  361: "Revati",
  390: "Adhil",
  403: "Ruchbah",
  424: "Polaris",
  437: "Alpherg",
  458: "Titawin",
  464: "Nembus",
  472: "Achernar",
  510: "Torcular",
  539: "Baten Kaitos",
  542: "Segin",
  544: "Mothallah",
  546: "Mesarthim",
  553: "Sheratan",
  596: "Alrescha",
  603: "Almach",
  617: "Hamal",
  681: "Mira",
  804: "Kaffaljidhma",
  824: "Lilii Borea",
  834: "Miram",
  838: "Bharani",
  850: "Angetenar",
  874: "Azha",
  897: "Acamar",
  911: "Menkar",
  936: "Algol",
  941: "Misam",
  951: "Botein",
  963: "Dalim",
  984: "Zibal",
  1017: "Mirfak",
  1084: "Ran",
  1131: "Atik",
  1136: "Rana",
  1140: "Celaeno",
  1142: "Electra",
  1145: "Taygeta",
  1149: "Maia",
  1151: "Asterope",
  1156: "Merope",
  1165: "Alcyone",
  1178: "Atlas",
  1180: "Pleione",
  1228: "Menkib",
  1231: "Zaurak",
  1298: "Beid",
  1325: "Keid",
  1346: "Prima Hyadum",
  1373: "Secunda Hyadum",
  1393: "Beemim",
  1409: "Ain",
  1412: "Chamukuy",
  1457: "Aldebaran",
  1464: "Theemin",
  1481: "Sceptrum",
  1543: "Tabit",
  1577: "Hassaleh",
  1605: "Almaaz",
  1612: "Saclateni",
  1641: "Haedus",
  1666: "Cursa",
  1708: "Capella",
  1713: "Rigel",
  1790: "Bellatrix",
  1791: "Elnath",
  1829: "Nihal",
  1852: "Mintaka",
  1865: "Arneb",
  1879: "Meissa",
  1899: "Hatysa",
  1903: "Alnilam",
  1910: "Tianguan",
  1948: "Alnitak",
  1956: "Phact",
  2004: "Saiph",
  2040: "Wazn",
  2061: "Betelgeuse",
  2088: "Menkalinan",
  2095: "Mahasim",
  2177: "Elkurud",
  2216: "Propus",
  2282: "Furud",
  2286: "Tejat",
  2294: "Mirzam",
  2326: "Canopus",
  2421: "Alhena",
  2473: "Mebsuta",
  2484: "Alzirr",
  2491: "Sirius",
  2618: "Adhara",
  2646: "Nganurganity",
  2650: "Mekbuda",
  2657: "Muliphein",
  2693: "Wezen",
  2777: "Wasat",
  2827: "Aludra",
  2845: "Gomeisa",
  2891: "Castor",
  2930: "Jishui",
  2943: "Procyon",
  2990: "Pollux",
  3045: "Azmidi",
  3165: "Naos",
  3185: "Tureis",
  3208: "Tegmine",
  3249: "Tarf",
  3268: "Piautos",
  3275: "Alsciaukat",
  3307: "Avior",
  3323: "Muscida",
  3418: "Minchir",
  3429: "Meleph",
  3449: "Asellus Borealis",
  3461: "Asellus Australis",
  3482: "Ashlesha",
  3485: "Alsephina",
  3522: "Copernicus",
  3569: "Talitha",
  3572: "Acubens",
  3594: "Alkaphrah",
  3627: "Nahn",
  3634: "Suhail",
  3685: "Miaplacidus",
  3699: "Aspidiske",
  3734: "Markeb",
  3743: "Intercrus",
  3748: "Alphard",
  3773: "Alterf",
  3845: "Ukdah",
  3852: "Subra",
  3903: "Zhang",
  3905: "Rasalas",
  3923: "Felis",
  3982: "Regulus",
  4031: "Adhafera",
  4033: "Tania Borealis",
  4057: "Algieba",
  4069: "Tania Australis",
  4247: "Praecipua",
  4277: "Chalawan",
  4287: "Alkes",
  4295: "Merak",
  4301: "Dubhe",
  4357: "Zosma",
  4359: "Chertan",
  4375: "Alula Australis",
  4377: "Alula Borealis",
  4434: "Giausar",
  4518: "Taiyangshou",
  4534: "Denebola",
  4540: "Zavijava",
  4554: "Phecda",
  4609: "Tonatiuh",
  4623: "Alchiba",
  4656: "Imai",
  4660: "Megrez",
  4662: "Gienah",
  4689: "Zaniah",
  4700: "Ginan",
  4730: "Acrux",
  4757: "Algorab",
  4763: "Gacrux",
  4785: "Chara",
  4786: "Kraz",
  4825: "Porrima",
  4846: "La Superba",
  4853: "Mimosa",
  4863: "Tianyi",
  4905: "Alioth",
  4910: "Minelauva",
  4915: "Cor Caroli",
  4916: "Taiyi",
  4932: "Vindemiatrix",
  4968: "Diadem",
  5054: "Mizar",
  5056: "Spica",
  5062: "Alcor",
  5107: "Heze",
  5191: "Alkaid",
  5235: "Muphrid",
  5267: "Hadar",
  5288: "Menkent",
  5291: "Thuban",
  5315: "Kang",
  5338: "Syrma",
  5340: "Arcturus",
  5351: "Xuange",
  5359: "Khambalia",
  5409: "Elgafar",
  5435: "Seginus",
  5459: "Rigil Kentaurus",
  5460: "Toliman",
  5506: "Izar",
  5531: "Zubenelgenubi",
  5533: "Merga",
  5563: "Kochab",
  5602: "Nekkar",
  5603: "Brachium",
  5685: "Zubeneschamali",
  5733: "Alkalurops",
  5735: "Pherkad",
  5744: "Edasich",
  5747: "Nusakan",
  5787: "Zubenelhakrabi",
  5793: "Alphecca",
  5854: "Unukalhai",
  5879: "Gudja",
  5928: "Iklil",
  5944: "Fang",
  5953: "Dschubba",
  5984: "Acrab",
  6008: "Marsic",
  6027: "Jabbah",
  6056: "Yed Prior",
  6075: "Yed Posterior",
  6084: "Alniyat",
  6117: "Cujam",
  6132: "Athebyne",
  6134: "Antares",
  6148: "Kornephoros",
  6149: "Marfik",
  6165: "Paikauhale",
  6217: "Atria",
  6241: "Larawag",
  6247: "Xamidimura",
  6252: "Pipirima",
  6370: "Alrakis",
  6378: "Sabik",
  6396: "Aldhibah",
  6402: "Guniibuu",
  6406: "Rasalgethi",
  6410: "Sarin",
  6508: "Lesath",
  6526: "Maasym",
  6527: "Shaula",
  6536: "Rastaban",
  6553: "Sargas",
  6556: "Rasalhague",
  6585: "Cervantes",
  6603: "Cebalrai",
  6618: "Alruba",
  6630: "Fuyue",
  6636: "Dziban",
  6688: "Grumium",
  6705: "Eltanin",
  6746: "Alnasl",
  6789: "Yildun",
  6812: "Polis",
  6859: "Kaus Media",
  6879: "Kaus Australis",
  6913: "Kaus Borealis",
  6945: "Fafnir",
  7001: "Vega",
  7106: "Sheliak",
  7116: "Ainalrami",
  7121: "Nunki",
  7141: "Alya",
  7178: "Sulafat",
  7194: "Ascella",
  7228: "Polaris Australis",
  7235: "Okab",
  7254: "Meridiana",
  7264: "Albaldah",
  7298: "Aladfar",
  7310: "Altais",
  7337: "Arkab Prior",
  7343: "Arkab Posterior",
  7348: "Rukbat",
  7405: "Anser",
  7417: "Albireo",
  7462: "Alsafi",
  7479: "Sham",
  7525: "Tarazed",
  7528: "Fawaris",
  7557: "Altair",
  7595: "Libertas",
  7597: "Terebellum",
  7602: "Alshain",
  7754: "Algedi",
  7773: "Alshat",
  7776: "Dabih",
  7790: "Peacock",
  7796: "Sadr",
  7852: "Aldulfin",
  7882: "Rotanev",
  7906: "Sualocin",
  7924: "Deneb",
  7949: "Aljanah",
  7950: "Albali",
  8030: "Musica",
  8131: "Kitalpha",
  8162: "Alderamin",
  8232: "Sadalsuud",
  8238: "Alfirk",
  8264: "Bunda",
  8278: "Nashira",
  8301: "Azelfafage",
  8308: "Enif",
  8322: "Deneb Algedi",
  8353: "Aldhanab",
  8414: "Sadalmelik",
  8417: "Kurhah",
  8425: "Alnair",
  8450: "Biham",
  8499: "Ancha",
  8518: "Sadachbia",
  8610: "Situla",
  8634: "Homam",
  8636: "Tiaki",
  8650: "Matar",
  8684: "Sadalbari",
  8709: "Skat",
  8728: "Fomalhaut",
  8729: "Helvetios",
  8773: "Fumalsamakah",
  8775: "Scheat",
  8781: "Markab",
  8880: "Salm",
  8905: "Alkarab",
  8930: "Veritate",
  8974: "Errai",
};

/**
 * 별자리 약어 → 한글 이름(한국천문연구원 표기). star.byb.kr의 별자리 표(buildConstellations.ts)와 같고,
 * 선 자료의 한글 이름을 이 표로 약어로 되돌리므로 하나라도 다르면 멈춘다.
 */
const CON = {
  And: "안드로메다자리",
  Ant: "공기펌프자리",
  Aps: "극락조자리",
  Aqr: "물병자리",
  Aql: "독수리자리",
  Ara: "제단자리",
  Ari: "양자리",
  Aur: "마차부자리",
  Boo: "목동자리",
  Cae: "조각칼자리",
  Cam: "기린자리",
  Cnc: "게자리",
  CVn: "사냥개자리",
  CMa: "큰개자리",
  CMi: "작은개자리",
  Cap: "염소자리",
  Car: "용골자리",
  Cas: "카시오페이아자리",
  Cen: "센타우루스자리",
  Cep: "세페우스자리",
  Cet: "고래자리",
  Cha: "카멜레온자리",
  Cir: "컴퍼스자리",
  Col: "비둘기자리",
  Com: "머리털자리",
  CrA: "남쪽왕관자리",
  CrB: "북쪽왕관자리",
  Crv: "까마귀자리",
  Crt: "컵자리",
  Cru: "남십자자리",
  Cyg: "백조자리",
  Del: "돌고래자리",
  Dor: "황새치자리",
  Dra: "용자리",
  Equ: "조랑말자리",
  Eri: "에리다누스자리",
  For: "화로자리",
  Gem: "쌍둥이자리",
  Gru: "두루미자리",
  Her: "헤르쿨레스자리",
  Hor: "시계자리",
  Hya: "바다뱀자리",
  Hyi: "물뱀자리",
  Ind: "인디언자리",
  Lac: "도마뱀자리",
  Leo: "사자자리",
  LMi: "작은사자자리",
  Lep: "토끼자리",
  Lib: "천칭자리",
  Lup: "이리자리",
  Lyn: "살쾡이자리",
  Lyr: "거문고자리",
  Men: "테이블산자리",
  Mic: "현미경자리",
  Mon: "외뿔소자리",
  Mus: "파리자리",
  Nor: "직각자자리",
  Oct: "팔분의자리",
  Oph: "뱀주인자리",
  Ori: "오리온자리",
  Pav: "공작자리",
  Peg: "페가수스자리",
  Per: "페르세우스자리",
  Phe: "불사조자리",
  Pic: "화가자리",
  Psc: "물고기자리",
  PsA: "남쪽물고기자리",
  Pup: "고물자리",
  Pyx: "나침반자리",
  Ret: "그물자리",
  Sge: "화살자리",
  Sgr: "궁수자리",
  Sco: "전갈자리",
  Scl: "조각가자리",
  Sct: "방패자리",
  Ser: "뱀자리",
  Sex: "육분의자리",
  Tau: "황소자리",
  Tel: "망원경자리",
  Tri: "삼각형자리",
  TrA: "남쪽삼각형자리",
  Tuc: "큰부리새자리",
  UMa: "큰곰자리",
  UMi: "작은곰자리",
  Vel: "돛자리",
  Vir: "처녀자리",
  Vol: "날치자리",
  Vul: "여우자리",
};

// 1. 별 목록: IAU 이름이 있고 한글 이름이 있는 BSC5 별
const catalog = JSON.parse(
  readFileSync(join(root, "data/database/bsc5-short.json"), "utf8"),
);
/** HR 번호 → bsc5.dat 원본 줄 */
const rawRow = new Map();
for (const row of readFileSync(
  join(root, "data/database/bsc5.dat"),
  "utf8",
).split("\n")) {
  const hr = Number(row.slice(0, 4));
  if (hr) rawRow.set(hr, row);
}
const namesSrc = readFileSync(
  join(root, "src/search/utils/starNames.ts"),
  "utf8",
);
const korean = {};
for (const m of namesSrc.matchAll(
  /^\s*(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/gm,
)) {
  korean[m[1] ?? m[2]] = m[3];
}
/**
 * starNames.ts에 없는 IAU 이름의 한글 표기. starNames.ts와 같은 방식(라틴·아랍어 이름은 소리 나는 대로,
 * 중국 이름은 중국어 표기법, 붙은 단어는 띄어 쓰기)으로 옮겼다.
 * ※ 표시는 starNames.ts가 옛 BSC 이름 열쇠로 이미 적어 둔 한글을 그대로 가져온 것이다(예: "Deneb el Okab" → 오카브).
 */
const KO_EXTRA = {
  Fulu: "푸루",
  Castula: "카스툴라",
  Wurren: "우렌",
  Revati: "레바티",
  Alpherg: "알페르그",
  Titawin: "티타윈",
  Torcular: "토르쿨라", // ※
  "Lilii Borea": "릴리 보레아",
  Bharani: "바라니",
  Dalim: "달림",
  Celaeno: "켈라이노",
  Asterope: "아스테로페",
  Pleione: "플레이오네",
  "Prima Hyadum": "프리마 히아둠", // ※
  "Secunda Hyadum": "세쿤다 히아둠", // ※
  Beemim: "비밈",
  Chamukuy: "차무쿠이",
  Hassaleh: "하살레",
  Almaaz: "알마즈",
  Saclateni: "사클라테니",
  Hatysa: "하티사",
  Tianguan: "톈관", // ※
  Elkurud: "엘쿠루드",
  Tejat: "테잣", // ※
  Alzirr: "알지르", // ※
  Nganurganity: "응가누르가니티",
  Jishui: "지수이",
  Azmidi: "아즈미디", // ※
  Tegmine: "테그미네",
  Tarf: "타르프",
  Piautos: "피아우토스",
  Meleph: "멜레프",
  Ashlesha: "아슐레샤",
  Alsephina: "알세피나",
  Copernicus: "코페르니쿠스",
  Alkaphrah: "알카프라흐", // ※
  Nahn: "난",
  Markeb: "마르케브",
  Ukdah: "우크다",
  Zhang: "장",
  Chalawan: "찰라완",
  Giausar: "기아우사르",
  Taiyangshou: "타이양서우",
  Imai: "이마이",
  Ginan: "기난",
  Tianyi: "톈이",
  Minelauva: "미넬라우바",
  "Cor Caroli": "코르 카롤리",
  Taiyi: "타이이",
  Diadem: "디아뎀",
  Kang: "캉",
  Xuange: "쉬안거",
  Khambalia: "캄발리아",
  Elgafar: "엘가파르",
  Toliman: "톨리만",
  Merga: "메르가",
  Zubenelhakrabi: "주벤엘하크라비",
  Gudja: "구드자",
  Iklil: "이클릴",
  Fang: "팡",
  Marsic: "마르식",
  Cujam: "쿠잠", // ※
  Athebyne: "아테비네",
  Paikauhale: "파이카우할레",
  Larawag: "라라와그",
  Xamidimura: "사미디무라",
  Pipirima: "피피리마",
  Alrakis: "알라키스",
  Aldhibah: "알디바흐", // ※
  Guniibuu: "구니부",
  Cervantes: "세르반테스",
  Dziban: "지반", // ※
  Polis: "폴리스",
  Ainalrami: "아인알라미",
  "Polaris Australis": "폴라리스 오스트랄리스",
  Okab: "오카브", // ※
  Meridiana: "메리디아나", // ※
  Anser: "안세르", // ※
  Fawaris: "파와리스", // ※
  Aldulfin: "알둘핀", // ※
  Aljanah: "알자나흐",
  Musica: "무시카",
  Situla: "시툴라",
  Tiaki: "티아키",
  Helvetios: "헬베티오스",
  Fumalsamakah: "푸말사마카흐", // ※
  Alkarab: "알카라브",
  Veritate: "베리타테",
};
for (const name of Object.keys(KO_EXTRA)) {
  if (korean[name])
    throw new Error(`KO_EXTRA가 starNames.ts와 겹친다: ${name}`);
  if (!Object.values(IAU).includes(name))
    throw new Error(`KO_EXTRA에 IAU 이름이 아닌 것: ${name}`);
}
const sexagesimal = (text) => {
  const [a, b, c] = text.match(/[\d.]+/g).map(Number);
  return a + b / 60 + c / 3600;
};
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;

/** 색지수 B−V → 표면 온도(K), Ballesteros(2012) 식. BSC5 요약에 온도가 없는 별에만 쓴다 */
const ballesteros = (bv) =>
  4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
/** 표면 온도: BSC5 요약의 K(별 따기와 같은 값)를 100 단위로. 없으면 B−V에서 */
const kelvin = (s, row) => {
  const k = Number(s.K);
  if (k > 0) return Math.round(k / 100) * 100;
  const bv = Number.parseFloat(row.slice(109, 114));
  if (!Number.isFinite(bv)) throw new Error(`온도도 색지수도 없다: HR ${s.HR}`);
  return Math.round(ballesteros(bv) / 100) * 100;
};
/**
 * 거리(광년): BSC5 연주 시차(각초)에서 3.26156 / 시차. 반올림 규칙은 README 「거리」.
 * - 시차 0.02″ 이상(163광년 안): 10광년 안은 0.1, 100광년 안은 1, 그 밖은 10 단위
 * - 시차 0.005″~0.02″(어림): 500광년 안은 50 단위, 그 밖은 100 단위
 * - 시차 0.005″ 아래·0 이하·없음: null(모른다)
 */
const lightYears = (row) => {
  const plx = Number.parseFloat(row.slice(161, 166));
  if (!Number.isFinite(plx) || plx < 0.005) return null;
  const d = 3.26156 / plx;
  if (plx >= 0.02) {
    if (d < 10) return round(d, 1);
    if (d < 100) return Math.round(d);
    return Math.round(d / 10) * 10;
  }
  return d < 500 ? Math.round(d / 50) * 50 : Math.round(d / 100) * 100;
};

/**
 * 판 위 별의 거리(광년): 문헌 값을 손으로 옮긴 표(docs/48 14절 「거리 값」). HR 번호 → [광년, 출처].
 * BSC5 시차는 Hipparcos 전 측정이라 먼 별에서 크게 틀려(리겔 250광년, 실제 약 860광년)
 * 하늘 파일에 놓인 별은 모두 이 표의 값으로 덮어쓴다. 표에 없는 판 위 별이 있으면 스크립트가 멈춘다.
 * - 값: 10광년 안은 소수 첫째 자리, 100광년 안은 정수, 1,000광년 안은 10 단위, 그 밖은 100 단위 어림
 * - 출처: 「van Leeuwen 2007」은 Hipparcos 신판 시차(A&A 474, 653)에서 낸 값, 그 밖은 적은 논문·목록
 * - 확인하지 못한 별은 null(모른다). 지금은 없다
 * 숫자 하나는 사실이라 옮겨도 된다(Hipparcos 목록 파일 자체는 쓰지 않는다, README 「출처」).
 */
const DISTANCE = {
  15: [97, "van Leeuwen 2007"], // Alpheratz
  21: [55, "van Leeuwen 2007"], // Caph
  39: [390, "van Leeuwen 2007"], // Algenib
  168: [230, "van Leeuwen 2007"], // Schedar
  188: [96, "van Leeuwen 2007"], // Diphda
  337: [200, "van Leeuwen 2007"], // Mirach
  403: [99, "van Leeuwen 2007"], // Ruchbah
  424: [430, "van Leeuwen 2007"], // Polaris
  437: [350, "van Leeuwen 2007"], // Alpherg
  472: [140, "van Leeuwen 2007"], // Achernar
  510: [280, "van Leeuwen 2007"], // Torcular
  553: [60, "van Leeuwen 2007"], // Sheratan
  596: [150, "van Leeuwen 2007"], // Alrescha
  603: [350, "van Leeuwen 2007"], // Almach
  617: [66, "van Leeuwen 2007"], // Hamal
  681: [300, "van Leeuwen 2007"], // Mira
  834: [1000, "Gaia DR3 시차 3.27 mas"], // Miram
  838: [170, "van Leeuwen 2007"], // Bharani
  897: [160, "van Leeuwen 2007"], // Acamar
  911: [250, "van Leeuwen 2007"], // Menkar
  936: [90, "van Leeuwen 2007"], // Algol
  1017: [510, "van Leeuwen 2007"], // Mirfak
  1165: [440, "Melis 2014(플레이아데스 성단 VLBI)"], // Alcyone
  1231: [200, "van Leeuwen 2007"], // Zaurak
  1457: [65, "van Leeuwen 2007"], // Aldebaran
  1666: [89, "van Leeuwen 2007"], // Cursa
  1708: [43, "van Leeuwen 2007"], // Capella
  1713: [860, "van Leeuwen 2007"], // Rigel
  1790: [250, "van Leeuwen 2007"], // Bellatrix
  1791: [130, "van Leeuwen 2007"], // Elnath
  2061: [550, "Joyce 2020"], // Betelgeuse
  2088: [81, "van Leeuwen 2007"], // Menkalinan
  2095: [170, "van Leeuwen 2007"], // Mahasim
  2326: [310, "van Leeuwen 2007"], // Canopus
  2421: [110, "van Leeuwen 2007"], // Alhena
  2491: [8.6, "van Leeuwen 2007"], // Sirius
  2618: [430, "van Leeuwen 2007"], // Adhara
  2693: [1600, "van Leeuwen 2007"], // Wezen
  2891: [51, "van Leeuwen 2007"], // Castor
  2990: [34, "van Leeuwen 2007"], // Pollux
  3045: [1200, "van Leeuwen 2007"], // Azmidi
  3165: [1100, "Howarth & van Leeuwen 2019"], // Naos
  3185: [64, "van Leeuwen 2007"], // Tureis
  3249: [290, "van Leeuwen 2007"], // Tarf
  3307: [610, "van Leeuwen 2007"], // Avior
  3461: [130, "van Leeuwen 2007"], // Asellus Australis
  3485: [81, "van Leeuwen 2007"], // Alsephina
  3634: [550, "van Leeuwen 2007"], // Suhail
  3685: [110, "van Leeuwen 2007"], // Miaplacidus
  3734: [570, "van Leeuwen 2007"], // Markeb
  3982: [79, "van Leeuwen 2007"], // Regulus
  4057: [130, "van Leeuwen 2007"], // Algieba
  4534: [36, "van Leeuwen 2007"], // Denebola
  4730: [320, "van Leeuwen 2007"], // Acrux
  4763: [89, "van Leeuwen 2007"], // Gacrux
  4853: [280, "van Leeuwen 2007"], // Mimosa
  4932: [110, "van Leeuwen 2007"], // Vindemiatrix
  5056: [250, "van Leeuwen 2007"], // Spica
  5235: [37, "van Leeuwen 2007"], // Muphrid
  5267: [390, "van Leeuwen 2007"], // Hadar
  5288: [59, "van Leeuwen 2007"], // Menkent
  5340: [37, "van Leeuwen 2007"], // Arcturus
  5459: [4.4, "Kervella 2016"], // Rigil Kentaurus
  5506: [200, "van Leeuwen 2007"], // Izar
  5531: [76, "van Leeuwen 2007"], // Zubenelgenubi
  5563: [130, "van Leeuwen 2007"], // Kochab
  5685: [190, "van Leeuwen 2007"], // Zubeneschamali
  5735: [490, "van Leeuwen 2007"], // Pherkad
  6056: [170, "van Leeuwen 2007"], // Yed Prior
  6132: [92, "van Leeuwen 2007"], // Athebyne
  6134: [550, "van Leeuwen 2007"], // Antares
  6378: [88, "van Leeuwen 2007"], // Sabik
  6527: [570, "van Leeuwen 2007"], // Shaula
  6536: [380, "van Leeuwen 2007"], // Rastaban
  6553: [300, "van Leeuwen 2007"], // Sargas
  6556: [49, "van Leeuwen 2007"], // Rasalhague
  6705: [150, "van Leeuwen 2007"], // Eltanin
  6879: [140, "van Leeuwen 2007"], // Kaus Australis
  7001: [25, "van Leeuwen 2007"], // Vega
  7106: [960, "van Leeuwen 2007"], // Sheliak
  7121: [230, "van Leeuwen 2007"], // Nunki
  7178: [620, "van Leeuwen 2007"], // Sulafat
  7194: [89, "van Leeuwen 2007"], // Ascella
  7235: [83, "van Leeuwen 2007"], // Okab
  7525: [400, "van Leeuwen 2007"], // Tarazed
  7557: [17, "van Leeuwen 2007"], // Altair
  7602: [45, "van Leeuwen 2007"], // Alshain
  7776: [330, "van Leeuwen 2007"], // Dabih
  7796: [1800, "van Leeuwen 2007"], // Sadr
  7924: [2600, "Schiller & Przybilla 2008"], // Deneb
  7949: [73, "van Leeuwen 2007"], // Aljanah
  8162: [49, "van Leeuwen 2007"], // Alderamin
  8232: [540, "van Leeuwen 2007"], // Sadalsuud
  8238: [690, "van Leeuwen 2007"], // Alfirk
  8308: [690, "van Leeuwen 2007"], // Enif
  8322: [39, "van Leeuwen 2007"], // Deneb Algedi
  8353: [210, "van Leeuwen 2007"], // Aldhanab
  8414: [520, "van Leeuwen 2007"], // Sadalmelik
  8425: [100, "van Leeuwen 2007"], // Alnair
  8636: [180, "van Leeuwen 2007"], // Tiaki
  8709: [160, "van Leeuwen 2007"], // Skat
  8775: [200, "van Leeuwen 2007"], // Scheat
  8781: [130, "van Leeuwen 2007"], // Markab
  8974: [45, "van Leeuwen 2007"], // Errai
};

const notes = { noKorean: [], noCon: [], renamed: [] };
/** 별자리 약어 → 이름 있는 별(밝은 순) */
const byCon = {};
for (const s of catalog) {
  const hr = Number(s.HR);
  const id = IAU[hr];
  if (!id) continue;
  if (s.N && s.N !== id) notes.renamed.push(`HR ${hr}: ${s.N} → ${id}`);
  if (!s.C || !CON[s.C]) {
    notes.noCon.push(`${id}(HR ${hr})`);
    continue;
  }
  const ko = korean[id] ?? KO_EXTRA[id];
  if (!ko) {
    notes.noKorean.push(`${id}(HR ${hr}, ${s.C})`);
    continue;
  }
  const row = rawRow.get(hr);
  if (!row) throw new Error(`bsc5.dat에 HR ${hr} 줄이 없다`);
  const star = {
    id,
    ko,
    hr,
    bayer: s.B ?? "",
    mag: round(Number(s.V), 2),
    k: kelvin(s, row),
    ly: lightYears(row),
    ra: round(sexagesimal(s.RA) * 15, 3),
    dec: round((s.Dec.trim().startsWith("-") ? -1 : 1) * sexagesimal(s.Dec), 3),
  };
  if (!byCon[s.C]) byCon[s.C] = [];
  byCon[s.C].push(star);
}

// 2. 별자리 선: 원본은 한글 이름 + 단위 벡터 꺾은선. 적경·적위(도, 소수 셋째 자리) 꺾은선으로 바꾼다
const DEG = Math.PI / 180;
const fromRaDec = (ra, dec) => [
  Math.cos(dec * DEG) * Math.cos(ra * DEG),
  Math.cos(dec * DEG) * Math.sin(ra * DEG),
  Math.sin(dec * DEG),
];
const toRaDec = ([x, y, z]) => {
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) / DEG;
  const ra = Math.atan2(y, x) / DEG;
  return [ra < 0 ? ra + 360 : ra, dec];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const abbrOf = Object.fromEntries(
  Object.entries(CON).map(([abbr, ko]) => [ko, abbr]),
);
const lineSrc = JSON.parse(
  readFileSync(
    join(root, "build/database/vectors-constellations.json"),
    "utf8",
  ),
);
/** 별자리 약어 → 꺾은선 목록 */
const linesOf = {};
for (const c of lineSrc) {
  const abbr = abbrOf[c.label];
  if (!abbr)
    throw new Error(`선 자료의 별자리 이름이 CON 표에 없다: ${c.label}`);
  if (!linesOf[abbr]) linesOf[abbr] = [];
  linesOf[abbr].push(
    c.stars.map((v) => {
      const [ra, dec] = toRaDec(v);
      return [round(ra, 3), round(dec, 3)];
    }),
  );
}

/** 선 꼭짓점의 등급: 0.02° 안의 BSC 별(꼭짓점은 원본에서 BSC 별 위치에 붙어 있다) */
const catalogVecs = catalog
  .filter((s) => s.RA && s.Dec && s.V)
  .map((s) => ({
    vec: fromRaDec(
      sexagesimal(s.RA) * 15,
      (s.Dec.trim().startsWith("-") ? -1 : 1) * sexagesimal(s.Dec),
    ),
    mag: round(Number(s.V), 2),
  }));
const NEAR = Math.cos(0.02 * DEG);
// 별자리마다 밝은 순으로 줄 세우고, 눈으로는 한 점인 짝별(0.05° 안, 알파 센타우리 A·B의 톨리만)은 밝은 쪽만 남긴다
const PAIR = Math.cos(0.05 * DEG);
notes.pair = [];
for (const [abbr, list] of Object.entries(byCon)) {
  list.sort((a, b) => a.mag - b.mag || a.hr - b.hr);
  const kept = [];
  for (const s of list) {
    const v = fromRaDec(s.ra, s.dec);
    const twin = kept.find((t) => dot(fromRaDec(t.ra, t.dec), v) > PAIR);
    if (twin) notes.pair.push(`${s.id}(${twin.id}와 한 점)`);
    else kept.push(s);
  }
  byCon[abbr] = kept;
}
const magCache = new Map();
const vertexMag = (ra, dec) => {
  const key = `${ra},${dec}`;
  if (magCache.has(key)) return magCache.get(key);
  const v = fromRaDec(ra, dec);
  let best = null;
  let bestDot = NEAR;
  for (const s of catalogVecs) {
    const d = dot(s.vec, v);
    if (d > bestDot) {
      bestDot = d;
      best = s.mag;
    }
  }
  magCache.set(key, best);
  return best;
};
const unmatched = new Set();
/** 선 위의 다른 별(판 위 별을 뺀 꼭짓점, 겹친 꼭짓점은 하나로) */
const extraOf = (abbr, chosen) => {
  const seen = new Set();
  const out = [];
  for (const line of linesOf[abbr] ?? [])
    for (const [ra, dec] of line) {
      const key = `${ra},${dec}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = fromRaDec(ra, dec);
      if (chosen.some((s) => dot(fromRaDec(s.ra, s.dec), v) > NEAR)) continue;
      const mag = vertexMag(ra, dec);
      if (mag === null) {
        unmatched.add(`${abbr} ${key}`);
        continue;
      }
      out.push({ ra, dec, mag });
    }
  return out;
};
/** 판 위 별 가운데 자기 별자리 선의 꼭짓점이 아닌 별(그림에서 선 밖에 홀로 뜬다) */
const offLine = new Set();
const checkOnLine = (abbr, chosen) => {
  const verts = (linesOf[abbr] ?? []).flat();
  for (const s of chosen) {
    const v = fromRaDec(s.ra, s.dec);
    if (!verts.some(([ra, dec]) => dot(fromRaDec(ra, dec), v) > NEAR))
      offLine.add(`${s.id}(${abbr})`);
  }
};

// 3. 계절: 별자리 가운데(선 꼭짓점의 평균 방향)의 적경으로 저녁 하늘 계절을 정한다.
//    겨울 3~9시, 봄 9~15시, 여름 15~21시, 가을 21~3시. 서울(북위 37.6°)에서 가운데가 뜨지 않으면(적위 −52.4° 아래) null
const centerOf = (abbr) => {
  const pts = (linesOf[abbr] ?? []).flat();
  const src = pts.length ? pts : byCon[abbr].map((s) => [s.ra, s.dec]);
  const sum = [0, 0, 0];
  for (const [ra, dec] of src) {
    const v = fromRaDec(ra, dec);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }
  const n = Math.hypot(...sum);
  const [ra, dec] = toRaDec(sum.map((x) => x / n));
  return { ra, dec };
};
const seasonOf = (abbr) => {
  const { ra, dec } = centerOf(abbr);
  if (dec < -52.4) return null;
  const h = ra / 15;
  if (h >= 3 && h < 9) return "winter";
  if (h >= 9 && h < 15) return "spring";
  if (h >= 15 && h < 21) return "summer";
  return "autumn";
};

/** 합친 밝기 = −2.5 log10(Σ 10^(−0.4 m)) */
const combined = (list) =>
  -2.5 * Math.log10(list.reduce((t, s) => t + 10 ** (-0.4 * s.mag), 0));
/** 판 칸 순서: 별 셋이면 가장 밝은 별을 가운데(둘째, 첫째, 셋째), 둘이면 밝은 순 */
const boardOrder = (list) => {
  const sorted = [...list].sort((a, b) => a.mag - b.mag || a.hr - b.hr);
  return sorted.length === 3 ? [sorted[1], sorted[0], sorted[2]] : sorted;
};
const constellation = (abbr, chosen) => {
  checkOnLine(abbr, chosen);
  return {
    id: abbr,
    ko: CON[abbr],
    season: seasonOf(abbr),
    stars: chosen,
    lines: linesOf[abbr] ?? [],
    extra: extraOf(abbr, chosen),
  };
};

// 4. 별자리 후보: 이름 있는 별이 둘 이상인 별자리. 별은 밝은 순으로 셋까지(내가 고른 하늘이 고르는 목록)
const candidateIds = Object.keys(byCon)
  .filter((abbr) => byCon[abbr].length >= 2)
  .sort();
const candidates = candidateIds.map((abbr) =>
  constellation(abbr, byCon[abbr].slice(0, 3)),
);
const named = (abbr) => byCon[abbr]?.length ?? 0;
const top = (abbr, n) => byCon[abbr].slice(0, n);

// 5. 하늘
/** 적경 차례로 줄 세운다. 별자리 사이가 가장 크게 빈 적경에서 시작한다 */
const byRa = (ids) => {
  const sorted = [...ids].sort((a, b) => centerOf(a).ra - centerOf(b).ra);
  let start = 0;
  let gap = -1;
  sorted.forEach((id, i) => {
    const a = centerOf(id).ra;
    const b = centerOf(sorted[(i + 1) % sorted.length]).ra;
    const g = (((b - a) % 360) + 360) % 360 || 360;
    if (g > gap) {
      gap = g;
      start = (i + 1) % sorted.length;
    }
  });
  return [...sorted.slice(start), ...sorted.slice(0, start)];
};
/** 하늘 하나: 판 차례 별자리 목록과 별자리마다 판 위 별 */
const sky = (id, ko, order, pick) => ({
  id,
  ko,
  constellations: order,
  board: order.map((abbr) => constellation(abbr, boardOrder(pick(abbr)))),
});
const skies = [];
const dropped = [];

// 사계절 하늘(기본): docs/48 2-1 판 배치와 5-8 별을 그대로
const SEASONS = {
  Peg: ["Markab", "Scheat", "Algenib"],
  And: ["Alpheratz", "Mirach", "Almach"],
  Ori: ["Rigel", "Betelgeuse", "Bellatrix"],
  CMa: ["Sirius", "Adhara", "Wezen"],
  Leo: ["Regulus", "Algieba", "Denebola"],
  Boo: ["Arcturus", "Izar", "Muphrid"],
  Lyr: ["Vega", "Sulafat", "Sheliak"],
  Aql: ["Altair", "Tarazed", "Alshain"],
};
skies.push(
  sky("seasons", "사계절 하늘", Object.keys(SEASONS), (abbr) =>
    SEASONS[abbr].map((name) => {
      const s = byCon[abbr]?.find((x) => x.id === name);
      if (!s) throw new Error(`사계절 하늘의 별이 없다: ${name}(${abbr})`);
      return s;
    }),
  ),
);

// 황도 12궁: 해가 지나는 차례(양자리부터), 별자리마다 이름 있는 가장 밝은 별 둘
const ZODIAC = [
  "Ari",
  "Tau",
  "Gem",
  "Cnc",
  "Leo",
  "Vir",
  "Lib",
  "Sco",
  "Sgr",
  "Cap",
  "Aqr",
  "Psc",
];
const zodiacShort = ZODIAC.filter((abbr) => named(abbr) < 2);
if (zodiacShort.length)
  dropped.push(["zodiac", `이름 별이 둘보다 적은 별자리: ${zodiacShort}`]);
else skies.push(sky("zodiac", "황도 12궁", ZODIAC, (abbr) => top(abbr, 2)));

// 남쪽 하늘: 아래 차례로 이름 별이 셋 이상인 것을 먼저 넣고, 모자라면 가운데 적위 −25° 아래 별자리에서 합친 밝기 순으로 채운다
const SOUTH_FIRST = ["Cru", "Cen", "Car", "Vel", "Eri", "Pav", "Gru", "Sgr"];
const brightest = (ids) =>
  [...ids].sort(
    (a, b) => combined(top(a, 3)) - combined(top(b, 3)) || (a < b ? -1 : 1),
  );
{
  const chosen = SOUTH_FIRST.filter((abbr) => named(abbr) >= 3);
  const rest = brightest(
    Object.keys(byCon).filter(
      (abbr) =>
        named(abbr) >= 3 && !chosen.includes(abbr) && centerOf(abbr).dec < -25,
    ),
  );
  chosen.push(...rest.slice(0, 8 - chosen.length));
  if (chosen.length < 8)
    dropped.push([
      "south",
      `이름 별 셋 이상인 남쪽 별자리가 ${chosen.length}개`,
    ]);
  else
    skies.push(
      sky("south", "남쪽 하늘", byRa(chosen.slice(0, 8)), (abbr) =>
        top(abbr, 3),
      ),
    );
}

// 한 계절 하늘: 서울 저녁 하늘이라 서울에서 뜨는 별(적위 −45° 위, 별 따기와 같은 기준)만 쓴다.
// 그 계절 별자리 가운데 뜨는 이름 별이 셋 이상인 것을 합친 밝기 순으로 여덟
const SEOUL_MIN_DEC = -45;
const visibleTop = (abbr) =>
  byCon[abbr].filter((s) => s.dec > SEOUL_MIN_DEC).slice(0, 3);
for (const [id, ko] of [
  ["spring", "봄 하늘"],
  ["summer", "여름 하늘"],
  ["autumn", "가을 하늘"],
  ["winter", "겨울 하늘"],
]) {
  const pool = Object.keys(byCon)
    .filter((abbr) => seasonOf(abbr) === id && visibleTop(abbr).length === 3)
    .sort(
      (a, b) =>
        combined(visibleTop(a)) - combined(visibleTop(b)) || (a < b ? -1 : 1),
    );
  if (pool.length < 8) {
    dropped.push([
      id,
      `서울에서 뜨는 이름 별이 셋 이상인 ${ko} 별자리가 ${pool.length}개(${pool.join(", ")})`,
    ]);
    continue;
  }
  skies.push(sky(id, ko, byRa(pool.slice(0, 8)), visibleTop));
}

// 5-1. 거리 덮어쓰기: 판 위 별은 모두 DISTANCE 표 값으로(표에 없으면 멈춘다).
// 후보 목록에만 있는 별도 표에 있으면 같은 값으로 맞추고, 표에 없으면 BSC5 시차 값을 둔다
const unknownDistance = [];
for (const s of skies)
  for (const c of s.board)
    for (const star of c.stars) {
      const row = DISTANCE[star.hr];
      if (!row)
        throw new Error(`거리 표에 없는 판 위 별: ${star.id}(HR ${star.hr})`);
      star.ly = row[0];
      if (row[0] === null) unknownDistance.push(star.id);
    }
for (const c of candidates)
  for (const star of c.stars)
    if (DISTANCE[star.hr]) star.ly = DISTANCE[star.hr][0];

// 6. 스스로 검사: 하나라도 어긋나면 파일을 쓰지 않고 멈춘다
const fail = (msg) => {
  throw new Error(`검사 실패: ${msg}`);
};
const checkStar = (s, where) => {
  for (const key of ["id", "ko", "bayer"])
    if (typeof s[key] !== "string") fail(`${where} ${s.id}.${key}`);
  if (!s.id || !s.ko) fail(`${where} 이름 없음 ${JSON.stringify(s)}`);
  for (const key of ["hr", "mag", "k", "ra", "dec"])
    if (!Number.isFinite(s[key])) fail(`${where} ${s.id}.${key}`);
  if (!(s.ly === null || (Number.isFinite(s.ly) && s.ly > 0)))
    fail(`${where} ${s.id}.ly`);
  if (s.k % 100 !== 0) fail(`${where} ${s.id}.k가 100 단위가 아니다`);
  if (Object.keys(s).length !== 9) fail(`${where} ${s.id} 필드 수`);
};
const checkConstellation = (c, where) => {
  if (!CON[c.id] || c.ko !== CON[c.id]) fail(`${where} ${c.id} 이름`);
  if (![null, "spring", "summer", "autumn", "winter"].includes(c.season))
    fail(`${where} ${c.id}.season`);
  if (!Array.isArray(c.stars) || c.stars.length < 2 || c.stars.length > 3)
    fail(`${where} ${c.id} 별 수 ${c.stars?.length}`);
  for (const s of c.stars) checkStar(s, `${where} ${c.id}`);
  if (!Array.isArray(c.lines) || !c.lines.length)
    fail(`${where} ${c.id} 선 없음`);
  for (const line of c.lines)
    for (const p of line)
      if (p.length !== 2 || !p.every(Number.isFinite))
        fail(`${where} ${c.id} 선 꼭짓점`);
  for (const e of c.extra)
    if (
      ![e.ra, e.dec, e.mag].every(Number.isFinite) ||
      Object.keys(e).length !== 3
    )
      fail(`${where} ${c.id} extra`);
  if (Object.keys(c).length !== 6) fail(`${where} ${c.id} 필드 수`);
};
for (const c of candidates) checkConstellation(c, "후보");
if (
  new Set(candidates.flatMap((c) => c.stars.map((s) => s.id))).size !==
  candidates.reduce((t, c) => t + c.stars.length, 0)
)
  fail("후보 별 id 겹침");
for (const s of skies) {
  if (!s.id || !s.ko) fail(`하늘 이름 ${s.id}`);
  const ids = s.board.flatMap((c) => c.stars.map((x) => x.id));
  if (ids.length !== 24) fail(`${s.id} 별 ${ids.length}개`);
  if (new Set(ids).size !== 24) fail(`${s.id} 별 id 겹침`);
  if (new Set(s.board.map((c) => c.stars.length)).size !== 1)
    fail(`${s.id} 별자리마다 별 수가 다르다`);
  if (new Set(s.constellations).size !== s.constellations.length)
    fail(`${s.id} 별자리 겹침`);
  if (s.constellations.join() !== s.board.map((c) => c.id).join())
    fail(`${s.id} constellations와 board 차례가 다르다`);
  for (const c of s.board) checkConstellation(c, s.id);
  if (Object.keys(s).length !== 4) fail(`${s.id} 필드 수`);
}

// 7. 쓰기
const write = (name, data) =>
  writeFileSync(join(outDir, name), `${JSON.stringify(data)}\n`);
write("constellations.json", candidates);
for (const s of skies) write(`${s.id}.json`, s);

// 8. 알림: README 표와 docs/48을 맞출 때 보는 값
const count = (list, f) => list.filter(f).length;
console.log(
  `IAU 이름 별 ${Object.values(byCon).flat().length}개, 별자리 후보 ${candidates.length}개`,
);
console.log(`짝별이라 뺀 별: ${notes.pair.join(", ") || "없음"}`);
console.log(
  `| 하늘 | 별자리 | 1.5등급보다 밝은 별 | 1만 K 넘는 별 | 4,000 K 아래 별 | 500광년 넘는 별 | 4,000~7,500 K 별 | 거리 모름 |`,
);
console.log("|---|---|---|---|---|---|---|---|");
for (const s of skies) {
  const list = s.board.flatMap((c) => c.stars);
  console.log(
    `| ${s.ko} | ${s.board.map((c) => c.ko).join(" · ")} | ${count(list, (x) => x.mag < 1.5)} | ${count(list, (x) => x.k > 10000)} | ${count(list, (x) => x.k < 4000)} | ${count(list, (x) => x.ly !== null && x.ly > 500)} | ${count(list, (x) => x.k >= 4000 && x.k <= 7500)} | ${count(list, (x) => x.ly === null)} |`,
  );
}
console.log("\n합친 밝기(사계절 하늘, 밝은 순)");
for (const c of [...skies[0].board].sort(
  (a, b) => combined(a.stars) - combined(b.stars),
))
  console.log(
    `${c.ko} ${combined(c.stars).toFixed(2)}: ${c.stars.map((s) => `${s.ko}(${s.id}, ${s.bayer}) ${s.mag} ${s.k}K ${s.ly ?? "?"}ly`).join(", ")}`,
  );
for (const [id, why] of dropped) console.log(`빠진 하늘 ${id}: ${why}`);
console.log(
  `거리를 모르는 판 위 별: ${[...new Set(unknownDistance)].join(", ") || "없음"}`,
);
console.log(
  `\n한글 이름이 없어 뺀 IAU 별 ${notes.noKorean.length}개: ${notes.noKorean.join(", ")}`,
);
console.log(`별자리가 없는 IAU 별: ${notes.noCon.join(", ") || "없음"}`);
console.log(
  `BSC5 요약 이름과 IAU 이름이 다른 별: ${notes.renamed.join(", ") || "없음"}`,
);
console.log(
  `판 위 별인데 선 꼭짓점이 아닌 별: ${[...offLine].join(", ") || "없음"}`,
);
console.log(`등급을 못 찾은 선 꼭짓점 ${unmatched.size}개`);
