// Jest's code translator. Babel only applies the "babel" settings in package.json to this repo's own
// files, not to files inside an installed package, so packages Jest is told to translate (see
// transformIgnorePatterns in package.json, e.g. @sefaria/analytics, which ships `import`/`export`)
// would stay untranslated. Passing the same presets here applies them everywhere.
module.exports = require('babel-jest').createTransformer({
  presets: ['@babel/env', '@babel/react'],
});
