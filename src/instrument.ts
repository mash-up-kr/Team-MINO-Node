import * as Sentry from "@sentry/bun";
import { initializeSentry } from "./config/sentry.config";

initializeSentry(process.env, Sentry.init);
