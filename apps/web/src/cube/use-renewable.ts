import { useEffect, useMemo, useRef, useState } from "react";

/** 화면이 사는 동안 쓰고, 떠날 때 치우는 것(진행 세션 등) */
export interface Renewable {
  readonly disposed: boolean;
  dispose(): void;
}

/**
 * `key`마다 하나를 만들어 쓰고, 효과 정리에서 치운다. 치운 뒤 효과가 다시 돌면(개발 모드 StrictMode는
 * 마운트→정리→마운트로 효과를 두 번 돌린다) 치운 것을 그대로 쓰지 않고 새로 만든다.
 */
export function useRenewable<T extends Renewable>(
  make: () => T,
  key: string,
): T {
  const makeRef = useRef(make);
  makeRef.current = make;
  const [renewal, setRenewal] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key나 다시 만들기 번호가 바뀔 때만 새로 만든다
  const value = useMemo(() => makeRef.current(), [key, renewal]);
  useEffect(() => {
    if (value.disposed) {
      setRenewal((r) => r + 1);
      return;
    }
    return () => value.dispose();
  }, [value]);
  return value;
}
