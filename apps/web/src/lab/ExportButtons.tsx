"use client";

import { useState } from "react";

/** 결과 JSON을 복사하거나 파일로 내려받는다 */
export function ExportButtons({
  name,
  data,
}: {
  name: string;
  data: () => unknown;
}) {
  const [copied, setCopied] = useState(false);
  const text = () =>
    JSON.stringify(
      { at: new Date().toISOString(), ...(data() as object) },
      null,
      2,
    );
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="rounded-lg bg-white/15 px-3 py-2 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text());
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "복사했습니다" : "결과 복사"}
      </button>
      <button
        type="button"
        className="rounded-lg bg-white/15 px-3 py-2 text-sm"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([text()], { type: "application/json" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name}-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        내려받기
      </button>
    </div>
  );
}
