const configs = require('./webpack.config.js');
// The classic client and the server bundle, plus the NG mobile reader's client (its SSR is in the server bundle).
module.exports = [...configs.slice(0, 2), configs[9]];
