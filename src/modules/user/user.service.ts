import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { isUniqueViolation } from "../../infrastructures/db/db.error";
import {
  PERSONAL_ROOM_DEFAULT_COLOR,
  PERSONAL_ROOM_NAME,
} from "../room/room.constant";
import type { RegisterUserRequest, UpdateProfileRequest } from "./user.dto";
import { UserRepository } from "./user.repository";
import type { UserProfileResponse } from "./user.type";

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * 유저 등록. 개인방("내 방") 자동 생성이 같은 트랜잭션에서 함께 처리된다. (PR 리뷰 확정)
   * 이미 등록된 deviceId면 409 — 사전 조회 대신 활성 유니크 인덱스 위반을 변환해
   * 동시 등록 경합에도 같은 계약을 보장한다.
   */
  async register(input: RegisterUserRequest): Promise<UserProfileResponse> {
    try {
      const user = await this.userRepository.createWithPersonalRoom(
        {
          deviceId: input.deviceId,
          nickname: input.nickname,
          avatar: input.avatar,
        },
        {
          name: PERSONAL_ROOM_NAME,
          // 개인방 색상 정책은 미결 — 확정 전까지 임시 고정값
          color: PERSONAL_ROOM_DEFAULT_COLOR,
        },
      );
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          "DEVICE_ALREADY_REGISTERED",
          "이미 등록된 디바이스입니다.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const row = await this.userRepository.findActiveById(userId);
    if (!row) {
      throw new AppException(
        "USER_NOT_FOUND",
        "유저를 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileRequest,
  ): Promise<UserProfileResponse> {
    const row = await this.userRepository.updateActiveById(userId, {
      ...(input.nickname !== undefined && { nickname: input.nickname }),
      ...(input.avatar !== undefined && { avatar: input.avatar }),
    });
    if (!row) {
      throw new AppException(
        "USER_NOT_FOUND",
        "유저를 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }
}
