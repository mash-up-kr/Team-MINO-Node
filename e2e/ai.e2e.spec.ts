import "reflect-metadata";
import { beforeAll, describe, expect, it } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AiModule } from "../src/infrastructures/ai/ai.module";
import { AiService } from "../src/infrastructures/ai/ai.service";
import { placeExtractionSchema } from "../src/modules/place/place.type";

// 실제 Vertex를 호출하므로 GOOGLE_CLOUD_PROJECT(+ADC)가 있을 때만 실행한다.
const live = process.env.GOOGLE_CLOUD_PROJECT ? describe : describe.skip;

live("AiService (live Vertex)", () => {
  let ai: AiService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
              GOOGLE_VERTEX_LOCATION:
                process.env.GOOGLE_VERTEX_LOCATION ?? "global",
            }),
          ],
        }),
        AiModule,
      ],
    }).compile();
    ai = moduleRef.get(AiService);
  });

  it("한국어 캡션에서 장소를 구조화 추출한다", async () => {
    // given / when
    const { places } = await ai.extract(placeExtractionSchema, [
      { type: "text", text: "다음 게시물에서 실제 장소를 추출해줘." },
      {
        type: "text",
        text: "Caption:\n성수동 어니언 카페 다녀왔어요. 분위기 최고!",
      },
    ]);

    // then
    expect(places.length).toBeGreaterThanOrEqual(1);
    expect(places.map((p) => p.place_name).join(" ")).toContain("어니언");
    for (const place of places) {
      expect(["landmark", "address", "region"]).toContain(place.area_type);
    }
  }, 60_000);

  it("장소가 없는 캡션은 빈 배열을 반환한다", async () => {
    // given / when
    const { places } = await ai.extract(placeExtractionSchema, [
      {
        type: "text",
        text: "다음 게시물에서 실제 장소만 추출해줘. 없으면 비워둬.",
      },
      { type: "text", text: "Caption:\n오늘 날씨 진짜 좋다 기분 최고 🙌" },
    ]);

    // then
    expect(places).toHaveLength(0);
  }, 60_000);

  it("이미지를 포함한 멀티모달 호출이 동작한다", async () => {
    // given / when
    const { places } = await ai.extract(placeExtractionSchema, [
      { type: "text", text: "캡션과 이미지를 보고 실제 장소를 추출해줘." },
      { type: "text", text: "Caption:\n강남 최강금돈까스, 양심역 근처" },
      {
        type: "image",
        url: "https://upload.wikimedia.org/wikipedia/commons/4/45/A_small_cup_of_coffee.JPG",
      },
    ]);

    // then
    expect(places.map((p) => p.place_name).join(" ")).toContain("최강금돈까스");
  }, 90_000);
});
