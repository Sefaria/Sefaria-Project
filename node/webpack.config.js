var path = require('path');
var nodeExternals = require('webpack-node-externals');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');
var DeepMerge = require('deep-merge');
var nodemon = require('nodemon');
var WebpackOnBuildPlugin = require('on-build-webpack');
var fs = require('fs');

var deepmerge = DeepMerge(function (target, source, key) {
    if (target instanceof Array) {
        return [].concat(target, source);
    }
    return source;
});

const buildDir = './static/bundles/';
var baseConfig = {

    devtool: 'source-map', //should have better performance on incremental build over `source-map`
    plugins: [
        function () {
            this.plugin('watch-run', function (watching, callback) {
                console.log('Begin compile at ' + new Date());
                callback();
            })
        },
        new webpack.optimize.ModuleConcatenationPlugin() // puts all module code in one scope which is supposed to speed up run-time
    ],
    module: {
        loaders: [
            //a regexp that tells webpack use the following loaders on all
            //.js and .jsx files
            {
                test: /\.jsx?$/,
                //we definitely don't want babel to transpile all the files in
                //node_modules. That would take a long time.
                exclude: /node_modules/,
                //use the babel loader
                loader: 'babel-loader',
                query: {
                    //specify that we will be dealing with React code
                    presets: ['react', 'es2015'],
                    plugins: ['transform-es2015-destructuring', 'transform-object-rest-spread', 'transform-async-to-generator']
                }
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
        extensions: ['.jsx', '.js']
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
    //externals: [/^express$/, /^request$/, /^source-map-support$/],
    output: {
        path: path.resolve(buildDir + 'client'),
        filename: 'client-[hash].js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.client.json'}),
        new WebpackOnBuildPlugin(function (stats) {
            const newlyCreatedAssets = stats.compilation.assets;

            const unlinked = [];
            console.log(path.resolve(buildDir + 'client'));
            fs.readdir(path.resolve(buildDir + 'client'), function (err, files) {
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
        }),
        /*new webpack.optimize.UglifyJsPlugin({
            sourceMap: true
        })*/
    ]
});


var serverConfig = config({
    context: path.resolve('./node'),
    entry: './server',
    target: 'node',
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
    output: {
        path: path.resolve(buildDir + 'diffPage'),
        filename: 'diffPage.js'
    }
});


var exploreConfig = config({
    context: path.resolve('./static/js'),
    entry: './explore',
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
    externals: {
        d3: 'd3',
        sefaria: 'Sefaria',
    },
    output: {
        path: path.resolve(buildDir + 'timeline'),
        filename: 'timeline.js'
    },
    plugins: [
        new BundleTracker({filename: './node/webpack-stats.timeline.json'}),
    ]
});

module.exports = [clientConfig, serverConfig, diffConfig, exploreConfig, sefariajsConfig, jsonEditorConfig, timelineConfig];
