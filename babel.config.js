// Scoped, via jest's own transform map (package.json), to only
// node_modules/@scaleway/**/*.js - those packages ship pure ESM with no
// CJS build, which Jest's own CJS-based module loader can't require()
// (unlike plain Node/Bun, which support synchronous require(esm) natively -
// see docs/fixing-plan.md and CLAUDE.md's SDK migration notes). This repo's
// own .ts/.js source is untouched by this config; ts-jest still handles it.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
