// Standard React Native Metro Bundler Configuration
const path = require('path');

module.exports = {
  projectRoot: __dirname,
  watchFolders: [path.resolve(__dirname, 'src')],
  resolver: {
    sourceExts: ['tsx', 'ts', 'jsx', 'js', 'json'],
  },
};
