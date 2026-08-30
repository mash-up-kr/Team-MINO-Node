import { sql } from "drizzle-orm";
import { pins } from "./pin.schema";
import { pinAccesses } from "./pin-access.schema";
import { pinComments } from "./pin-comment.schema";

/**
 * 핀을 마지막으로 열어본 시점. 한 번도 열어본 적 없으면 저장 시점을 쓴다.
 * 스와이프는 기록하지 않으므로 상세로 들어간 클릭만 묵힘(staleness)을 리셋한다.
 *
 * 상관 서브쿼리라 바깥 쿼리가 pins를 참조하고 있어야 한다.
 */
export function stalenessOfPin(userId: string) {
  return sql`coalesce(
    (select max(${pinAccesses.createdAt}) from ${pinAccesses}
     where ${pinAccesses.pinId} = ${pins.id} and ${pinAccesses.userId} = ${userId}),
    ${pins.createdAt}
  )`;
}

/** 핀의 활성 코멘트 수. stalenessOfPin과 동일하게 바깥 쿼리의 pins를 참조한다. */
export function activeCommentCount() {
  return sql<number>`(
    select count(*) from ${pinComments}
    where ${pinComments.pinId} = ${pins.id}
      and ${pinComments.deletedAt} is null
  )`;
}
