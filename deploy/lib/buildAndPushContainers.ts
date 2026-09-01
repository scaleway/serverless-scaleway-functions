// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import Docker = require("dockerode");
import path = require("path");
import fs = require("fs");
import ignore = require("ignore");
import ScalewayProvider = require("../../provider/scalewayProvider");
import type { Serverless } from "../../shared/serverlessTypes";

const docker = new Docker();

function extractStreamContents(
  stream: NodeJS.ReadableStream,
  verbose: unknown,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const streamContent: string[] = [];

    stream.on("data", (data: Buffer) => {
      const streamData = data.toString().replace("\n", "");
      streamContent.push(streamData);

      if (verbose) {
        console.log(streamData);
      }
    });

    stream.on("end", () => {
      resolve(streamContent);
    });
    stream.on("error", reject);
  });
}

function findErrorInBuildOutput(buildOutput: string[]): string | undefined {
  for (const buildStepLog of buildOutput) {
    if (buildStepLog.startsWith('{"errorDetail":{')) {
      let errorDetail;
      try {
        errorDetail = JSON.parse(buildStepLog)["errorDetail"];
      } catch {
        return "";
      }

      if (errorDetail !== undefined && errorDetail["message"] !== undefined) {
        return errorDetail["message"];
      }

      return JSON.stringify(errorDetail);
    }
  }
  return undefined;
}

function getFilesInBuildContextDirectory(directory: string): string[] {
  let files: string[] = [];

  try {
    const dirents = fs.readdirSync(directory, { withFileTypes: true });

    dirents.forEach((dirent) => {
      const absolutePath = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        const subFiles = getFilesInBuildContextDirectory(absolutePath);

        // Prepend the current directory name to each subfile path
        const relativeSubFiles = subFiles.map((subFile) =>
          path.join(dirent.name, subFile),
        );
        files = files.concat(relativeSubFiles);
      } else if (dirent.isFile() && dirent.name !== ".dockerignore") {
        // Don't include .dockerignore file in result
        files.push(dirent.name);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${directory}:`, err);
  }

  return files;
}

function filterFilesWithDockerignore(
  directory: string,
  files: string[],
): string[] {
  const dockerignorePath = path.join(directory, ".dockerignore");

  if (!fs.existsSync(dockerignorePath)) {
    return files;
  }

  const patterns = fs.readFileSync(dockerignorePath, "utf8").split(/\r?\n/);
  const ig = ignore().add(patterns);

  // Patterns in .dockerignore are matched against POSIX-style relative
  // paths, regardless of the host OS path separator.
  return files.filter((file) => !ig.ignores(file.split(path.sep).join("/")));
}

interface ContainerConfig {
  name: string;
  directory?: string;
  buildArgs?: Record<string, string>;
  [key: string]: unknown;
}

function validateContainerConfigBeforeBuild(
  containerConfig: ContainerConfig,
): void {
  const { name, buildArgs } = containerConfig;

  if (buildArgs !== undefined && typeof buildArgs !== "object") {
    throw new Error(
      `Build arguments for container ${name} should be an object.
          Example:
          containers:
            ${name}:
              directory: my-container-directory
              buildArgs:
                MY_BUILD_ARG: "my-value"
          `,
    );
  }
}

interface BuildContext {
  namespace: { registry_endpoint?: string };
  serverless: Serverless;
  provider: ScalewayProvider;
}

async function buildAndPushContainer(
  this: BuildContext,
  registryAuth: Record<string, { username: string; password: string }>,
  authConfig: { username: string; password: string },
  containerConfig: ContainerConfig,
): Promise<void> {
  const { name, directory, buildArgs } = containerConfig;
  const imageName = `${this.namespace.registry_endpoint}/${name}:latest`;

  this.serverless.cli.log(
    `Building and pushing container ${name} to: ${imageName} ...`,
  );

  const buildOptions: Docker.ImageBuildOptions = {
    t: imageName,
    registryconfig: registryAuth,
  };

  if (buildArgs !== undefined) {
    buildOptions.buildargs = buildArgs;
  }

  const buildStream = await docker.buildImage(
    {
      context: directory!,
      src: filterFilesWithDockerignore(
        directory!,
        getFilesInBuildContextDirectory(directory!),
      ),
    },
    buildOptions,
  );
  const buildStreamEvents = await extractStreamContents(
    buildStream,
    this.provider.options!.verbose,
  );

  const buildError = findErrorInBuildOutput(buildStreamEvents);
  if (buildError !== undefined) {
    throw new Error(
      `Build did not succeed for container ${name}, error: ${buildError}`,
    );
  }

  const image = docker.getImage(imageName);

  const inspectedImage = await image.inspect().catch(() => {
    throw new Error(
      `Image ${imageName} does not exist: run --verbose to see errors`,
    );
  });

  if (inspectedImage["Architecture"] !== "amd64") {
    throw new Error(
      "It appears that image have been built with " +
        inspectedImage["Architecture"] +
        " architecture. " +
        "To build a compatible image with Scaleway serverless containers, " +
        "the platform of the built image must be `linux/amd64`. " +
        "Please pull your image's base image with platform `linux/amd64`: " +
        "first (`docker pull --platform=linux/amd64 <your_base_image>`), " +
        "and just after, run `serverless deploy`. You shouldn't pull the other " +
        "image architecture between those two steps.",
    );
  }

  const pushStream = await image.push({ authconfig: authConfig });
  await extractStreamContents(pushStream, this.provider.options!.verbose);
}

interface BuildAndPushContainersContext extends BuildContext {
  buildAndPushContainers(): Promise<void>;
}

const exportedBuild = {
  async buildAndPushContainers(this: BuildAndPushContainersContext) {
    const auth = {
      username: "any",
      password: this.provider.scwToken!,
    };

    // Used for building, see https://docs.docker.com/engine/api/v1.37/#tag/Image/operation/ImageBuild
    const registryAuth = { [`rg.${this.provider.scwRegion}.scw.cloud`]: auth };

    try {
      await docker.checkAuth(registryAuth);
    } catch (err) {
      throw new Error(`Docker error : ${err}`, { cause: err });
    }

    const { containers } = this.provider.serverless.service.custom!;

    const buildPromises = Object.keys(containers!)
      .map((containerName) => {
        const containerConfig: ContainerConfig = {
          ...containers![containerName],
          name: containerName,
        };
        return containerConfig;
      })
      // If directory is not specified, the container does not need to be built,
      // we can directly create it from the registry image.
      .filter((containerConfig) => containerConfig.directory !== undefined)
      .map((containerConfig) => {
        validateContainerConfigBeforeBuild(containerConfig);

        return buildAndPushContainer.call(
          this,
          registryAuth,
          auth,
          containerConfig,
        );
      });

    await Promise.all(buildPromises);
  },
};

export = exportedBuild;

// Exposed non-enumerably so tests can reach these pure helpers directly via
// require() instead of rewire()'s __get__ - see the identical comment in
// deploy/lib/createContainers.ts for why. Non-enumerable so Object.assign
// (this, ...) in deploy/scalewayDeploy.ts's mixin doesn't pick these up.
Object.defineProperties(exportedBuild, {
  extractStreamContents: { value: extractStreamContents, enumerable: false },
  findErrorInBuildOutput: {
    value: findErrorInBuildOutput,
    enumerable: false,
  },
  getFilesInBuildContextDirectory: {
    value: getFilesInBuildContextDirectory,
    enumerable: false,
  },
  filterFilesWithDockerignore: {
    value: filterFilesWithDockerignore,
    enumerable: false,
  },
});
