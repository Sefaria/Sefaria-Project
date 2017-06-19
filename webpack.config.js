var path = require('path');
var nodeExternals = require('webpack-node-externals');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');
var DeepMerge = require('deep-merge');
var nodemon = require('nodemon');

var deepmerge = DeepMerge(function(target, source, key) {
  if(target instanceof Array) { return [].concat(target, source);
	  }
  return source;
});


var base_config = {
	  watch: true,
		watchOptions: {
			aggregateTimeout: 300,
		  poll: 500	
		},
		devtool: 'source-map', //should have better performance on incremental build over `source-map`
    plugins: [
        //tells webpack where to store data about your bundles.
        new BundleTracker({filename: './webpack-stats.json'}),
        /*new webpack.ProvidePlugin({
            nodeSourceMapper: 'source-map-support'
        }),*/
				//new ExtractTextPlugin("app.css"ear
				//jc
    ],

    module: {
        loaders: [
            //a regexp that tells webpack use the following loaders on all
            //.js and .jsx files
            {test: /\.jsx?$/,
                //we definitely don't want babel to transpile all the files in
                //node_modules. That would take a long time.
                exclude: /node_modules/,
                //use the babel loader
                loader: 'babel-loader',
                query: {
                    //specify that we will be dealing with React code
                    presets: ['react','es2015']
                }
            }
        ]
    },

    resolve: {
			  unsafeCache: true,
        //tells webpack where to look for modules
        modules: ['node_modules'],
        //extensions that should be used to resolve modules
        extensions: ['.jsx', '.js']
    }

}

function config(overrides) {
  return deepmerge(base_config, overrides || {});
}

var client_config = config({
	context: path.resolve(__dirname, 'static/js'),
  entry: './client',
  externals: [/^express$/, /^request$/, /^source-map-support$/],
  output: {
	    path: path.join(__dirname, './static/bundles/'),
	    filename: 'client-bundle.js'
	  }
});

var server_config = config({
	context: path.resolve(__dirname, 'node'),
  entry: './server',
  target: 'node',
  externals: [nodeExternals()],
  output: {
	    path: path.join(__dirname, './static/bundles/'),
	    filename: 'server-bundle.js'
	},
	//not clear if we need this. see: https://webpack.js.org/configuration/node/#node
  node: {
	    __dirname: true,
	    __filename: true
	}
});
module.exports = [client_config, server_config];
