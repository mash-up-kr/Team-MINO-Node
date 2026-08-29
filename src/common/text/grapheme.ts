import * as v from "valibot";

const graphemeSegmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

/**
 * 사용자 표시 글자 수(grapheme cluster, UAX #29).
 * 이모지·결합 문자를 1자로 세어, 클라이언트의 글자 수 계산과 단위를 맞춘다.
 */
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(value)) {
    count += 1;
  }
  return count;
}

/** grapheme 단위 최대 길이 검증. UTF-16 코드유닛 기준 maxLength 대신 사용한다. */
export function maxGraphemes(limit: number, message: string) {
  return v.check((value: string) => graphemeLength(value) <= limit, message);
}
