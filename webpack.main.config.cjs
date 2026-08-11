const { Compilation, sources } = require("webpack");

const commonJsPackageManifestPlugin = {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap(
      "CommonJsPackageManifestPlugin",
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "CommonJsPackageManifestPlugin",
            stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            compilation.emitAsset(
              "package.json",
              new sources.RawSource('{"type":"commonjs"}\n'),
            );
          },
        );
      },
    );
  },
};

module.exports = {
  entry: "./src/gui/desktop/main.ts",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
              compilerOptions: {
                module: "CommonJS",
                moduleResolution: "Node",
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    extensionAlias: {
      ".js": [".js", ".ts", ".tsx"],
    },
  },
  plugins: [commonJsPackageManifestPlugin],
};
