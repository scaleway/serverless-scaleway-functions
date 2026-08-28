import { getApiManager } from "./utils";
import { ApiManagerContext } from "./types";
import accountApi = require("./account");
import domainApi = require("./domain");
import namespacesApi = require("./namespaces");
import functionsApi = require("./functions");
import containersApi = require("./containers");
import triggersApi = require("./triggers");
import jwtApi = require("./jwt");
import logsApi = require("./logs");
import runtimesApi = require("./runtimes");
import RegistryApi = require("./registry");
import sdkClient = require("./sdkClient");
const { createScalewayClientFromResourceUrl, createLazySdkApi } = sdkClient;
import { Accountv3 } from "@scaleway/sdk-account";
import { Functionv1beta1 } from "@scaleway/sdk-function";
import { Containerv1beta1 } from "@scaleway/sdk-container";

// interface ... extends only accepts a named type reference, not a `typeof`
// expression directly - these aliases exist purely so the declaration merges
// below have something to extend.
type AccountMixin = typeof accountApi;
type DomainMixin = typeof domainApi;
type NamespacesMixin = typeof namespacesApi;
type FunctionsMixin = typeof functionsApi;
type ContainersMixin = typeof containersApi;
type TriggersMixin = typeof triggersApi;
type JwtMixin = typeof jwtApi;
type LogsMixin = typeof logsApi;
type RuntimesMixin = typeof runtimesApi;

// Each of these classes' methods come entirely from Object.assign()-ing the
// mixin modules above onto `this` at construction time - TypeScript can't
// see through a dynamic Object.assign call, so the class body alone would
// only type-check as having `apiManager`. The declaration-merged interface
// right after each class (same name, `extends` the mixin module types) adds
// the rest of the surface to the class's *type*, the same way the
// definite-assignment-assertion pattern used elsewhere in this migration
// documents a runtime guarantee TypeScript can't verify on its own - not
// enforced, just asserted, because Object.assign really does add exactly
// these members every time these constructors run.
class AccountApi implements ApiManagerContext {
  apiManager: ApiManagerContext["apiManager"];
  sdkApi: Accountv3.ProjectAPI;

  constructor(apiUrl: string, token: string) {
    this.apiManager = getApiManager(apiUrl, token);
    // Lazy plain-value Proxy, not a `get sdkApi()` accessor - see the long
    // comment on createLazySdkApi in sdkClient.ts for why: this class gets
    // mixed onto the plugin classes via Object.assign, which only copies
    // own enumerable *values* (invoking and flattening any accessor at copy
    // time) and never even sees prototype-level accessors at all. A plain
    // Proxy value survives that copy correctly while still deferring the
    // real SDK client's construction (and its secret-key format validation)
    // until a method is actually called on it.
    this.sdkApi = createLazySdkApi(
      () =>
        new Accountv3.ProjectAPI(
          createScalewayClientFromResourceUrl(apiUrl, token),
        ),
    );
    Object.assign(this, accountApi);
  }
}
interface AccountApi extends AccountMixin {}

class FunctionApi implements ApiManagerContext {
  apiManager: ApiManagerContext["apiManager"];
  sdkApi: Functionv1beta1.API;

  constructor(apiUrl: string, token: string) {
    this.apiManager = getApiManager(apiUrl, token);
    // Lazy plain-value Proxy - see AccountApi's constructor comment above.
    this.sdkApi = createLazySdkApi(
      () =>
        new Functionv1beta1.API(
          createScalewayClientFromResourceUrl(apiUrl, token),
        ),
    );
    Object.assign(
      this,
      accountApi,
      domainApi,
      namespacesApi,
      functionsApi,
      triggersApi,
      jwtApi,
      logsApi,
      runtimesApi,
    );
  }
}
interface FunctionApi
  extends
    AccountMixin,
    DomainMixin,
    NamespacesMixin,
    FunctionsMixin,
    TriggersMixin,
    JwtMixin,
    LogsMixin,
    RuntimesMixin {}

class ContainerApi implements ApiManagerContext {
  apiManager: ApiManagerContext["apiManager"];
  sdkApi: Containerv1beta1.API;

  constructor(apiUrl: string, token: string) {
    this.apiManager = getApiManager(apiUrl, token);
    // Lazy plain-value Proxy - see AccountApi's constructor comment above.
    this.sdkApi = createLazySdkApi(
      () =>
        new Containerv1beta1.API(
          createScalewayClientFromResourceUrl(apiUrl, token),
        ),
    );
    Object.assign(
      this,
      accountApi,
      domainApi,
      namespacesApi,
      containersApi,
      triggersApi,
      jwtApi,
      logsApi,
    );
  }
}
interface ContainerApi
  extends
    AccountMixin,
    DomainMixin,
    NamespacesMixin,
    ContainersMixin,
    TriggersMixin,
    JwtMixin,
    LogsMixin {}

export { getApiManager, AccountApi, FunctionApi, ContainerApi, RegistryApi };
