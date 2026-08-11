import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  type OkResult,
  type PageQuery,
  pageQuerySchema,
} from "../../common/dto/common.dto";
import { PaginatedResult } from "../../common/interceptors/paginated-result";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  dataArraySchema,
  dataSchema,
  ERROR_RESPONSE_SCHEMA,
  OK_RESPONSE_SCHEMA,
} from "../../common/swagger/api-response";
import {
  type Comment,
  type CreateCommentRequest,
  commentResponseApiSchema,
  createCommentRequestApiSchema,
  createCommentRequestSchema,
} from "./pin.dto";
import { MOCK_COMMENTS } from "./pin.mock";

// TODO(mock): swagger.yaml 계약 기준 고정 응답. 피쳐 PR에서 service 호출로 교체.
@ApiTags("Comment")
@ApiBearerAuth()
@Controller("api/v1/pins/:pinId/comments")
export class CommentController {
  @Get()
  @ApiOperation({
    summary: "코멘트 목록 조회",
    description:
      "방 멤버만 조회 가능. 정렬은 `createdAt` 오름차순(ASC) — 최신 코멘트가 목록 맨 아래. offset 기반 페이지네이션.",
  })
  @ApiResponse({
    status: 200,
    description: "OK",
    schema: dataArraySchema(commentResponseApiSchema, { paginated: true }),
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (멤버십/방장/작성자 검증 실패)",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async listComments(
    @Param("pinId") _pinId: string,
    @Query(new ValibotPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PaginatedResult<Comment>> {
    return new PaginatedResult(MOCK_COMMENTS, {
      pageSize: query.pageSize,
      page: query.page,
      hasNext: false,
    });
  }

  @Post()
  @ApiOperation({
    summary: "코멘트 작성",
    description:
      "방 멤버만 작성 가능. 수정(PATCH)은 MVP 미지원 — 삭제 후 재작성한다.",
  })
  @ApiBody({ schema: createCommentRequestApiSchema })
  @ApiResponse({
    status: 201,
    description: "작성된 코멘트",
    schema: dataSchema(commentResponseApiSchema),
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (멤버십/방장/작성자 검증 실패)",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async createComment(
    @Param("pinId") _pinId: string,
    @Body(new ValibotPipe(createCommentRequestSchema))
    _body: CreateCommentRequest,
  ): Promise<Comment> {
    return MOCK_COMMENTS[0];
  }

  @Delete(":commentId")
  @ApiOperation({
    summary: "코멘트 삭제",
    description:
      "**작성자 본인만** 삭제할 수 있다(PR 리뷰 확정). soft delete로 처리한다.",
  })
  @ApiResponse({
    status: 200,
    description: "삭제 완료",
    schema: OK_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (멤버십/방장/작성자 검증 실패)",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: "대상 없음",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async deleteComment(
    @Param("pinId") _pinId: string,
    @Param("commentId") _commentId: string,
  ): Promise<OkResult> {
    return { ok: true };
  }
}
