import * as v from "valibot";

/*
 * 임베드 페이지(embed/captioned)의 contextJSON 원본 스키마. 예전 GraphQL 응답
 * (xdt_shortcode_media)과 거의 같은 구조가 gql_data.shortcode_media 아래로 들어온다.
 * v.object는 선언하지 않은 키를 무시하므로 인스타가 필드를 더 줘도 통과한다.
 *
 * Polaris 응답과의 차이: location 키가 아예 없고 owner.full_name이 null로 온다.
 */
export const EmbedShortcodeMediaSchema = v.object({
  __typename: v.string(),
  shortcode: v.string(),
  display_url: v.pipe(v.string(), v.minLength(1)),
  owner: v.object({
    id: v.string(),
    username: v.string(),
    full_name: v.nullish(v.string()),
  }),
  edge_media_to_caption: v.nullish(
    v.object({
      edges: v.array(v.object({ node: v.object({ text: v.string() }) })),
    }),
  ),
  edge_sidecar_to_children: v.nullish(
    v.object({
      edges: v.array(
        v.object({
          node: v.object({ display_url: v.pipe(v.string(), v.minLength(1)) }),
        }),
      ),
    }),
  ),
});

export const EmbedContextSchema = v.object({
  gql_data: v.nullish(
    v.object({ shortcode_media: v.nullish(EmbedShortcodeMediaSchema) }),
  ),
});

export type EmbedShortcodeMedia = v.InferOutput<
  typeof EmbedShortcodeMediaSchema
>;
