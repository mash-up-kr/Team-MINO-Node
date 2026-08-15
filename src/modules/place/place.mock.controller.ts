import { Body, Controller, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreatePlaceRequest,
  createPlaceRequestApiSchema,
  createPlaceRequestSchema,
  placeMatchListResponseApiSchema,
} from "./place.dto";
import type { PlaceMatch } from "./place.type";

// TODO(임시): 클라 개발 언블록용 mock. 실제 파이프라인(스크래퍼 인증) 연동되면 이 파일째 제거.
// 실제 응답 계약(PlaceMatch[])과 동일한 형태로, matches가 빈 케이스도 포함한다.
const MOCK_PLACES: PlaceMatch[] = [
  {
    extracted: {
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
      countryCode: "KR",
      relation: "카페 방문 후기",
    },
    matches: [
      {
        provider: "kakao",
        providerPlaceId: "145791269",
        placeName: "어니언 성수",
        address: "서울 성동구 성수동2가 277-135",
        coordinate: { lat: 37.544782395189884, lng: 127.05820807890457 },
        mapUrl: "http://place.map.kakao.com/145791269",
        phone: "070-4353-3238",
        category: "음식점 > 카페",
      },
    ],
  },
  {
    extracted: {
      placeName: "대림창고",
      areaName: "성수동",
      areaType: "landmark",
      countryCode: "KR",
      relation: "다음 코스",
    },
    matches: [
      {
        provider: "kakao",
        providerPlaceId: "1128989913",
        placeName: "성수동대림창고갤러리",
        address: "서울 성동구 성수동2가 322-32",
        coordinate: { lat: 37.54171994709006, lng: 127.05624815815919 },
        mapUrl: "http://place.map.kakao.com/1128989913",
        phone: "0507-1390-9669",
        category: "음식점 > 카페 > 테마카페 > 갤러리카페",
      },
    ],
  },
  {
    extracted: {
      placeName: "블루보틀 성수",
      areaName: "성수동",
      areaType: "landmark",
      countryCode: "KR",
      relation: "커피 맛집",
    },
    matches: [
      {
        provider: "kakao",
        providerPlaceId: "1492599844",
        placeName: "블루보틀 성수 카페",
        address: "서울 성동구 성수동1가 656-302",
        coordinate: { lat: 37.548088279686716, lng: 127.04564285335792 },
        mapUrl: "http://place.map.kakao.com/1492599844",
        phone: "1533-6906",
        category: "음식점 > 카페 > 커피전문점 > 블루보틀",
      },
    ],
  },
  {
    extracted: {
      placeName: "이름만 언급된 가게",
      areaName: "성수동",
      areaType: "region",
      countryCode: "KR",
      relation: "지나가며 언급",
    },
    matches: [],
  },
];

@ApiTags("place")
@Controller("api/v1/place")
export class PlaceMockController {
  @Post("_mock/places")
  @ApiOperation({
    summary: "[임시 Mock] 고정 PlaceMatch[] 반환 (클라 개발용)",
    description:
      "실제 스크래핑/추출 없이 고정 데이터를 반환한다. 실제 파이프라인 연동 후 제거 예정.",
  })
  @ApiBody({ schema: createPlaceRequestApiSchema })
  @ApiResponse({
    status: 201,
    description: "고정 PlaceMatch[] (matches가 빈 케이스 포함)",
    schema: placeMatchListResponseApiSchema,
  })
  async mockCreatePlace(
    @Body(new ValibotPipe(createPlaceRequestSchema)) _body: CreatePlaceRequest,
  ): Promise<PlaceMatch[]> {
    return MOCK_PLACES;
  }
}
