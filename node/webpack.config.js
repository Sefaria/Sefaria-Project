var path = require('path');
var nodeExternals = require('webpack-node-externals');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');
var DeepMerge = require('deep-merge');
var nodemon = require('nodemon');
var fs = require('fs');

var deepmerge = DeepMerge(function (target, source, key) {
    if (target instanceof Array) {
        return [].concat(target, source);
    }
    return source;
});

class WatchRunPlugin {
    apply(compiler) {
        compiler.hooks.watchRun.tap('WatchRun', (compilation) => {
            console.log('Begin compile at ' + new Date());
        });
    }
}

class CleanOldAssetsOnBuildPlugin {
    apply(compiler) {
        compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
            const newlyCreatedAssets = compilation.assets;

            const unlinked = [];
            console.log(path.resolve(buildDir + 'client'));
            fs.readdir(path.resolve(buildDir + 'client'), function (err, files) {
                if (typeof files === 'undefined') { return; }  // we've started to see cases where files is undefined on cloudbuilds. adding this here as a patch.
                files.forEach(function (file) {
                    if (!newlyCreatedAssets[file]) {
                        fs.unlink(path.resolve(buildDir + 'client/' + file), (err) => {
                          if (err) throw err;
                        });
                        unlinked.push(file);
                    }
                });
                if (unlinked.length > 0) {
                    console.log('Removed old assets from client: ', unlinked);
                }
            });
        });
    }
}

const buildDir = './static/bundles/';
var baseConfig = {
    devtool: 'source-map', //should have better performance on incremental build over `source-map`
    plugins: [
        new WatchRunPlugin(),
        new webpack.optimize.ModuleConcatenationPlugin() // puts all module code in one scope which is supposed to speed up run-time
    ],
    module: {
        rules: [
    {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
            loader: 'babel-loader',
            options: {
                presets: [
                    ['@babel/react', { runtime: 'automatic' }],
                    '@babel/preset-env'
                ],
                plugins: [
                    '@babel/plugin-transform-destructuring',
                    '@babel/plugin-proposal-object-rest-spread',
                    '@babel/plugin-transform-async-to-generator'
                ]
            }
        }
    },
    {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
    }
]
    },
    externals: {
       react: 'React',
       'react-dom': 'ReactDOM',
       jquery: 'jQuery',
       'jquery-ui': 'jQuery',
    },
    resolve: {
        unsafeCache: true,
        //tells webpack where to look for modules
        modules: ['node_modules'],
        //extensions that should be used to resolve modules
        extensions: ['.jsx', '.js'],
        fallback: {"buffer": require.resolve("buffer/") }
    },
    stats: {
        errorDetails: true,
        colors: true
    }
}


function config(overrides) {
    return deepmerge(baseConfig, overrides || {});
}


var clientConfig = config({
    context: path.resolve('./static/js'),
    entry: './client',
    mode: 'development',  // can be overriden via cli
    //externals: [/^express$/, /^request$/, /^source-map-support$/],
    output: {
        path: path.resolve(buildDir + 'client'),
        filename: 'client-[fullhash].js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.client.json'}),
        new CleanOldAssetsOnBuildPlugin(),
        /*new webpack.optimize.UglifyJsPlugin({
            sourceMap: true
        })*/
    ]
});


var serverConfig = config({
    context: path.resolve('./node'),
    entry: './server',
    target: 'node',
    mode: 'development',  // can be overriden via cli
    externals: [nodeExternals()],
    output: {
        path: path.resolve(buildDir + 'server'),
        filename: 'server-bundle.js'
    },
    //not clear if we need this. see: https://webpack.js.org/configuration/node/#node
    node: {
        __dirname: true,
        __filename: true
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.server.json'})
    ]
});


var diffConfig = config({
    context: path.resolve('./static/js'),
    entry: './diff_page',
    mode: 'development',  // can be overriden via cli
    output: {
        path: path.resolve(buildDir + 'diffPage'),
        filename: 'diffPage.js'
    }
});


var exploreConfig = config({
    context: path.resolve('./static/js'),
    entry: './explore',
    mode: 'development',  // can be overriden via cli
    externals: {
        d3: 'd3',
        sefaria: 'Sefaria',
    },
    output: {
        path: path.resolve(buildDir + 'explore'),
        filename: 'explore.js'
    }
});


var sefariajsConfig = config({
    context: path.resolve('./static/js'),
    entry: './sefaria/sefaria',
    mode: 'development',  // can be overriden via cli
    output: {
        path: path.resolve(buildDir + 'sefaria'),
        filename: 'sefaria.js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.sefaria.json'}),
    ]
});


var jsonEditorConfig = config({
    context: path.resolve('./static/js'),
    entry: './jsonEditor',
    mode: 'development',  // can be overriden via cli
    output: {
        path: path.resolve(buildDir + 'jsonEditor'),
        filename: 'jsonEditor.js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.json-editor.json'}),
    ]
});

var timelineConfig = config({
    context: path.resolve('./static/js'),
    entry: './timeline',
    mode: 'development',  // can be overriden via cli
    externals: {
        d3: 'd3',
        sefaria: 'Sefaria',
    },
    output: {
        path: path.resolve(buildDir + 'timeline'),
        filename: 'timeline.js'
    }
});

var categorizeSheetsConfig = config({
    context: path.resolve('./static/js'),
    entry: './categorize_sheets',
    mode: 'development', // can be overriden via cli
    externals: {
        d3: 'd3',
        sefaria: 'Sefaria',
    },
    output: {
        path: path.resolve(buildDir + 'categorize_sheets'),
        filename: 'categorize_sheets.js'
    }

})

var linkerV3Config = config({
    context: path.resolve('./static/js'),
    entry: './linker.v3/main',
    mode: 'development', // can be overriden via cli
    output: {
        path: path.resolve(buildDir + 'linker.v3'),
        filename: 'linker.v3.js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.linker.v3.json'}),
    ]
})

// Standalone React login/register page (spec 1602). Mounts AuthPage; relies on the
// global React/ReactDOM provided by base.html (baseConfig externals).
var loginConfig = config({
    context: path.resolve('./static/js'),
    entry: './auth/login',
    mode: 'development', // can be overriden via cli
    output: {
        path: path.resolve(buildDir + 'login'),
        filename: 'login.js'
    }
});
// Use the global Sefaria/React/ReactDOM/jQuery that base.html already loads, rather than
// bundling the heavy sefaria.js core (which self-assigns window.Sefaria — clobbering the
// real one — and has a circular dep with util.js that breaks when bundled standalone).
loginConfig.externals = [
    { react: 'React', 'react-dom': 'ReactDOM', jquery: 'jQuery', 'jquery-ui': 'jQuery' },
    function ({ context, request }, callback) {
        if (!request) { return callback(); }
        if (request === 'sefaria') { return callback(null, 'Sefaria'); }
        // Resolve relative imports against the importing module's dir, then match the core module.
        try {
            const resolved = path.resolve(context || '', request);
            if (/\/static\/js\/sefaria\/sefaria(\.js)?$/.test(resolved)) {
                return callback(null, 'Sefaria');
            }
        } catch (e) { /* fall through */ }
        callback();
    },
];

module.exports = [clientConfig, serverConfig, diffConfig, exploreConfig, sefariajsConfig, jsonEditorConfig, timelineConfig, categorizeSheetsConfig, linkerV3Config, loginConfig];
