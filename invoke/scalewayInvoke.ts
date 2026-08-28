// import X = require("Y") throughout - see the comment at the top of
// index.ts for why. axios itself ships an ESM `export default` (not
// `export =`) in its type declarations even though its actual CJS build
// (what require() resolves to at runtime, verified directly) exports the
// callable axios object bare - `import axios = require("axios")` would
// type-check against the ESM-shaped declarations and miss real methods
// like `.get`, so the runtime value is asserted against axios's own
// AxiosStatic type instead of trusting import X = require()'s inference.
import type { AxiosStatic } from "axios";
import axiosModule = require("axios");
const axios = axiosModule as unknown as AxiosStatic;
import os = require("os");
const { EOL } = os;

import scalewayApi = require("../shared/api/endpoint");
import setUpDeployment = require("../shared/setUpDeployment");
import validate = require("../shared/validate");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface InvokeOptions {
  function?: string;
  [key: string]: unknown;
}

interface ApplicationRecord {
  name: string;
  domain_name: string;
  [key: string]: unknown;
}

interface Namespace {
  id: string;
  [key: string]: unknown;
}

class ScalewayInvoke {
  serverless: Serverless;
  options: InvokeOptions;
  provider: ScalewayProvider;
  isContainer = false;
  isFunction = false;
  hooks: Record<string, () => Promise<unknown>>;

  // Mixed in via Object.assign below at construction time (validate.ts,
  // setUpDeployment.ts, and whichever of FunctionApi/ContainerApi's own
  // mixed-in methods shared/api/endpoint.js selected) - declared here,
  // with a definite-assignment assertion, purely so the type checker knows
  // about them; only the methods this file actually calls are listed.
  validate!: () => Promise<void>;
  setUpDeployment!: () => void;
  namespaceName!: string;
  isDefinedContainer!: (name: string) => boolean;
  isDefinedFunction!: (name: string) => boolean;
  getNamespaceFromList!: (
    namespaceName: string,
    projectId: string | undefined,
  ) => Promise<Namespace>;
  listContainers!: (namespaceId: string) => Promise<ApplicationRecord[]>;
  listFunctions!: (namespaceId: string) => Promise<ApplicationRecord[]>;

  constructor(serverless: Serverless, options: InvokeOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, validate, setUpDeployment, api);

    this.isContainer = false;
    this.isFunction = false;

    const validateFunctionOrContainer = (): void => {
      // Check the user has specified a name, and that it's defined as either a function or container
      if (!this.options.function) {
        const msg = "Function or container not specified";
        this.serverless.cli.log(msg);
        throw new Error(msg);
      }

      this.isContainer = this.isDefinedContainer(this.options.function);
      this.isFunction = this.isDefinedFunction(this.options.function);

      if (!this.isContainer && !this.isFunction) {
        const msg = `Function or container ${this.options.function} not defined in serverless.yml`;
        this.serverless.cli.log(msg);
        throw new Error(msg);
      }
    };

    const lookUpFunctionOrContainer = (
      ns: Namespace,
    ): Promise<ApplicationRecord[]> => {
      // List containers/functions in the namespace
      if (this.isContainer) {
        return this.listContainers(ns.id);
      } else {
        return this.listFunctions(ns.id);
      }
    };

    const doInvoke = (found: ApplicationRecord[]): Promise<void> => {
      // Filter on name
      const func = found.find((f) => f.name === this.options.function);

      if (!func) {
        const msg = `${this.options.function} is not deployed yet, run "serverless deploy" first`;
        this.serverless.cli.log(msg);
        throw new Error(msg);
      }

      const url = "https://" + func.domain_name;

      // Invoke
      return axios
        .get(url)
        .then((res) => {
          // Make sure we write to stdout here to ensure we can capture output
          process.stdout.write(JSON.stringify(res.data));
        })
        .catch((error) => {
          process.stderr.write(error.toString() + EOL);
        });
    };

    this.hooks = {
      "before:invoke:invoke": async () => {
        await this.setUpDeployment();
        return this.validate();
      },
      "invoke:invoke": async () => {
        validateFunctionOrContainer();
        const ns = await this.getNamespaceFromList(
          this.namespaceName,
          this.provider.getScwProject(),
        );
        const found = await lookUpFunctionOrContainer(ns);
        return doInvoke(found);
      },
    };
  }
}

export = ScalewayInvoke;
