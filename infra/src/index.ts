import { service } from "@/resources/cloud-run";
import { developer, serverServiceAccount } from "@/resources/identity";
import { localEnvSecret, prodEnvSecret } from "@/resources/secrets";
import {
  placeExtractionQueue,
  taskInvokerServiceAccount,
} from "@/resources/tasks";

export {
  infraServiceAccount as ciServiceAccount,
  workloadIdentityProvider,
} from "@/resources/ci";
export { repositoryUrl } from "@/resources/registry";

export const serviceUrl = service.uri;
export const developerEmail = developer.email;
export const serverServiceAccountEmail = serverServiceAccount.email;
export const prodEnvSecretId = prodEnvSecret.secretId;
export const localEnvSecretId = localEnvSecret.secretId;
export const placeExtractionQueueId = placeExtractionQueue.id;
export const taskInvokerServiceAccountEmail = taskInvokerServiceAccount.email;
