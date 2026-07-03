import * as v from "valibot";

// Instagram 내부 GraphQL 응답의 원본(raw) 스키마. 우리가 실제로 사용하는 필드만 검증한다.
// v.object 는 선언하지 않은 추가 키를 무시하므로, 인스타가 필드를 더 줘도 통과한다.
// (scraper.type.ts 의 정규화된 도메인 타입과 분리)

const IgOwnerSchema = v.object({
  id: v.string(),
  username: v.string(),
  full_name: v.string(),
});

const IgLocationSchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  has_public_page: v.boolean(),
  // 상세 주소(JSON 문자열). 없거나(null/누락) 올 수 있음.
  address_json: v.nullish(v.string()),
});

const IgCaptionEdgeSchema = v.object({
  node: v.object({ text: v.string() }),
});

const IgSidecarChildSchema = v.object({
  node: v.object({ display_url: v.pipe(v.string(), v.minLength(1)) }),
});

export const IgShortcodeMediaSchema = v.object({
  __typename: v.string(),
  shortcode: v.string(),
  display_url: v.pipe(v.string(), v.minLength(1)),
  owner: IgOwnerSchema,
  location: v.nullable(IgLocationSchema),
  edge_media_to_caption: v.object({ edges: v.array(IgCaptionEdgeSchema) }),
  edge_sidecar_to_children: v.optional(
    v.object({ edges: v.array(IgSidecarChildSchema) }),
  ),
});

export const IgResponseSchema = v.object({
  data: v.object({
    xdt_shortcode_media: v.nullable(IgShortcodeMediaSchema),
  }),
});

export type IgShortcodeMedia = v.InferOutput<typeof IgShortcodeMediaSchema>;
export type IgOwner = v.InferOutput<typeof IgOwnerSchema>;
export type IgLocation = v.InferOutput<typeof IgLocationSchema>;
