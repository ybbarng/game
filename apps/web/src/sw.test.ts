import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { beforeEach, describe, expect, it } from "vitest";

/**
 * 서비스 워커(public/sw.js)의 저장 규칙. 브라우저 없이 가짜 저장소·네트워크를 넣어 돌린다.
 * 실제 Chrome에서 새 배포 뒤 워커가 옛 청크를 받던 것(2026-11-05)은 이 규칙이 막는다:
 * 해시 붙은 빌드 결과물만 저장본 먼저, 이름이 고정인 파일은 네트워크 먼저, 워커 스크립트는 새 응답으로 감싸기.
 */

const SOURCE = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const ORIGIN = "https://game.example";

type Handler = (event: unknown) => void;

function load(network: (url: string) => Response | Error) {
  const store = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, Handler>();
  const fetched: string[] = [];
  const open = async (name: string) => {
    const cache = store.get(name) ?? new Map<string, Response>();
    store.set(name, cache);
    return {
      put: async (key: string, res: Response) => {
        cache.set(key, res);
      },
      match: async (key: string) => cache.get(key)?.clone(),
    };
  };
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (key: string) => {
      for (const c of store.values()) {
        const hit = c.get(key);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  runInNewContext(SOURCE, {
    self,
    caches,
    URL,
    Response,
    fetch: async (req: { url: string }) => {
      fetched.push(req.url);
      const r = network(req.url);
      if (r instanceof Error) throw r;
      return r;
    },
  });

  /** 요청 하나를 보낸다. 서비스 워커가 맡지 않으면 null */
  async function request(
    path: string,
    o: { mode?: string; destination?: string } = {},
  ): Promise<Response | null> {
    let answer: Promise<Response> | null = null;
    handlers.get("fetch")?.({
      request: {
        url: `${ORIGIN}${path}`,
        method: "GET",
        mode: o.mode ?? "cors",
        destination: o.destination ?? "",
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    const res = answer ? await answer : null;
    // 저장(cache.put)은 응답을 돌려준 뒤에 끝난다
    await new Promise((r) => setTimeout(r, 0));
    return res;
  }

  async function activate(): Promise<void> {
    let done: Promise<unknown> = Promise.resolve();
    handlers.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
  }

  return { request, activate, store, fetched };
}

describe("서비스 워커 저장 규칙", () => {
  let version: string;
  let offline: boolean;
  const network = (url: string) =>
    offline ? new TypeError("오프라인") : new Response(`${url} ${version}`);

  beforeEach(() => {
    version = "1판";
    offline = false;
  });

  it("해시 붙은 빌드 결과물은 저장본을 먼저 준다", async () => {
    const sw = load(network);
    const path = "/_next/static/chunks/0edoim-fw9dbg.js";
    await sw.request(path);
    version = "2판";
    const res = await sw.request(path);
    expect(await res?.text()).toContain("1판");
    expect(sw.fetched).toHaveLength(1);
  });

  it("이름이 고정인 파일(RSC 묶음·그림)은 네트워크를 먼저 보고, 끊기면 저장본을 준다", async () => {
    const sw = load(network);
    for (const path of ["/cube.txt", "/cube/hero/3-standard.webp"]) {
      await sw.request(path);
      version = "2판";
      expect(await (await sw.request(path))?.text()).toContain("2판");
      offline = true;
      expect(await (await sw.request(path))?.text()).toContain("2판");
      offline = false;
      version = "1판";
    }
  });

  it("페이지는 네트워크 먼저, 끊기면 그 페이지나 첫 화면 저장본", async () => {
    const sw = load(network);
    await sw.request("/", { mode: "navigate" });
    await sw.request("/cube", { mode: "navigate" });
    offline = true;
    expect(
      await (await sw.request("/cube", { mode: "navigate" }))?.text(),
    ).toContain("/cube 1판");
    expect(
      await (await sw.request("/hearts", { mode: "navigate" }))?.text(),
    ).toBe(`${ORIGIN}/ 1판`);
  });

  it("워커 스크립트는 `#` 뒤를 뗀 키로 저장하고, 주소 없는 새 응답으로 감싸 준다", async () => {
    const sw = load(network);
    const entry = "/_next/static/chunks/turbopack-worker-1hrsqshz0gfey.js";
    const cube = await sw.request(`${entry}#params=["cube"]`, {
      destination: "worker",
    });
    // 새로 만든 응답은 주소가 없다: 워커 주소가 이번 요청(이번 #params)이 된다
    expect(cube?.url).toBe("");
    const bot = await sw.request(`${entry}#params=["bot"]`, {
      destination: "worker",
    });
    expect(bot?.url).toBe("");
    expect(await bot?.text()).toContain("1판");
    expect([...(sw.store.get("mighty-v3")?.keys() ?? [])]).toEqual([
      `${ORIGIN}${entry}`,
    ]);
  });

  it("저장하면 안 되는 주소는 맡지 않는다", async () => {
    const sw = load(network);
    expect(await sw.request("/version.json")).toBeNull();
    expect(await sw.request("/stardraw-api/state")).toBeNull();
    expect(await sw.request("/signal/room")).toBeNull();
  });

  it("새 판이 켜지면 옛 판(mighty-v2)의 저장본을 지운다", async () => {
    const sw = load(network);
    sw.store.set("mighty-v2", new Map());
    await sw.request("/_next/static/chunks/a.js");
    await sw.activate();
    expect([...sw.store.keys()]).toEqual(["mighty-v3"]);
  });
});
