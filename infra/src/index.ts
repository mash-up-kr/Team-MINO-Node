import { service } from "@/resources/cloud-run";
import { customDomain } from "@/resources/hosting";
import { developer, serverServiceAccount } from "@/resources/identity";
import { dbKeepAliveJob } from "@/resources/scheduler";
import { localEnvSecret, prodEnvSecret } from "@/resources/secrets";
import {
  placeImagesLocalBucket,
  placeImagesProdBucket,
} from "@/resources/storage";
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
export const dbKeepAliveJobName = dbKeepAliveJob.name;
export const placeExtractionQueueId = placeExtractionQueue.id;
export const taskInvokerServiceAccountEmail = taskInvokerServiceAccount.email;
export const placeImagesLocalBucketName = placeImagesLocalBucket.name;
export const placeImagesProdBucketName = placeImagesProdBucket.name;
export const customDomainDnsUpdates = customDomain.requiredDnsUpdates;
