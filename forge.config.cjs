module.exports = {
  packagerConfig: {},
  rebuildConfig: {},
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        mainConfig: "./webpack.main.config.cjs",
        renderer: {
          config: "./webpack.renderer.config.cjs",
          entryPoints: [
            {
              html: "./src/gui/desktop/index.html",
              js: "./src/gui/desktop/renderer.tsx",
              name: "main_window",
              preload: {
                js: "./src/gui/desktop/preload.ts",
              },
            },
          ],
        },
      },
    },
  ],
};
