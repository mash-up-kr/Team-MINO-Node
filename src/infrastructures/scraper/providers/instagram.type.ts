// 임베드 페이지 HTML은 URL/캡션에 HTML 엔티티를 인코딩해서 준다
// (예: "&" -> "&amp;", "@" -> "&#064;"). 이미지 URL은 디코딩하지 않으면
// 쿼리스트링이 깨져 다운로드가 실패한다.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[body] ?? entity;
  });
}
