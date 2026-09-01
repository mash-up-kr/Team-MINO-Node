import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { QuerySchema } from "../../common/swagger/query-schema.decorator";
import {
  type CommentListQuery,
  type CreateCommentRequest,
  commentDeleteForbiddenResponseApiSchema,
  commentDeleteNotFoundResponseApiSchema,
  commentIdParamSchema,
  commentListQuerySchema,
  commentListResponseApiSchema,
  commentResponseApiSchema,
  createCommentRequestApiSchema,
  createCommentRequestSchema,
  notRoomMemberResponseApiSchema,
  okResponseApiSchema,
  pinIdParamSchema,
  pinNotFoundResponseApiSchema,
  unidentifiedUserResponseApiSchema,
  validationErrorResponseApiSchema,
} from "./comment.dto";
import { CommentService } from "./comment.service";
import type { CommentListResponse, CommentResponse } from "./comment.type";

@ApiTags("comment")
@Controller("api/v1/pins/:pinId/comments")
@RequireCurrentUser()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get()
  @ApiOperation({
    summary: "핀 코멘트 목록 조회",
    description:
      "최신 코멘트가 첫 페이지(page=0)이고, page가 커질수록 더 예전 코멘트다. " +
      "한 페이지 안에서는 오래된 코멘트가 위, 최신이 아래로 온다(대화창 순서). " +
      "hasNext=true면 더 예전 코멘트가 남아있다는 뜻이다.",
  })
  @ApiResponse({ status: 200, schema: commentListResponseApiSchema })
  @ApiResponse({ status: 400, schema: validationErrorResponseApiSchema })
  @ApiResponse({ status: 401, schema: unidentifiedUserResponseApiSchema })
  @ApiResponse({ status: 403, schema: notRoomMemberResponseApiSchema })
  @ApiResponse({ status: 404, schema: pinNotFoundResponseApiSchema })
  list(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(pinIdParamSchema)) pinId: string,
    @QuerySchema(commentListQuerySchema) query: CommentListQuery,
  ): Promise<CommentListResponse> {
    return this.commentService.list(user, pinId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "핀 코멘트 작성" })
  @ApiBody({ schema: createCommentRequestApiSchema })
  @ApiResponse({ status: 201, schema: commentResponseApiSchema })
  @ApiResponse({ status: 400, schema: validationErrorResponseApiSchema })
  @ApiResponse({ status: 401, schema: unidentifiedUserResponseApiSchema })
  @ApiResponse({ status: 403, schema: notRoomMemberResponseApiSchema })
  @ApiResponse({ status: 404, schema: pinNotFoundResponseApiSchema })
  create(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(pinIdParamSchema)) pinId: string,
    @Body(new ValibotPipe(createCommentRequestSchema))
    request: CreateCommentRequest,
  ): Promise<CommentResponse> {
    return this.commentService.create(user, pinId, request);
  }

  @Delete(":commentId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "핀 코멘트 삭제" })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({ status: 400, schema: validationErrorResponseApiSchema })
  @ApiResponse({ status: 401, schema: unidentifiedUserResponseApiSchema })
  @ApiResponse({ status: 403, schema: commentDeleteForbiddenResponseApiSchema })
  @ApiResponse({ status: 404, schema: commentDeleteNotFoundResponseApiSchema })
  async delete(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(pinIdParamSchema)) pinId: string,
    @Param("commentId", new ValibotPipe(commentIdParamSchema))
    commentId: string,
  ): Promise<{ ok: true }> {
    await this.commentService.delete(user, pinId, commentId);
    return { ok: true };
  }
}
