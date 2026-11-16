/* Testing done using Jest */
// Browser-served bundles must not publish source maps: the map is only reachable through
// the sourceMappingURL comment, so client configs use hidden maps. The Node server bundle keeps
// its map for source-map-support stack traces; nginx refuses to serve that directory.
const webpackConfigs = require("../../../node/webpack.config.js");

describe("webpack source map publishing", function () {
  const clientConfigs = webpackConfigs.filter((config) => config.target !== "node");
  const serverConfigs = webpackConfigs.filter((config) => config.target === "node");

  it("covers every config in the build", function () {
    expect(clientConfigs.length).toBeGreaterThan(0);
    expect(serverConfigs.length).toBe(1);
  });

  it.each(clientConfigs.filter((config) => config.output.filename !== "linker.v3.js").map((config) => [config.output.filename, config]))(
    "%s does not reference a public source map",
    function (_filename, config) {
      expect(["hidden-source-map", false]).toContain(config.devtool);
    }
  );

  it("keeps the server bundle map for stack traces", function () {
    expect(serverConfigs[0].devtool).toBe("source-map");
  });

  it("keeps the linker map public for partner debugging", function () {
    const linkerConfig = clientConfigs.find((config) => config.output.filename === "linker.v3.js");
    expect(linkerConfig.devtool).toBe("source-map");
  });
});
