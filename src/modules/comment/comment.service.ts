import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { RequestUser } from "../../common/guards/current-user.guard";
import type { CommentListQuery, CreateCommentRequest } from "./comment.dto";
import { CommentRepository } from "./comment.repository";
import type { CommentListResponse, CommentResponse } from "./comment.type";

@Injectable()
export class CommentService {
  constructor(private readonly commentRepository: CommentRepository) {}

  async list(
    user: RequestUser,
    pinId: string,
    query: CommentListQuery,
  ): Promise<CommentListResponse> {
    await this.requireMembership(user.id, pinId);

    const rows = await this.commentRepository.findActiveComments(
      pinId,
      query.page * query.pageSize,
      query.pageSize + 1,
    );
    const comments = rows
      .slice(0, query.pageSize)
      .reverse()
      .map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: {
          id: row.authorId,
          nickname: row.authorNickname,
          avatar: row.authorAvatar,
        },
        canDelete: row.authorId === user.id,
      }));

    return {
      comments,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        hasNext: rows.length > query.pageSize,
      },
    };
  }

  async create(
    user: RequestUser,
    pinId: string,
    request: CreateCommentRequest,
  ): Promise<CommentResponse> {
    await this.requireMembership(user.id, pinId);

    const comment = await this.commentRepository.create(
      pinId,
      user.id,
      request.content,
    );
    if (!comment) {
      throw new AppException(
        "COMMENT_CREATE_FAILED",
        "코멘트를 작성하지 못했습니다.",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
      },
      canDelete: true,
    };
  }

  private async requireMembership(
    userId: string,
    pinId: string,
  ): Promise<void> {
    const pin = await this.commentRepository.findActivePin(pinId);
    if (!pin) {
      throw new AppException(
        "PIN_NOT_FOUND",
        "핀을 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    const isMember = await this.commentRepository.hasActiveMembership(
      pin.roomId,
      userId,
    );
    if (!isMember) {
      throw new AppException(
        "NOT_ROOM_MEMBER",
        "방의 멤버가 아닙니다.",
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
