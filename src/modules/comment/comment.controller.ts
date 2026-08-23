import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  COMMENT_PAGE_SIZE_DEFAULT,
  COMMENT_PAGE_SIZE_MAX,
  type CommentListQuery,
  type CreateCommentRequest,
  commentListQuerySchema,
  commentListResponseApiSchema,
  commentResponseApiSchema,
  createCommentRequestApiSchema,
  createCommentRequestSchema,
  errorResponseApiSchema,
  pinIdParamSchema,
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
      "최신 페이지부터 가져오며, 각 페이지 안에서는 오래된 코멘트가 먼저 온다.",
  })
  @ApiQuery({ name: "page", required: false, example: 0 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    example: COMMENT_PAGE_SIZE_DEFAULT,
    schema: { maximum: COMMENT_PAGE_SIZE_MAX },
  })
  @ApiResponse({ status: 200, schema: commentListResponseApiSchema })
  @ApiResponse({ status: 400, schema: errorResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 404, schema: errorResponseApiSchema })
  list(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(pinIdParamSchema)) pinId: string,
    @Query(new ValibotPipe(commentListQuerySchema)) query: CommentListQuery,
  ): Promise<CommentListResponse> {
    return this.commentService.list(user, pinId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "핀 코멘트 작성" })
  @ApiBody({ schema: createCommentRequestApiSchema })
  @ApiResponse({ status: 201, schema: commentResponseApiSchema })
  @ApiResponse({ status: 400, schema: errorResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 404, schema: errorResponseApiSchema })
  create(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(pinIdParamSchema)) pinId: string,
    @Body(new ValibotPipe(createCommentRequestSchema))
    request: CreateCommentRequest,
  ): Promise<CommentResponse> {
    return this.commentService.create(user, pinId, request);
  }
}
