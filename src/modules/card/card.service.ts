import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { METRIC_LABELS, WORTH_VISITING_QUOTA } from "./card.constant";
import type { ListCardsQuery } from "./card.dto";
import { CardRepository } from "./card.repository";
import {
  type CandidateRow,
  type CardListResponse,
  type CardResponse,
  type LabelGroup,
  toCardResponse,
} from "./card.type";

function compareByStaleness(a: CandidateRow, b: CandidateRow): number {
  const diff = a.staleness.getTime() - b.staleness.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

/**
 * 후보에 라벨을 붙인다. 배정 순서는 다음과 같고, 앞 라벨이 가져간 장소는 제외된다.
 *
 * 1. `가볼 만한 곳`   — 자격 없음, 묵힌 순 4장
 * 2. `여럿이 저장한 곳` — 저장된 방 2곳 이상, 많은 순 2장
 * 3. `이야기 많은 곳`  — 코멘트 1건 이상, 많은 순 2장
 * 4. `친구들이 많이 본 곳` — 클릭 1회 이상, 많은 순 2장
 * 5. 자격 미달로 남은 자리는 `가볼 만한 곳`이 흡수한다
 *
 * 그래서 지표가 전부 0인 방(신규 방)은 전부 `가볼 만한 곳`이 되고, 라벨이 사실과
 * 어긋나는 일이 없다. 응답은 후보 정렬 순서를 그대로 유지한다 — 라벨별로 묶지 않는다.
 */
export function assignLabels(candidates: CandidateRow[]): CardResponse[] {
  const assigned = new Map<string, LabelGroup>();
  const remaining = new Set(candidates);

  const take = (rows: CandidateRow[], label: LabelGroup) => {
    for (const row of rows) {
      assigned.set(row.id, label);
      remaining.delete(row);
    }
  };

  take(
    [...remaining].sort(compareByStaleness).slice(0, WORTH_VISITING_QUOTA),
    "worthVisiting",
  );

  for (const { label, quota, min } of METRIC_LABELS) {
    take(
      [...remaining]
        .filter((row) => row[label] >= min)
        .sort((a, b) => b[label] - a[label] || compareByStaleness(a, b))
        .slice(0, quota),
      label,
    );
  }

  take([...remaining], "worthVisiting");

  return candidates.map((row) =>
    toCardResponse(row, assigned.get(row.id) as LabelGroup),
  );
}

@Injectable()
export class CardService {
  constructor(private readonly cardRepository: CardRepository) {}

  /**
   * 홈 카드 덱. `sort`로 후보 10장을 뽑아 라벨을 붙인다.
   *
   * 페이지네이션이나 "이미 본 카드 제외"는 두지 않는다. `ggukPick`은 정렬 키가
   * 마지막 접근 시점이라 열어본 핀이 스스로 뒤로 밀리고, 나머지 정렬은 매 호출마다
   * 새로 계산하면 되기 때문이다.
   */
  async listCards(
    userId: string,
    roomId: string,
    query: ListCardsQuery,
  ): Promise<CardListResponse> {
    const room = await this.cardRepository.findActiveRoomForUser(
      roomId,
      userId,
    );
    if (!room?.isMember) {
      throw new AppException(
        "NOT_ROOM_MEMBER",
        "방의 멤버가 아닙니다.",
        HttpStatus.FORBIDDEN,
      );
    }

    const candidates = await this.cardRepository.findCandidates(
      roomId,
      userId,
      query,
    );
    const { isMember: _isMember, ...roomMeta } = room;
    return { room: roomMeta, cards: assignLabels(candidates) };
  }
}
