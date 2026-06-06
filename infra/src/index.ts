import { service } from "@/resources/cloud-run";
import { developer, serverServiceAccount } from "@/resources/identity";

export {
  infraServiceAccount as ciServiceAccount,
  workloadIdentityProvider,
} from "@/resources/ci";
export { repositoryUrl } from "@/resources/registry";

export const serviceUrl = service.uri;
export const developerEmail = developer.email;
export const serverServiceAccountEmail = serverServiceAccount.email;
