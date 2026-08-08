import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type {
  CreateRoomRequest,
  ListRoomsQuery,
  TransferOwnerRequest,
  UpdateRoomRequest,
} from "./room.dto";
import { RoomRepository } from "./room.repository";
import type {
  MemberWithRoomRow,
  RoomDetailResponse,
  RoomForUserRow,
  RoomMemberResponse,
  RoomResponse,
  RoomRow,
  RoomSummaryResponse,
} from "./room.type";

@Injectable()
export class RoomService {
  constructor(private readonly roomRepository: RoomRepository) {}

  /** 공동방 생성. 생성자가 방장이 되고 본인 멤버십도 함께 등록된다. */
  async createRoom(
    userId: string,
    input: CreateRoomRequest,
  ): Promise<RoomResponse> {
    return await this.roomRepository.createSharedRoom(userId, {
      name: input.name,
      description: input.description ?? null,
      color: input.color,
    });
  }

  /** 내가 속한 방 목록. 나간 방(멤버십 soft delete)은 제외한다. */
  async listRooms(
    userId: string,
    query: ListRoomsQuery,
  ): Promise<RoomSummaryResponse[]> {
    const joinedRooms =
      await this.roomRepository.listJoinedRoomsWithCounts(userId);
    if (joinedRooms.length === 0) {
      return [];
    }
    const roomIds = joinedRooms.map((room) => room.id);

    const roomIdsWithPlace = query.showHasPlaceId
      ? new Set(
          await this.roomRepository.findRoomIdsHavingPlace(
            roomIds,
            query.showHasPlaceId,
          ),
        )
      : undefined;

    const membersByRoom = query.showUsers
      ? Map.groupBy(
          await this.roomRepository.listMembersWithRole(roomIds),
          (member) => member.roomId,
        )
      : undefined;

    return joinedRooms.map((room) => ({
      ...room,
      ...(roomIdsWithPlace && { hasPlace: roomIdsWithPlace.has(room.id) }),
      ...(membersByRoom && {
        users: (membersByRoom.get(room.id) ?? []).map(toMemberResponse),
      }),
    }));
  }

  async getRoomDetail(
    userId: string,
    roomId: string,
  ): Promise<RoomDetailResponse> {
    const { isMember, ...room } = await this.findActiveRoomForUser(
      roomId,
      userId,
    );
    if (!isMember) {
      throw this.notRoomMember();
    }
    return room;
  }

  /** 방 편집. 방장만 가능하다. */
  async updateRoom(
    userId: string,
    roomId: string,
    input: UpdateRoomRequest,
  ): Promise<RoomResponse> {
    const room = await this.findActiveRoom(roomId);
    this.assertOwner(room, userId);

    const updated = await this.roomRepository.updateActiveById(roomId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.color !== undefined && { color: input.color }),
    });
    if (!updated) {
      throw new Error("방 수정에 실패했습니다.");
    }
    return updated;
  }

  /** 방장 위임. 방장이 방을 나가려면 먼저 이 API로 위임해야 한다. */
  async transferOwner(
    userId: string,
    roomId: string,
    input: TransferOwnerRequest,
  ): Promise<void> {
    const room = await this.findActiveRoom(roomId);
    this.assertOwner(room, userId);
    this.assertNotPersonal(room);

    const transferred = await this.roomRepository.transferOwnerToMember(
      roomId,
      input.nextOwnerId,
    );
    if (!transferred) {
      throw new AppException(
        "INVALID_OWNER_TARGET",
        "위임 대상이 방의 활성 멤버가 아닙니다.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * 방 나가기. 서버가 요청 유저 상태를 검증해 분기한다. (PR 리뷰 확정)
   * - 일반 멤버: 멤버십 soft delete
   * - 방장 + 다른 멤버 존재: 409 (위임 선행 필요)
   * - 방장 + 마지막 멤버: 나가기 + 방 soft delete
   */
  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.findActiveRoomForUser(roomId, userId);
    if (!room.isMember) {
      throw this.notRoomMember();
    }
    this.assertNotPersonal(room);

    const leftAt = new Date();

    if (room.ownerId !== userId) {
      await this.roomRepository.softDeleteMembership(roomId, userId, leftAt);
      return;
    }

    if (room.memberCount > 1) {
      throw new AppException(
        "OWNER_TRANSFER_REQUIRED",
        "방장은 나가기 전에 다른 멤버에게 방장을 넘겨야 합니다.",
        HttpStatus.CONFLICT,
      );
    }

    // 방장이 마지막 멤버면 나가기를 허용하고 방을 삭제한다
    await this.roomRepository.softDeleteMembershipAndRoom(
      roomId,
      userId,
      leftAt,
    );
  }

  /** 방 멤버 목록. 방장 위임 대상 선택 모달용. */
  async listMembers(
    userId: string,
    roomId: string,
  ): Promise<RoomMemberResponse[]> {
    const rows = await this.roomRepository.listMembersWithRole([roomId]);
    // 활성 방은 항상 멤버가 1명 이상이므로(마지막 멤버 나가기 = 방 삭제) 빈 결과는 방 없음이다
    if (rows.length === 0) {
      throw this.roomNotFound();
    }
    if (!rows.some((row) => row.userId === userId)) {
      throw this.notRoomMember();
    }
    return rows.map(toMemberResponse);
  }

  private async findActiveRoom(roomId: string): Promise<RoomRow> {
    const room = await this.roomRepository.findActiveById(roomId);
    if (!room) {
      throw this.roomNotFound();
    }
    return room;
  }

  private roomNotFound(): AppException {
    return new AppException(
      "ROOM_NOT_FOUND",
      "방을 찾을 수 없습니다.",
      HttpStatus.NOT_FOUND,
    );
  }

  private async findActiveRoomForUser(
    roomId: string,
    userId: string,
  ): Promise<RoomForUserRow> {
    const room = await this.roomRepository.findActiveByIdForUser(
      roomId,
      userId,
    );
    if (!room) {
      throw this.roomNotFound();
    }
    return room;
  }

  private notRoomMember(): AppException {
    return new AppException(
      "NOT_ROOM_MEMBER",
      "방의 멤버가 아닙니다.",
      HttpStatus.FORBIDDEN,
    );
  }

  private assertOwner(room: RoomRow, userId: string): void {
    if (room.ownerId !== userId) {
      throw new AppException(
        "NOT_ROOM_OWNER",
        "방장만 할 수 있는 동작입니다.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private assertNotPersonal(room: RoomRow): void {
    if (room.type === "personal") {
      throw new AppException(
        "PERSONAL_ROOM_NOT_ALLOWED",
        "개인방은 나가기·위임 대상이 아닙니다.",
        HttpStatus.FORBIDDEN,
      );
    }
  }
}

/** 그룹핑용 roomId를 떼면 곧 응답 형태다. */
function toMemberResponse({
  roomId: _roomId,
  ...member
}: MemberWithRoomRow): RoomMemberResponse {
  return member;
}
