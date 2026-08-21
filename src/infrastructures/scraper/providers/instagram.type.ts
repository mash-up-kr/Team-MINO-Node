import * as v from "valibot";

// 임베드 페이지(embed/captioned) HTML에 내장된 contextJSON의 원본(raw) 스키마.
// 예전 GraphQL 응답(xdt_shortcode_media)과 거의 같은 구조가 gql_data.shortcode_media
// 아래로 들어온다. 우리가 실제로 사용하는 필드만 검증한다 — v.object는 선언하지 않은
// 추가 키를 무시하므로 인스타가 필드를 더 줘도 통과한다.
// (scraper.type.ts의 정규화된 도메인 타입과 분리)
//
// GraphQL 응답과의 차이(실제 게시글로 확인):
// - location 키가 아예 없다 (태그된 장소 정보는 임베드에서 복원 불가)
// - owner.full_name이 null로 올 수 있다

const EmbedOwnerSchema = v.object({
  id: v.string(),
  username: v.string(),
  full_name: v.nullish(v.string()),
});

const EmbedCaptionEdgeSchema = v.object({
  node: v.object({ text: v.string() }),
});

const EmbedSidecarChildSchema = v.object({
  node: v.object({ display_url: v.pipe(v.string(), v.minLength(1)) }),
});

export const EmbedShortcodeMediaSchema = v.object({
  __typename: v.string(),
  shortcode: v.string(),
  display_url: v.pipe(v.string(), v.minLength(1)),
  owner: EmbedOwnerSchema,
  edge_media_to_caption: v.nullish(
    v.object({ edges: v.array(EmbedCaptionEdgeSchema) }),
  ),
  edge_sidecar_to_children: v.nullish(
    v.object({ edges: v.array(EmbedSidecarChildSchema) }),
  ),
});

export const EmbedContextSchema = v.object({
  gql_data: v.nullish(
    v.object({
      shortcode_media: v.nullish(EmbedShortcodeMediaSchema),
    }),
  ),
});

export type EmbedShortcodeMedia = v.InferOutput<
  typeof EmbedShortcodeMediaSchema
>;
