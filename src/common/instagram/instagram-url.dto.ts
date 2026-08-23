import { HttpStatus } from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../exceptions/app.exception";

const SHORTCODE_PATH_REGEX = /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/;

export function normalizeInstagramUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidInstagramUrl();
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "instagram.com" && !host.endsWith(".instagram.com")) {
    throw invalidInstagramUrl();
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== ""
  ) {
    throw invalidInstagramUrl();
  }

  const match = parsed.pathname.match(SHORTCODE_PATH_REGEX);
  const route = match?.[1];
  const shortcode = match?.[2];
  if (
    (route !== "p" &&
      route !== "reel" &&
      route !== "reels" &&
      route !== "tv") ||
    shortcode === undefined
  ) {
    throw invalidInstagramUrl();
  }
  return `https://instagram.com/${route}/${shortcode}/`;
}

export function isInstagramUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    normalizeInstagramUrl(value);
    return true;
  } catch (error) {
    if (error instanceof AppException) return false;
    throw error;
  }
}

export const instagramUrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.check(
    (value: string) => isInstagramUrl(value),
    "지원하지 않는 인스타그램 URL입니다.",
  ),
  v.transform(normalizeInstagramUrl),
);

function invalidInstagramUrl(): AppException {
  return new AppException(
    "INVALID_INSTAGRAM_URL",
    "지원하지 않는 인스타그램 URL 입니다.",
    HttpStatus.BAD_REQUEST,
  );
}
