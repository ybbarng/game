// 옛 주소 넘기기(docs/47 16-6). 정적 사이트라 page가 클라이언트에서 새 주소로 옮긴다.
// 옛 주소의 쿼리는 그대로 붙이고, 같은 이름이 있으면 새 주소의 값이 이긴다.

/** 새 주소(`/cube/patterns?tab=make`)에 옛 주소의 쿼리(`?shape=x`)를 붙인다 */
export function redirectTarget(to: string, search: string): string {
  const at = to.indexOf("?");
  const path = at < 0 ? to : to.slice(0, at);
  const query = at < 0 ? "" : to.slice(at + 1);
  const merged = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(query)) merged.set(k, v);
  const q = merged.toString();
  return q ? `${path}?${q}` : path;
}
