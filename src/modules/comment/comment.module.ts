import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { CommentController } from "./comment.controller";
import { CommentRepository } from "./comment.repository";
import { CommentService } from "./comment.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CommentController],
  providers: [CommentRepository, CommentService, CurrentUserGuard],
})
export class CommentModule {}
