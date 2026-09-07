// `import X = require("Y")` rather than `import X from "Y"`, deliberately:
// this file (like every other file exporting a single class/value via
// `export =`) needs to stay loadable by Bun's transpiler, which rejects an
// ES `import ... from` statement combined with `export =` in the same file
// - see docs/fixing-plan.md M7. `import X = require(...)` compiles to a
// plain CJS require() (no ES import syntax in the output), so it doesn't
// trip that check, while still giving real type inference - unlike a bare
// `const X = require("Y")`, which TypeScript can only type as `any`.
// `export =` itself has to stay: it's what makes `require("this-plugin")`
// return the class directly, which the Serverless Framework's plugin loader
// (external code, not under this repo's control) requires.
import ScalewayProvider = require("./provider/scalewayProvider");
import ScalewayDeploy = require("./deploy/scalewayDeploy");
import ScalewayRemove = require("./remove/scalewayRemove");
import ScalewayInvoke = require("./invoke/scalewayInvoke");
import ScalewayJwt = require("./jwt/scalewayJwt");
import ScalewayLogs = require("./logs/scalewayLogs");
import ScalewayInfo = require("./info/scalewayInfo");
import type { Serverless } from "./shared/serverlessTypes";

class ScalewayIndex {
  serverless: Serverless;
  options: unknown;

  constructor(serverless: Serverless, options: unknown) {
    this.serverless = serverless;
    this.options = options;

    this.serverless.pluginManager.addPlugin(ScalewayProvider);
    this.serverless.pluginManager.addPlugin(ScalewayDeploy);
    this.serverless.pluginManager.addPlugin(ScalewayRemove);
    this.serverless.pluginManager.addPlugin(ScalewayInvoke);
    this.serverless.pluginManager.addPlugin(ScalewayJwt);
    this.serverless.pluginManager.addPlugin(ScalewayLogs);
    this.serverless.pluginManager.addPlugin(ScalewayInfo);
  }
}

export = ScalewayIndex;
