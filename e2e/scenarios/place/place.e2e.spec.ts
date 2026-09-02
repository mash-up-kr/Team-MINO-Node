import { afterAll, beforeAll, beforeEach, describe } from "bun:test";
import { PlaceE2eHarness } from "./place.e2e.helpers";
import { registerPublicPlaceScenarios } from "./place.public.scenarios";
import {
  registerDuplicateNotificationScenarios,
  registerWorkerPlaceScenarios,
} from "./place.worker.scenarios";

const harness = new PlaceE2eHarness();

beforeAll(() => harness.setup(), 30_000);
beforeEach(() => harness.reset());
afterAll(() => harness.close(), 30_000);

describe("방 핀 추출 enqueue와 worker", () => {
  registerPublicPlaceScenarios(harness);
  registerWorkerPlaceScenarios(harness);
  registerDuplicateNotificationScenarios(harness);
});
