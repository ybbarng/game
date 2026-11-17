// 임시 탐색용(커밋하지 않는다). 초고수 대 고수를 시드마다 한 판씩 두고 진 판의 수순을 찍는다.
import { createRng } from "@game/mighty-engine";
import {
  createMatch,
  type OmokRules,
  pendingSeats,
  pointName,
  step,
  stoneOfSeat,
  viewOf,
} from "@game/omok-engine";
import { it } from "vitest";

import { omokExpertBot } from "./bots";
import { createOmokMasterBot, MASTER_LIMITS, type MasterLimits } from "./master";

declare const process: {
  stderr: { write(text: string): void };
  env: Record<string, string | undefined>;
};
declare const performance: { now(): number };
const log = (s: string) => process.stderr.write(`${s}\n`);

const env = process.env;
const FROM = Number(env.PROBE_FROM ?? 1);
const TO = Number(env.PROBE_TO ?? 20);
const VARIANT = (env.PROBE_VARIANT ?? "standard") as OmokRules["variant"];
const OVERRIDE = JSON.parse(env.PROBE_LIMITS ?? "{}") as Partial<MasterLimits>;
const ONLY_WHITE = env.PROBE_WHITE === "1";
const SHOW = env.PROBE_SHOW === "1";

it("probe", () => {
  const rules: OmokRules = { variant: VARIANT, winsToFinish: 1 };
  const master = createOmokMasterBot({ ...MASTER_LIMITS, ...OVERRIDE });
  const tally = { b: [0, 0, 0], w: [0, 0, 0] };
  const times: number[] = [];
  const lines: string[] = [];
  for (let seed = FROM; seed <= TO; seed++) {
    let { state } = createMatch(rules, seed);
    const rng = createRng(seed + 1);
    const mine = seed % 2;
    const color = stoneOfSeat(state, mine) === 1 ? "b" : "w";
    if (ONLY_WHITE && color !== "w") continue;
    while (state.phase === "play") {
      const seat = pendingSeats(state)[0] as number;
      const bot = seat === mine ? master : omokExpertBot;
      const t = performance.now();
      const a = bot.decide(viewOf(state, seat), rng);
      if (seat === mine) times.push(performance.now() - t);
      const r = step(state, seat, a);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const k = state.wins[mine] === 1 ? 0 : state.result?.kind === "draw" ? 2 : 1;
    tally[color][k]++;
    const mv = state.moves.map(pointName).join(" ");
    lines.push(`${seed} ${color} ${["W", "L", "D"][k]} ${state.moves.length} ${SHOW || k === 1 ? mv : ""}`);
  }
  for (const l of lines) log(l);
  times.sort((a, b) => a - b);
  log(
    `${VARIANT} ${FROM}-${TO} ${JSON.stringify(OVERRIDE)} 흑 ${tally.b.join("/")} 백 ${tally.w.join("/")} (승/패/무) 시간 가운데 ${times[times.length >> 1]?.toFixed(0)} 90% ${times[Math.floor(times.length * 0.9)]?.toFixed(0)} 최대 ${times.at(-1)?.toFixed(0)}`,
  );
});
