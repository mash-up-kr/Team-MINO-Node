import type { NotificationType } from "./notification.schema";

export type NotificationItemResponse = {
  id: string;
  /** 클라이언트가 탭 도착지를 가르는 기준 — 장소 상세 / 방 상세 / 저장 오류 안내. */
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  /** 서버가 완성한 유니버설 링크. 스킴·경로는 모바일과 협의 확정 전이라 잠정이다. */
  url: string;
};
