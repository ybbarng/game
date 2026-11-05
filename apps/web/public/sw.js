// 오프라인에서도 열리게 하는 서비스 워커.
// 게임은 모두 브라우저에서 돌기 때문에 한 번 받은 파일만 있으면 인터넷 없이 할 수 있다.
// - 이름에 내용 해시가 붙은 빌드 결과물(/_next/static/): 저장해 둔 것 먼저, 없으면 받아서 저장.
//   내용이 바뀌면 이름도 바뀌므로 저장본이 옛 코드일 수 없다
// - 그 밖의 같은 출처 파일(페이지 HTML, 화면 이동 때 받는 RSC 묶음 *.txt, 그림·아이콘·글꼴): 네트워크 먼저,
//   안 되면 저장해 둔 것. 이름이 고정이라 저장본을 먼저 주면 새 배포를 영영 못 받는다
// - 웹 워커 스크립트: 저장본을 주더라도 새 응답으로 감싸서 준다(아래 `forWorker`)
//
// 판 이름 기록
// - v1 → v2: TURN 계정 주소를 빼기 전 판(v1)이 계정을 저장해 두었을 수 있어 비웠다.
// - v2 → v3(2026-11-05): 워커 진입 파일이 처음 저장된 청크 목록을 계속 주어 새 배포 뒤에도 워커가 옛 코드로 돌았다
//   (큐브 첫 화면 연출의 옛 단계 이름, 마이티·하트 컴퓨터 워커가 큐브 워커 코드를 받음). 그 저장본을 비운다
const CACHE = "mighty-v3";
/**
 * 저장하면 안 되는 주소: 요청마다 새로 받는 시간 제한 TURN 계정, 배포된 판 번호(저장하면 새 배포를 영영 모른다,
 * 별 따기 「조용히 새 화면으로」)와 화면 코드 해시 목록(검증 페이지가 옛 목록을 보게 된다)
 */
const NO_STORE = new Set([
  "/turn-credentials",
  "/version.json",
  "/build-hashes.json",
]);
/**
 * 저장하면 안 되는 주소 앞머리.
 * - 계속 열려 있는 신호 구독(SSE)과 올리기. 저장하면 끝난 응답을 다시 돌려준다
 * - 하늘의 별 따기 서버(회차 상태·장부·확인 전달). 저장하면 지난 회차를 계속 보여 준다
 */
const NO_STORE_PREFIXES = ["/signal/", "/stardraw-api/"];
/** 이름에 내용 해시가 붙어 저장본을 먼저 줘도 되는 곳 */
const HASHED_PREFIX = "/_next/static/";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * 저장 키: 주소에서 `#` 뒤를 뺀 것. 저장소는 `#` 뒤를 비교하지 않으면서 처음 넣은 요청의 `#` 뒤를 그대로 둔다.
 * 키에 남은 옛 `#` 뒤가 헷갈리지 않게 떼고 넣는다
 */
const keyOf = (url) => `${url.origin}${url.pathname}${url.search}`;

const isWorkerScript = (request) =>
  request.destination === "worker" || request.destination === "sharedworker";

/**
 * 워커 스크립트 응답을 새 응답으로 감싼다. Turbopack 워커는 진입 파일 하나(`turbopack-worker-*.js`, 빌드마다 내용이
 * 같아 이름도 같다)를 모든 워커가 함께 쓰고, 불러올 청크 목록은 주소의 `#params=`로 받는다. 저장해 둔 응답을
 * 그대로 주면 Chrome은 워커 주소를 처음 저장한 요청의 것(`#params=` 포함)으로 잡아, 다음 배포나 다른 워커
 * (큐브 워커, 마이티·하트 컴퓨터 워커)도 처음 저장한 청크 목록을 불러온다(2026-11-05 재현). 새로 만든 응답은
 * 주소가 없어 워커 주소가 이번 요청의 주소가 된다
 */
async function forWorker(response) {
  if (!response.ok) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** 받은 응답을 저장해 두고 그대로 돌려준다 */
function store(key, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(key, copy));
  }
  return response;
}

/** 저장본 먼저, 없으면 받아서 저장(이름에 내용 해시가 붙은 파일) */
async function cacheFirst(request, key) {
  const hit = await caches.match(key);
  return hit ?? store(key, await fetch(request));
}

/** 네트워크 먼저, 안 되면 저장본(이름이 고정인 파일) */
async function networkFirst(request, key) {
  try {
    return store(key, await fetch(request));
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    NO_STORE.has(url.pathname) ||
    NO_STORE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  )
    return;
  const key = keyOf(url);

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, key).catch(() =>
        caches
          .match(keyOf(new URL("/", url)))
          .then((hit) => hit ?? Response.error()),
      ),
    );
    return;
  }

  const answer = url.pathname.startsWith(HASHED_PREFIX)
    ? cacheFirst(request, key)
    : networkFirst(request, key);
  event.respondWith(isWorkerScript(request) ? answer.then(forWorker) : answer);
});
