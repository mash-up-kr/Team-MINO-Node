# Team MINO Node

NestJS 기반 Team MINO 백엔드 API 서버입니다.

## Requirements

- Bun 1.3.x
- Docker

## Setup Guide

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

기본 로컬 DB 연결 정보는 아래 값입니다.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/team_mino
```

### 3. Start Local Database

```bash
docker compose up -d postgres
```

컨테이너 상태를 확인합니다.

```bash
docker compose ps
```

### 4. Start Local Server

```bash
bun run start:local
```

서버 기본 포트는 `3000`입니다.

```text
http://localhost:3000
```

`start:local`은 `CLOUD_TASKS_MODE=local`을 주입합니다. 이 모드에서는 장소 추출 job 생성 시 실제 GCP Cloud Tasks에 enqueue하지 않고, 로컬 non-production 서버에서만 worker OIDC guard를 우회합니다. 운영(`NODE_ENV=production`)에서는 이 모드를 사용할 수 없습니다.

### 5. Check Health API

```bash
curl http://localhost:3000/health
```

정상 응답은 아래와 같습니다.

```json
{
  "status": "ok"
}
```

## Available Scripts

```bash
bun run start:dev
bun run build
bun run check
bun run lint
bun run format
bun run test
```

`bun run test`는 e2e 테스트를 포함하므로, 실행 전 PostgreSQL 컨테이너가 필요합니다.

```bash
docker compose up -d postgres
```

## API Docs

개발 서버 실행 후 Swagger 문서는 아래 경로에서 확인할 수 있습니다.

```text
http://localhost:3000/api-docs
```

## Local Place Worker with Postman

로컬에서 비동기 장소 추출 worker까지 확인하는 흐름입니다.

1. 서버를 실행합니다.

```bash
bun run start:local
```

2. Postman에서 job을 만듭니다.

```http
POST http://localhost:3000/api/v1/place/places
Content-Type: application/json

{
  "method": "instagram_url",
  "data": {
    "url": "https://www.instagram.com/p/{shortcode}/"
  }
}
```

응답의 `jobId`를 복사합니다. `start:local`에서는 여기서 GCP Cloud Tasks enqueue가 발생하지 않습니다.

3. Postman에서 worker를 직접 실행합니다.

```http
POST http://localhost:3000/internal/place/jobs/{jobId}/process
```

`start:local`의 local 모드에서만 OIDC guard가 우회됩니다. 운영에서는 Cloud Tasks OIDC 토큰이 계속 필요합니다.

4. 결과를 조회합니다.

```http
GET http://localhost:3000/api/v1/place/jobs/{jobId}
```

## Database

로컬 PostgreSQL은 Docker Compose로 실행합니다.

```bash
docker compose up -d postgres
docker compose down
```

Drizzle 설정은 `drizzle.config.ts`를 사용합니다.

```bash
bun run db:generate
bun run db:migrate
bun run db:push
```
