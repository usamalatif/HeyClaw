const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // react-native-iap's "react-native" field points to TS source which has
    // resolution issues in the monorepo symlink setup. Redirect to compiled JS.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react-native-iap') {
        return context.resolveRequest(
          context,
          'react-native-iap/lib/commonjs/index',
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
