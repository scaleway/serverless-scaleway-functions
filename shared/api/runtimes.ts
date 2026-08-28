import type { Functionv1beta1 } from "@scaleway/sdk-function";

export type Runtime = Functionv1beta1.Runtime;

interface RuntimesSdkContext {
  sdkApi: Pick<Functionv1beta1.API, "listFunctionRuntimes">;
}

export async function listRuntimes(
  this: RuntimesSdkContext,
): Promise<Runtime[]> {
  const response = await this.sdkApi.listFunctionRuntimes();
  return response.runtimes;
}
