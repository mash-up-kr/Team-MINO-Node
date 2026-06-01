import { service } from "@/resources/cloud-run";
import { developer, serverServiceAccount } from "@/resources/identity";
export { repositoryUrl } from "@/resources/registry";
export {
  workloadIdentityProvider,
  infraServiceAccount as ciServiceAccount,
} from "@/resources/ci";

export const serviceUrl = service.uri;
export const developerEmail = developer.email;
export const serverServiceAccountEmail = serverServiceAccount.email;
