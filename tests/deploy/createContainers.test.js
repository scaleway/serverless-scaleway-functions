"use strict";

const rewire = require("rewire");
const { expect: jestExpect, describe, it } = require("@jest/globals");

const createContainers = rewire("../../deploy/lib/createContainers.js");
const adaptHealthCheckToAPI = createContainers.__get__("adaptHealthCheckToAPI");
const adaptScalingOptionToAPI = createContainers.__get__(
  "adaptScalingOptionToAPI",
);

describe("adaptHealthCheckToAPI", () => {
  it("returns null when no health check is configured", () => {
    jestExpect(adaptHealthCheckToAPI(undefined)).toBeNull();
    jestExpect(adaptHealthCheckToAPI(null)).toBeNull();
  });

  it("defaults to http when httpPath is provided and no explicit type is set", () => {
    const result = adaptHealthCheckToAPI({
      httpPath: "/healthz",
      failureThreshold: 3,
      interval: "10s",
    });

    jestExpect(result).toEqual({
      failure_threshold: 3,
      interval: "10s",
      http: { path: "/healthz" },
    });
  });

  it("defaults httpPath to '/' when type is explicitly http but no path is given", () => {
    const result = adaptHealthCheckToAPI({
      type: "http",
      failureThreshold: 1,
      interval: "5s",
    });

    jestExpect(result.http).toEqual({ path: "/" });
  });

  it("defaults to tcp when no httpPath and no explicit type are given", () => {
    const result = adaptHealthCheckToAPI({
      failureThreshold: 2,
      interval: "10s",
    });

    jestExpect(result).toEqual({
      failure_threshold: 2,
      interval: "10s",
      tcp: {},
    });
  });

  it("honors an explicit tcp type even if httpPath happens to be set", () => {
    const result = adaptHealthCheckToAPI({
      type: "tcp",
      httpPath: "/ignored",
      failureThreshold: 2,
      interval: "10s",
    });

    jestExpect(result.tcp).toEqual({});
    jestExpect(result.http).toBeUndefined();
  });
});

describe("adaptScalingOptionToAPI", () => {
  it("returns null when no scaling option is configured", () => {
    jestExpect(adaptScalingOptionToAPI(undefined)).toBeNull();
    jestExpect(adaptScalingOptionToAPI(null)).toBeNull();
    jestExpect(adaptScalingOptionToAPI({})).toBeNull();
  });

  it("maps concurrentRequests to concurrent_requests_threshold", () => {
    const result = adaptScalingOptionToAPI({
      type: "concurrentRequests",
      threshold: 42,
    });

    jestExpect(result).toEqual({ concurrent_requests_threshold: 42 });
  });

  it("maps cpuUsage to cpu_usage_threshold", () => {
    const result = adaptScalingOptionToAPI({ type: "cpuUsage", threshold: 80 });

    jestExpect(result).toEqual({ cpu_usage_threshold: 80 });
  });

  it("maps memoryUsage to memory_usage_threshold", () => {
    const result = adaptScalingOptionToAPI({
      type: "memoryUsage",
      threshold: 512,
    });

    jestExpect(result).toEqual({ memory_usage_threshold: 512 });
  });

  it("throws a clear error for an unknown scaling option type", () => {
    jestExpect(() =>
      adaptScalingOptionToAPI({ type: "bogus", threshold: 1 }),
    ).toThrow(
      /scalingOption.type must be one of: concurrentRequests, cpuUsage, memoryUsage/,
    );
  });
});

describe("updateSingleContainer", () => {
  function baseCtx() {
    return {
      serverless: { cli: { log: () => {} } },
      namespace: { registry_endpoint: "rg.fr-par.scw.cloud/ns-example" },
      applyDomainsContainer: () => Promise.resolve(),
      updateContainer: (id, params) =>
        Promise.resolve({ id, status: "ready", params }),
      deployContainer: (id) => Promise.resolve({ id, status: "deploying" }),
    };
  }

  it("clears private_network_id when it was set on the API but removed from serverless.yml", async () => {
    const ctx = baseCtx();
    let capturedParams;
    ctx.updateContainer = (id, params) => {
      capturedParams = params;
      return Promise.resolve({ id, status: "ready" });
    };

    await createContainers.updateSingleContainer.call(
      ctx,
      { name: "first", privateNetworkId: undefined, registryImage: "img" },
      {
        id: "container-1",
        private_network_id: "pn-1",
        secret_environment_variables: [],
      },
    );

    jestExpect(capturedParams.private_network_id).toEqual("");
  });

  it("keeps the configured private_network_id when still set in serverless.yml", async () => {
    const ctx = baseCtx();
    let capturedParams;
    ctx.updateContainer = (id, params) => {
      capturedParams = params;
      return Promise.resolve({ id, status: "ready" });
    };

    await createContainers.updateSingleContainer.call(
      ctx,
      { name: "first", privateNetworkId: "pn-2", registryImage: "img" },
      {
        id: "container-1",
        private_network_id: "pn-1",
        secret_environment_variables: [],
      },
    );

    jestExpect(capturedParams.private_network_id).toEqual("pn-2");
  });

  it("does not trigger a redeploy when the container is already pending/updating", async () => {
    const ctx = baseCtx();
    ctx.updateContainer = () =>
      Promise.resolve({ id: "container-1", status: "pending" });
    ctx.deployContainer = jest.fn();

    const result = await createContainers.updateSingleContainer.call(
      ctx,
      { name: "first", registryImage: "img" },
      { id: "container-1", secret_environment_variables: [] },
    );

    jestExpect(ctx.deployContainer).not.toHaveBeenCalled();
    jestExpect(result).toEqual({ id: "container-1", status: "pending" });
  });

  it("triggers a redeploy when the container update settles into a final status", async () => {
    const ctx = baseCtx();
    ctx.updateContainer = () =>
      Promise.resolve({ id: "container-1", status: "ready" });
    ctx.deployContainer = jest.fn(() =>
      Promise.resolve({ id: "container-1", status: "deploying" }),
    );

    const result = await createContainers.updateSingleContainer.call(
      ctx,
      { name: "first", registryImage: "img" },
      { id: "container-1", secret_environment_variables: [] },
    );

    jestExpect(ctx.deployContainer).toHaveBeenCalledWith("container-1");
    jestExpect(result).toEqual({ id: "container-1", status: "deploying" });
  });
});
