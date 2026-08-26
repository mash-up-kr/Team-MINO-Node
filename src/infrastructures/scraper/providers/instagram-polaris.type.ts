import * as v from "valibot";

/*
 * 인스타 로그아웃 웹앱(Polaris)이 게시글을 그릴 때 쓰는 응답의 원본 스키마.
 * GraphQL(POST /api/graphql)과 게시글 HTML(GET /p/{shortcode}/)이 같은 노드를 주므로
 * 두 provider가 이 스키마와 매퍼를 공유한다.
 *
 * v.object는 선언하지 않은 키를 무시하므로 인스타가 필드를 더 줘도 통과한다.
 */

// user.pk는 문자열, location.pk는 숫자로 온다. 매퍼에서 문자열로 정규화한다.
const PolarisIdSchema = v.union([v.string(), v.number()]);

// 해상도 사다리. candidates[0]이 원본이다.
const PolarisImageVersionsSchema = v.object({
  candidates: v.pipe(
    v.array(v.object({ url: v.pipe(v.string(), v.minLength(1)) })),
    v.minLength(1),
  ),
});

export const PolarisMediaSchema = v.object({
  // XIGPolaris{Image,Carousel,Video}Media
  __typename: v.string(),
  code: v.string(),
  caption: v.nullish(v.object({ text: v.string() })),
  image_versions2: v.optional(PolarisImageVersionsSchema),
  carousel_media: v.optional(
    v.array(v.object({ image_versions2: PolarisImageVersionsSchema })),
  ),
  user: v.object({
    pk: PolarisIdSchema,
    username: v.string(),
    full_name: v.string(),
  }),
  location: v.nullish(
    v.object({
      pk: PolarisIdSchema,
      name: v.string(),
      // 광역 태그("제주도" 등)는 좌표가 없다.
      lat: v.nullish(v.number()),
      lng: v.nullish(v.number()),
    }),
  ),
});

export type PolarisMedia = v.InferOutput<typeof PolarisMediaSchema>;
