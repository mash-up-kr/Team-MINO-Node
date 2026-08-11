import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { notificationResponseSchema } from "../../modules/notification/notification.dto";
import { MOCK_NOTIFICATIONS } from "../../modules/notification/notification.mock";
import {
  cardResponseSchema,
  commentResponseSchema,
  pinDetailResponseSchema,
  pinResponseSchema,
} from "../../modules/pin/pin.dto";
import {
  MOCK_CARDS,
  MOCK_COMMENTS,
  MOCK_PIN_DETAIL,
  MOCK_PINS,
} from "../../modules/pin/pin.mock";
import {
  invitationPreviewResponseSchema,
  roomDetailResponseSchema,
  roomMemberResponseSchema,
  roomSummaryResponseSchema,
} from "../../modules/room/room.dto";
import {
  MOCK_INVITATION_PREVIEW,
  MOCK_ROOM_DETAIL,
  MOCK_ROOM_MEMBERS_BY_ROOM,
  MOCK_ROOMS,
} from "../../modules/room/room.mock";
import { userResponseSchema } from "../../modules/user/user.dto";
import { MOCK_USER } from "../../modules/user/user.mock";
import { nicknameSchema, pageQuerySchema } from "../dto/common.dto";

describe("fixture 스키마 적합성", () => {
  it("MOCK_USER는 userResponseSchema를 만족한다", () => {
    v.parse(userResponseSchema, MOCK_USER);
  });

  it("MOCK_ROOMS는 roomSummaryResponseSchema를 만족한다", () => {
    for (const room of MOCK_ROOMS) {
      v.parse(roomSummaryResponseSchema, room);
    }
  });

  it("MOCK_ROOM_DETAIL은 roomDetailResponseSchema를 만족한다", () => {
    v.parse(roomDetailResponseSchema, MOCK_ROOM_DETAIL);
  });

  it("방별 멤버 목록은 roomMemberResponseSchema를 만족한다", () => {
    for (const members of Object.values(MOCK_ROOM_MEMBERS_BY_ROOM)) {
      for (const member of members) {
        v.parse(roomMemberResponseSchema, member);
      }
    }
  });

  it("각 방의 memberCount는 방별 멤버 목록 길이와 일치한다", () => {
    for (const room of MOCK_ROOMS) {
      expect(MOCK_ROOM_MEMBERS_BY_ROOM[room.id]?.length).toBe(room.memberCount);
    }
  });

  it("각 방의 pinCount는 해당 방 핀 개수와 일치한다", () => {
    for (const room of MOCK_ROOMS) {
      expect(MOCK_PINS.filter((pin) => pin.roomId === room.id).length).toBe(
        room.pinCount,
      );
    }
  });

  it("MOCK_INVITATION_PREVIEW는 invitationPreviewResponseSchema를 만족한다", () => {
    v.parse(invitationPreviewResponseSchema, MOCK_INVITATION_PREVIEW);
  });

  it("MOCK_PINS는 pinResponseSchema를 만족한다", () => {
    for (const pin of MOCK_PINS) {
      v.parse(pinResponseSchema, pin);
    }
  });

  it("MOCK_PIN_DETAIL은 pinDetailResponseSchema를 만족한다", () => {
    v.parse(pinDetailResponseSchema, MOCK_PIN_DETAIL);
  });

  it("MOCK_COMMENTS는 commentResponseSchema를 만족한다", () => {
    for (const comment of MOCK_COMMENTS) {
      v.parse(commentResponseSchema, comment);
    }
  });

  it("MOCK_CARDS는 cardResponseSchema를 만족한다", () => {
    for (const card of MOCK_CARDS) {
      v.parse(cardResponseSchema, card);
    }
  });

  it("MOCK_NOTIFICATIONS는 notificationResponseSchema를 만족한다", () => {
    for (const notification of MOCK_NOTIFICATIONS) {
      v.parse(notificationResponseSchema, notification);
    }
  });
});

describe("nicknameSchema 경계값", () => {
  it("1자 닉네임은 거부한다", () => {
    expect(v.safeParse(nicknameSchema, "가").success).toBe(false);
  });

  it("15자 닉네임은 허용한다", () => {
    expect(v.safeParse(nicknameSchema, "가".repeat(15)).success).toBe(true);
  });

  it("16자 닉네임은 거부한다", () => {
    expect(v.safeParse(nicknameSchema, "가".repeat(16)).success).toBe(false);
  });

  it("특수문자가 포함된 닉네임은 거부한다", () => {
    expect(v.safeParse(nicknameSchema, "성수탐험!").success).toBe(false);
  });

  it("공백을 포함한 한글/영문 닉네임은 허용한다", () => {
    expect(v.safeParse(nicknameSchema, "성수 탐험가 abc").success).toBe(true);
  });
});

describe("pageQuerySchema", () => {
  it("미지정 시 기본값 page 0 / pageSize 20을 반환한다", () => {
    expect(v.parse(pageQuerySchema, {})).toEqual({ page: 0, pageSize: 20 });
  });

  it("쿼리 문자열을 number로 변환한다", () => {
    expect(v.parse(pageQuerySchema, { page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it("pageSize 100 초과는 거부한다", () => {
    expect(v.safeParse(pageQuerySchema, { pageSize: "101" }).success).toBe(
      false,
    );
  });

  it("음수 page는 거부한다", () => {
    expect(v.safeParse(pageQuerySchema, { page: "-1" }).success).toBe(false);
  });

  it("숫자로 변환할 수 없는 값은 거부한다", () => {
    expect(v.safeParse(pageQuerySchema, { page: "abc" }).success).toBe(false);
  });
});
