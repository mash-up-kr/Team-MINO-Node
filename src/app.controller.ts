import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("app")
@Controller()
export class AppController {
  @Get("health")
  @ApiOkResponse({
    description: "API server health status",
    schema: {
      example: {
        status: "ok",
      },
    },
  })
  getHealth() {
    return {
      status: "ok",
    } as const;
  }
}
