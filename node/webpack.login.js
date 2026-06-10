// Standalone build for the React login/register page (spec 1602).
// loginConfig is the last entry in the webpack.config.js array.
const configs = require('./webpack.config.js');
module.exports = configs[configs.length - 1];
