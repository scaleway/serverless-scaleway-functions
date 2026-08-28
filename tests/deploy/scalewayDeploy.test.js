"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const ScalewayDeploy = require("../../deploy/scalewayDeploy");
const ScalewayProvider = require("../../provider/scalewayProvider");

function makeServerless({ functions, containers } = {}) {
  const providers = {};
  return {
    service: {
      functions: functions || {},
      custom: containers ? { containers } : {},
      provider: {},
    },
    config: {},
    configurationInput: {},
    cli: { log: () => {} },
    setProvider: (name, provider) => {
      providers[name] = provider;
    },
    getProvider: (name) => providers[name],
  };
}

function makeDeploy(config) {
  const serverless = makeServerless(config);
  serverless.setProvider("scaleway", new ScalewayProvider(serverless));

  const options = {
    "scw-token": "a".repeat(36),
    "scw-project": "b".repeat(36),
  };

  const deploy = new ScalewayDeploy(serverless, options);
  deploy.serverless.cli.log = () => {};
  return deploy;
}

function stubStep(deploy, order, name, resultKey) {
  deploy[name] = (...args) => {
    order.push(name);
    return Promise.resolve(resultKey ? { [resultKey]: true } : undefined);
  };
}

describe("scalewayDeploy: before:deploy:deploy hook", () => {
  it("calls setUpDeployment then validate, in order", async () => {
    const deploy = makeDeploy({ functions: { first: {} } });
    const order = [];
    stubStep(deploy, order, "setUpDeployment");
    stubStep(deploy, order, "validate");

    await deploy.hooks["before:deploy:deploy"]();

    jestExpect(order).toEqual(["setUpDeployment", "validate"]);
  });

  it("propagates a validate failure instead of swallowing it", async () => {
    const deploy = makeDeploy({ functions: { first: {} } });
    deploy.setUpDeployment = () => Promise.resolve();
    deploy.validate = () => Promise.reject(new Error("invalid config"));

    await jestExpect(deploy.hooks["before:deploy:deploy"]()).rejects.toThrow(
      "invalid config",
    );
  });
});

describe("scalewayDeploy: deploy:deploy hook", () => {
  it("runs namespace setup, then the functions chain, then triggers, for a functions-only service", async () => {
    const deploy = makeDeploy({ functions: { first: {} } });
    const order = [];
    stubStep(deploy, order, "createServerlessNamespace");
    stubStep(deploy, order, "updateServerlessNamespace");
    stubStep(deploy, order, "createFunctions");
    stubStep(deploy, order, "uploadCode");
    stubStep(deploy, order, "deployFunctions");
    stubStep(deploy, order, "deployTriggers");
    deploy.buildAndPushContainers = () => {
      order.push("buildAndPushContainers");
      return Promise.resolve();
    };
    deploy.createContainers = () => {
      order.push("createContainers");
      return Promise.resolve();
    };
    deploy.deployContainers = () => {
      order.push("deployContainers");
      return Promise.resolve();
    };

    await deploy.hooks["deploy:deploy"]();

    jestExpect(order).toEqual([
      "createServerlessNamespace",
      "updateServerlessNamespace",
      "createFunctions",
      "uploadCode",
      "deployFunctions",
      "deployTriggers",
    ]);
  });

  it("runs the containers chain instead of the functions chain for a containers-only service", async () => {
    const deploy = makeDeploy({ containers: { web: {} } });
    const order = [];
    stubStep(deploy, order, "createServerlessNamespace");
    stubStep(deploy, order, "updateServerlessNamespace");
    stubStep(deploy, order, "buildAndPushContainers");
    stubStep(deploy, order, "createContainers");
    stubStep(deploy, order, "deployContainers");
    stubStep(deploy, order, "deployTriggers");
    deploy.createFunctions = () => {
      order.push("createFunctions");
      return Promise.resolve();
    };
    deploy.uploadCode = () => {
      order.push("uploadCode");
      return Promise.resolve();
    };
    deploy.deployFunctions = () => {
      order.push("deployFunctions");
      return Promise.resolve();
    };

    await deploy.hooks["deploy:deploy"]();

    jestExpect(order).toEqual([
      "createServerlessNamespace",
      "updateServerlessNamespace",
      "buildAndPushContainers",
      "createContainers",
      "deployContainers",
      "deployTriggers",
    ]);
  });

  it("runs neither chain when there is nothing configured, but still reaches deployTriggers", async () => {
    const deploy = makeDeploy({});
    const order = [];
    stubStep(deploy, order, "createServerlessNamespace");
    stubStep(deploy, order, "updateServerlessNamespace");
    stubStep(deploy, order, "deployTriggers");
    deploy.buildAndPushContainers =
      deploy.createContainers =
      deploy.deployContainers =
        () => {
          order.push("containers-chain");
          return Promise.resolve();
        };
    deploy.createFunctions =
      deploy.uploadCode =
      deploy.deployFunctions =
        () => {
          order.push("functions-chain");
          return Promise.resolve();
        };

    await deploy.hooks["deploy:deploy"]();

    jestExpect(order).toEqual([
      "createServerlessNamespace",
      "updateServerlessNamespace",
      "deployTriggers",
    ]);
  });

  it("propagates a failure from the functions chain instead of continuing to deployTriggers", async () => {
    const deploy = makeDeploy({ functions: { first: {} } });
    deploy.createServerlessNamespace = () => Promise.resolve();
    deploy.updateServerlessNamespace = () => Promise.resolve();
    deploy.createFunctions = () => Promise.reject(new Error("create failed"));
    let triggersCalled = false;
    deploy.deployTriggers = () => {
      triggersCalled = true;
      return Promise.resolve();
    };

    await jestExpect(deploy.hooks["deploy:deploy"]()).rejects.toThrow(
      "create failed",
    );
    jestExpect(triggersCalled).toBe(false);
  });
});
