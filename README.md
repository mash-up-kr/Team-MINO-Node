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

### 4. Start Development Server

```bash
bun run start:dev
```

서버 기본 포트는 `3000`입니다.

```text
http://localhost:3000
```

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

## API Docs

개발 서버 실행 후 Swagger 문서는 아래 경로에서 확인할 수 있습니다.

```text
http://localhost:3000/api-docs
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
