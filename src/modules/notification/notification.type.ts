export type NotificationItemResponse = {
  id: string;
  typeLabel: string;
  targetName: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  /** 서버가 완성한 유니버설 링크. 스킴·경로는 모바일과 협의 확정 전이라 잠정이다. */
  url: string;
};
