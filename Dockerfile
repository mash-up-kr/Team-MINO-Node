FROM --platform=$BUILDPLATFORM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 bun install --frozen-lockfile

COPY --parents tsconfig.json tsconfig.build.json nest-cli.json scripts src ./

ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) BUN_TARGET=bun-linux-x64 ;; \
      arm64) BUN_TARGET=bun-linux-arm64 ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && bun run build "$BUN_TARGET"

FROM gcr.io/distroless/base-debian13:nonroot AS runtime

WORKDIR /app
COPY --link --from=builder /app/dist/server /app/server

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/app/server"]
