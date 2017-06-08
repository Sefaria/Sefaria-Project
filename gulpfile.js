var gulp = require('gulp');
var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var DeepMerge = require('deep-merge');
var nodemon = require('nodemon');

var deepmerge = DeepMerge(function(target, source, key) {
  if(target instanceof Array) { return [].concat(target, source);
	  }
  return source;
});


var base_config = {
		devtool: '#eval-source-map', //should have better performance on incremental build over `source-map`
    plugins: [
        //tells webpack where to store data about your bundles.
        new BundleTracker({filename: './webpack-stats.json'}), 
        //makes jQuery available in every module
        /*new webpack.ProvidePlugin({ 
            $: 'jquery',
            jQuery: 'jquery',
            'window.jQuery': 'jquery' 
        }),*/
				//new ExtractTextPlugin("app.css")	
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
            },
					  {
						    test: /\.css$/,
								loader: ExtractTextPlugin.extract({ fallback: 'style-loader', use: 'css-loader' }) 
						},
						{
								test: /\.(jpg|png)$/,
								loader: 'file-loader'
						},
        ]
    },
    
    resolve: {
			  alias: {
					//'jquery-ui': 'jquery-ui/ui/widgets',
					'jquery-ui-css': 'jquery-ui/../../themes/base'
				},	
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
  output: {
	    path: path.join(__dirname, './static/bundles/'),
	    filename: 'client-bundle-[hash].js'
	  }
});

var server_config = config({
	context: path.resolve(__dirname, 'node'),
  entry: './server',
  target: 'node',
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

function onBuild(done) {
  return function(err, stats) {
	    if(err) {
			      console.log('Error', err);
			    }
	    else {
			      console.log(stats.toString());
			    }
	
	    if(done) {
			      done();
			    }
	  }
}

gulp.task('client-build', function(done) {
  webpack(client_config).run(onBuild(done));
});

gulp.task('client-watch', function() {
  webpack(client_config).watch(100, onBuild());
});

gulp.task('server-build', function(done) {
  webpack(server_config).run(onBuild(done));
});

gulp.task('server-watch', function() {
  webpack(server_config).watch(100, function(err, stats) {
	    onBuild()(err, stats);
	    nodemon.restart();
	  });
});

gulp.task('build', ['client-build', 'server-build']);
gulp.task('watch', ['client-watch', 'server-watch']);
