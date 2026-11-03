/** d3-celestial 라이선스(BSD 3조항) 전문. `public/licenses/d3-celestial.txt`와 같은 글이다 */
const D3_LICENSE = `Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const LINK =
  "underline decoration-white/30 underline-offset-2 hover:text-white";

/**
 * 시작 화면 아래 「별 자료 출처」 접는 칸(docs/48 5-7). 별 이름·밝기·별자리 선이 어디서 왔는지와 조건.
 * 자세한 표는 저장소 `packages/galaxy-engine/src/sky/README.md`
 */
export function GalaxySources() {
  return (
    <details className="mx-auto mt-1 w-full max-w-sm rounded-xl bg-white/5 px-3 py-2 text-left text-[11px] text-white/60">
      <summary className="cursor-pointer text-center text-white/70">
        별 자료 출처
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 leading-relaxed">
        <li>
          별 이름: IAU 별 이름 실무단(WGSN) IAU Catalog of Star Names(IAU-CSN,
          E. Mamajek 정리),{" "}
          <a
            className={LINK}
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
          (원본{" "}
          <a
            className={LINK}
            href="https://www.iau.org/public/themes/naming_stars/"
            target="_blank"
            rel="noreferrer"
          >
            iau.org
          </a>
          ). HR 번호와 이름만 뽑아 옮겼습니다.
        </li>
        <li>
          밝기·색·온도: Hoffleit &amp; Warren(1991), Yale Bright Star Catalogue
          5판(BSC5). 거리는 별마다 문헌 값(대부분 van Leeuwen 2007).
        </li>
        <li>
          별자리 선: d3-celestial(Olaf Frohn), BSD 3조항 라이선스.{" "}
          <a
            className={LINK}
            href="/licenses/d3-celestial.txt"
            target="_blank"
            rel="noreferrer"
          >
            라이선스 전문
          </a>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 font-mono text-[10px] leading-snug text-white/50">
            {D3_LICENSE}
          </pre>
        </li>
        <li>
          우리말 별자리 이름은 한국천문연구원 표기, 별 이야기는 사실만 골라 새로
          썼습니다.
        </li>
      </ul>
    </details>
  );
}
