// import X = require("Y") - see the comment at the top of index.ts for why.
import log = require("@serverless/utils/log");
const { writeText, style } = log;

type ServiceOutputs = Iterable<[string, string | string[]]>;

export = (serviceOutputs: ServiceOutputs): void => {
  for (const [section, entries] of serviceOutputs) {
    if (typeof entries === "string") {
      writeText(`${style.aside(`${section}:`)} ${entries}`);
    } else {
      writeText(`${style.aside(`${section}:\n`)}  ${entries.join("\n  ")}`);
    }
  }
};
