export type PushPayload = {
  title: string;
  body: string;
  /** FCM data payload는 값이 전부 string이어야 한다. */
  data?: Record<string, string>;
};
