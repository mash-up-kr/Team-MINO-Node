import type { UserAvatar } from "../user/user.schema";

export type CommentAuthor = {
  readonly id: string;
  readonly nickname: string;
  readonly avatar: UserAvatar | null;
};

export type CommentResponse = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly author: CommentAuthor;
  readonly canDelete: boolean;
};

export type CommentPagination = {
  readonly page: number;
  readonly pageSize: number;
  readonly hasNext: boolean;
};

export type CommentListResponse = {
  readonly data: readonly CommentResponse[];
  readonly pagination: CommentPagination;
};
