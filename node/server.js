// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js
                     require('source-map-support').install();
                     require('css-modules-require-hook')({  // so that node can handle require statements for css files
                         generateScopedName: '[name]',
                     });
const redis = require('redis');
const { promisify } = require("util");
const http           = require('http'),
    express        = require('express'),
    bodyParser     = require('body-parser'),
    cookieParser   = require('cookie-parser'),
    request        = require('request'),
    settings       = require('./local_settings.js'),
    React          = require('react'),
    ReactDOMServer = require('react-dom/server'),
    SefariaReact   = require('../static/js/ReaderApp.jsx'),
    ReaderApp      = React.createFactory(SefariaReact.ReaderApp);

const server = express();
server.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
server.use(bodyParser.json({limit: '50mb'}));

const log = settings.DEBUG ? console.log : function() {};

const cacheKeyMapping = {"toc": "toc", "topic_toc": "topic_toc", "terms": "term_mapping", "books": "books_en" }
const sharedCacheData = {
  "toc": null,
  "topics_toc": null,
  "terms": null,
  "books": null
};
const cache = redis.createClient(settings.REDIS_PORT, settings.REDIS_HOST, {prefix: ':1:'});
const mgetAsync = promisify(cache.mget).bind(cache);
const getAsync = promisify(cache.get).bind(cache);
cache.on('error', function (err) {
  console.error('Redis Connection Error ' + err);
});
cache.on('connect', function() {
    console.log('Connected to Redis');
});


const ensureSharedDataAvailability = async function(){
    let expiredkeys = [];
    for (const cachekey in cacheKeyMapping) {
      if(await needsUpdating(cachekey)){
        expiredkeys.push(cachekey);
      }
    }
    await getDataFromRedis(expiredkeys);
    return;
}

const getDataFromRedis = function(keys){
  let transformedkeys = keys.map(k => cacheKeyMapping[k]);
  return Promise.all(transformedkeys.map(cache.get)).then(resp => {
    for(const key in keys){
      sharedCacheData[key] = resp[cacheKeyMapping[key]];
    }
  }).catch(error => {
    console.error(error.message);
  });
  /*cache.mget(transformedkeys, function(err, resp){
    for(const el in resp){
      console.log(el);
    }*/

  });
}

const needsUpdating = function(cachekey){
  return !sharedCacheData[cachekey];
}

const renderReaderApp = function(props, data, timer) {
  // Returns HTML of ReaderApp component given `props` and `data`
  data.initialPath    = props.initialPath;
  data._uid           = props._uid;
  data.recentlyViewed = props.recentlyViewed;

  log(data.initialPath);

  SefariaReact.sefariaSetup(data);
  SefariaReact.unpackDataFromProps(props);
  log("Time to set data: %dms", timer.elapsed());
  // Why yes, I'd love a console.
  // var repl = require("repl");
  // var r = repl.start("node> ");
  // r.context.data = data;
  // r.context.props = props;
  // r.context.Sefaria = require("../static/js/sefaria");

  var html  = ReactDOMServer.renderToString(ReaderApp(props));
  log("Time to render: %dms", timer.elapsed());
  console.log("%s %dms", data.initialPath,  timer.elapsed());

  return html;
};

server.post('/ReaderApp/:cachekey', function(req, res) {
  var timer = {
    start: new Date(),
    elapsed: function() { return (new Date() - this.start); }
  };
  var props = JSON.parse(req.body.propsJSON);
  // var cacheKey = req.params.cachekey
  log(props.initialRefs || props.initialMenu);
  log("Time to props: %dms", timer.elapsed());
  var options = {
    url: "http://".concat(settings.DJANGO_HOST, ":", settings.DJANGO_PORT, "/data.js"),
    headers: {
      "User-Agent": "sefaria-node"
    }
  };
  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      log("Time to get data.js: %dms", timer.elapsed());
      (0, eval)(body); // to understand why this is necessary, see: https://stackoverflow.com/questions/19357978/indirect-eval-call-in-strict-mode
      log("Time to eval data.js: %dms", timer.elapsed());
      var html = renderReaderApp(props, DJANGO_DATA_VARS, timer);
      res.end(html);
      log("Time to complete: %dms", timer.elapsed());
    } else {
      console.error("ERROR: %s %s", response && response.statusCode, error);
      res.end("There was an error accessing /data.js.");
    }
  });
});

server.post('/Footer/:cachekey', function(req, res) {
  var html  = ReactDOMServer.renderToStaticMarkup(React.createElement(SefariaReact.Footer));
  res.send(html);
});


ensureSharedDataAvailability();
server.listen(settings.NODEJS_PORT, function() {
  console.log('Django Host: ' + settings.DJANGO_HOST);
  console.log('Django Port: ' + settings.DJANGO_PORT);
  console.log('Redis Host: ' + settings.REDIS_HOST);
  console.log('Redis Port: ' + settings.REDIS_PORT);
  console.log('Debug: ' + settings.DEBUG);
  console.log('Listening on ' + settings.NODEJS_PORT);
});


