import { Module, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          transport:
            config.get("NODE_ENV") !== "production"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          redact: ["req.headers.authorization"],
        },
        exclude: [{ method: RequestMethod.ALL, path: "*" }],
      }),
    }),
  ],
})
export class AppModule {}
