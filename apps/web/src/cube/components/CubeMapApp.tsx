import { FEATURE_MAP, MAP_INTRO } from "../nav/feature-map";

/** 큐브 기능 지도(`/cube/map`, docs/47 16-2). 모든 화면을 첫 화면 뼈대 차례로, 짧은 설명과 주소를 함께 */
export function CubeMapApp() {
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4"
        data-cube-map
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-xl">큐브 기능 지도</h1>
        </header>
        <p className="break-keep text-sm text-white/80" data-map-intro>
          {MAP_INTRO}
        </p>
        {FEATURE_MAP.map((section) => (
          <section
            key={section.title}
            className="flex flex-col gap-1.5"
            data-map-section={section.title}
          >
            <h2 className="px-1 font-semibold text-sm text-white/60">
              {section.title}
            </h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {section.items.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    data-map-item={item.href}
                    className="flex h-full items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10"
                  >
                    <span aria-hidden className="text-lg leading-6">
                      {item.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <b className="text-sm">{item.title}</b>
                      <span className="break-keep text-white/70 text-xs">
                        {item.what}
                      </span>
                      <span className="mt-0.5 truncate font-mono text-[11px] text-white/40">
                        {item.href}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
