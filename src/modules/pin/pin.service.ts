import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "../../common/pagination/pagination.constant";
import type { PinExtractionTask } from "../../common/tasks/pin-extraction-task.dto";
import { isUniqueViolation } from "../../infrastructures/db/db.error";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import { RoomRepository } from "../room/room.repository";
import { SourceRepository } from "../source/source.repository";
import {
  type CreateRoomPinsRequest,
  type DuplicatePinRequest,
  type ListPinsQuery,
  PIN_CATEGORY_ALL,
} from "./pin.dto";
import { PinRepository } from "./pin.repository";
import {
  type PinDetailResponse,
  type PinListCriteria,
  type PinListResponse,
  type PinListSort,
  toPinResponse,
} from "./pin.type";

/**
 * HTTP 쿼리를 repository가 쓸 조회 조건으로 옮긴다. 좌표는 sort=distance일 때만
 * 의미가 있고 그 검증은 listPinsQuerySchema가 이미 마쳤으므로, 여기서 좌표를
 * 정렬 쪽으로 접어 넣어 repository가 좌표 유무를 다시 따지지 않게 한다.
 */
export function toPinListCriteria(query: ListPinsQuery): PinListCriteria {
  return {
    scope: query.roomId
      ? { type: "room", roomId: query.roomId }
      : { type: "allRooms" },
    // all은 필터 없음이라 컬럼 값이 아니다.
    categoryGroup: query.category === PIN_CATEGORY_ALL ? null : query.category,
    sort: toPinListSort(query),
  };
}

function toPinListSort(query: ListPinsQuery): PinListSort {
  switch (query.sort) {
    case "ggukPick":
      return { type: "ggukPick" };
    case "commented":
      return { type: "commented" };
    case "distance":
      // sort=distance면 좌표가 있음을 스키마가 보장한다(listPinsQuerySchema).
      return {
        type: "distance",
        lat: query.lat as number,
        lng: query.lng as number,
      };
    // all은 최신순의 별칭이다.
    default:
      return { type: "latest" };
  }
}

@Injectable()
export class PinService {
  constructor(
    private readonly pinRepository: PinRepository,
    private readonly roomRepository: RoomRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly tasksService: TasksService,
  ) {}

  async enqueueRoomPins(
    userId: string,
    input: CreateRoomPinsRequest,
  ): Promise<void> {
    const targetRooms = await this.pinRepository.listTargetRoomsWithMembership(
      input.roomIds,
      userId,
    );
    if (
      targetRooms.length !== input.roomIds.length ||
      targetRooms.some((room) => !room.isMember)
    ) {
      throw this.notRoomMember();
    }

    const sourceId = await this.sourceRepository.ensureActiveInstagramSource(
      input.url,
    );
    if (!sourceId) {
      throw new AppException(
        "SOURCE_UPSERT_FAILED",
        "출처를 저장하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
    const task: PinExtractionTask = {
      roomIds: input.roomIds,
      sourceId,
      createdBy: userId,
      url: input.url,
      enqueuedAt: new Date().toISOString(),
    };
    await this.tasksService.enqueuePinExtraction(task);
  }

  /**
   * 방의 핀 목록. page/pageSize 둘 다 미지정이면 전체 반환(지도 전체 보기 보장 — PR 리뷰 확정),
   * 하나라도 지정되면 offset 기반 페이지네이션한다.
   */
  async listPins(
    userId: string,
    query: ListPinsQuery,
  ): Promise<PinListResponse> {
    // roomId 미지정이면 조회 범위가 내가 속한 방으로 한정되므로 별도 검증이 없다.
    if (
      query.roomId &&
      !(await this.roomRepository.isActiveMember(query.roomId, userId))
    ) {
      throw this.notRoomMember();
    }

    const criteria = toPinListCriteria(query);
    const paged = query.page !== undefined || query.pageSize !== undefined;
    if (!paged) {
      const rows = await this.pinRepository.listForUser(userId, criteria);
      return { data: rows.map(toPinResponse) };
    }

    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    // pageSize+1개를 조회해 다음 페이지 존재 여부를 판별한다
    const rows = await this.pinRepository.listForUser(userId, criteria, {
      limit: pageSize + 1,
      offset: page * pageSize,
    });
    return {
      data: rows.slice(0, pageSize).map(toPinResponse),
      pagination: { pageSize, page, hasNext: rows.length > pageSize },
    };
  }

  /** 장소(핀) 상세. 장소 정보 + 출처 링크 + 저장한 멤버 프로필. */
  async getPinDetail(
    userId: string,
    pinId: string,
  ): Promise<PinDetailResponse> {
    const row = await this.pinRepository.findDetailForUser(pinId, userId);
    if (!row) {
      throw this.pinNotFound();
    }
    if (!row.isMember) {
      throw this.notRoomMember();
    }

    return { ...toPinResponse(row), sourceUrl: row.sourceUrl ?? null };
  }

  /**
   * 다른 방에 핀 복제("다른 방에 공유"). 원본 방과 모든 대상 방의 멤버십을 검증하고,
   * 대상 방 중 하나라도 같은 장소가 이미 저장돼 있으면 409로 전체 거절한다. (PR 리뷰 확정)
   */
  async duplicatePin(
    userId: string,
    pinId: string,
    input: DuplicatePinRequest,
  ): Promise<void> {
    const pin = await this.findActivePinForUser(pinId, userId);

    const targetRoomIds = [...new Set(input.roomIds)];
    const targetRooms = await this.pinRepository.listTargetRoomsWithMembership(
      targetRoomIds,
      userId,
    );
    if (targetRooms.length !== targetRoomIds.length) {
      throw new AppException(
        "ROOM_NOT_FOUND",
        "복제 대상 방을 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }
    if (targetRooms.some((room) => !room.isMember)) {
      throw new AppException(
        "NOT_ROOM_MEMBER",
        "복제 대상 방의 멤버가 아닙니다.",
        HttpStatus.FORBIDDEN,
      );
    }

    const hasDuplicate = await this.pinRepository.existsPlaceInRooms(
      targetRoomIds,
      pin.placeId,
    );
    if (hasDuplicate) {
      throw new AppException(
        "DUPLICATE_PIN_IN_ROOM",
        "이미 같은 장소가 저장된 방이 있습니다.",
        HttpStatus.CONFLICT,
      );
    }

    try {
      await this.pinRepository.insertMany(
        targetRoomIds.map((roomId) => ({
          roomId,
          placeId: pin.placeId,
          sourceId: pin.sourceId,
          createdBy: userId,
        })),
      );
    } catch (error) {
      // 동시 요청이 활성 유니크(room_id, place_id)에 막히는 경우도 같은 계약으로 변환
      if (isUniqueViolation(error)) {
        throw new AppException(
          "DUPLICATE_PIN_IN_ROOM",
          "이미 같은 장소가 저장된 방이 있습니다.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * 핀 접근 기록(사용자별). 홈 카드 덱의 묵힘(마지막으로 열어본 시점) 계산과
   * "친구들이 많이 본 곳"(클릭수) 집계의 원천 데이터. append-only.
   */
  async recordAccess(userId: string, pinId: string): Promise<void> {
    await this.findActivePinForUser(pinId, userId);
    await this.pinRepository.insertAccess(pinId, userId);
  }

  /**
   * 장소(핀) 삭제. 해당 방에서 핀과 관련 코멘트를 soft delete한다.
   * 방 멤버십을 검증하고, 멤버가 아니면 403, 핀이 없으면 404를 던진다.
   */
  async deletePin(userId: string, pinId: string): Promise<void> {
    await this.findActivePinForUser(pinId, userId);
    const deleted = await this.pinRepository.softDelete(pinId, userId);
    if (!deleted) {
      throw this.pinNotFound();
    }
  }

  private async findActivePinForUser(pinId: string, userId: string) {
    const pin = await this.pinRepository.findActiveByIdForUser(pinId, userId);
    if (!pin) {
      throw this.pinNotFound();
    }
    if (!pin.isMember) {
      throw this.notRoomMember();
    }
    return pin;
  }

  private pinNotFound(): AppException {
    return new AppException(
      "PIN_NOT_FOUND",
      "핀을 찾을 수 없습니다.",
      HttpStatus.NOT_FOUND,
    );
  }

  private notRoomMember(): AppException {
    return new AppException(
      "NOT_ROOM_MEMBER",
      "방의 멤버가 아닙니다.",
      HttpStatus.FORBIDDEN,
    );
  }
}
