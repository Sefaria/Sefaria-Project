// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js
import "core-js/stable";
import "regenerator-runtime/runtime";
require('source-map-support').install();
require('css-modules-require-hook')({  // so that node can handle require statements for css files
   generateScopedName: '[name]',
});
const redis         = require('redis');
const { promisify } = require("util");
const http          = require('http'),
    express         = require('express'),
    bodyParser      = require('body-parser'),
    cookieParser    = require('cookie-parser'),
    request         = require('request'),
    settings        = require('./local_settings.js'),
    React           = require('react'),
    ReactDOMServer  = require('react-dom/server'),
    SefariaReact    = require('../static/js/ReaderApp.jsx'),
    ReaderApp       = React.createFactory(SefariaReact.ReaderApp);

const {logger, expressLogger, errorLogger} = require('./sefaria-logging');

const server = express();

server.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
server.use(bodyParser.json({limit: '50mb'}));

const cacheKeyMapping = {"toc": "toc", "topic_toc": "topic_toc", "terms": "term_mapping", "books": "books_en", "virtualBooks": "virtualBooks" };
let sharedCacheData = {
  /*
  Not data, but a unix timestamp (originally) passed from django indicating when data was last updated on this node process. i
  if a later date comes in on a request, it will trigger an update
   */
  "last_cached": null,
  /* data */
  "toc": null,
  "topic_toc": null,
  "terms": null,
  "books": null,
  "virtualBooks": null,
};

const cache = redis.createClient(`redis://${settings.REDIS_HOST}:${settings.REDIS_PORT}`, {prefix: ':1:'});
const getAsync = promisify(cache.get).bind(cache);


const loadSharedData = async function({ last_cached_to_compare = null, startup = false } = {}){
    logger.debug("Load Shared Data - Input last cached timestamp to compare: " + last_cached_to_compare);
    //TODO: If the data wasnt placed in Redis by django to begin with, well, we're screwed.
    // Or you know, fix it so Node does send a signal to Django to populate cache.
    let redisCalls = [];
    for (const [key, value] of Object.entries(cacheKeyMapping)) {
      if(startup || last_cached_to_compare == null || await needsUpdating(key, last_cached_to_compare)){
        //console.log("Fetching: " + key + "|" + value )
        redisCalls.push(getAsync(value).then(resp => {
          if(!resp){
            throw new Error(`Error with ${key}: ${value} not found in cache`);
          }else{
            sharedCacheData[key] = JSON.parse(resp);
          }
        }).catch(error => {
          logger.error(`${value}: ${error.message}`);
        }));
      }
    }
    try{
      await Promise.all(redisCalls);
      if(cacheTimestampNeedsUpdating("last_cached", last_cached_to_compare)){
        sharedCacheData["last_cached"] = last_cached_to_compare;
      }
      return Promise.resolve();
    }catch(e) {
      console.error(e.message);
      return Promise.reject(e); //Is this the correct way??
    }
};

const cacheTimestampNeedsUpdating = function(cache_timestamp = "last_cached", timestamp_to_compare){
  return sharedCacheData[cache_timestamp] < timestamp_to_compare;
};

const needsUpdating = function(cachekey, last_cached_to_compare){
  return !sharedCacheData[cachekey] || cacheTimestampNeedsUpdating("last_cached", last_cached_to_compare);
};

const renderReaderApp = function(props, data, timer) {
  // Returns HTML of ReaderApp component given `props` and `data`
  SefariaReact.sefariaSetup(data, props); //Do we really need to do Sefaria.setup every request?
  SefariaReact.unpackDataFromProps(props);
  timer.ms_to_set_data = timer.elapsed();
  const html  = ReactDOMServer.renderToString(ReaderApp(props));
  timer.ms_to_render = timer.elapsed();
  return html;
};
const router = express.Router();
router.get('/error', function(req, res, next) {
  // here we cause an error in the pipeline so we see express-winston in action.
  return next(new Error("This is an error and it should be logged to the console"));
});

router.post('/ReaderApp/:cachekey', function(req, res) {
  // timing stored on locals so that it gets returned with the result to be logged
  const timer = res.locals.timing = {
    start: new Date(),
    elapsed: function() { return (new Date() - this.start); }
  };
  const props = JSON.parse(req.body.propsJSON);
  req.input_props = {               // For logging
    initialRefs: props.panels ? props.panels[0].refs : null,
    initialMenu: props.initialMenu,
    initialPath: props.initialPath,
  };

  let request_last_cached = props["last_cached"];
  logger.debug("Begin processing request: ", props);
  logger.debug("Last cached time from server: " + request_last_cached + " " + new Date(request_last_cached*1000).toUTCString());
  logger.debug("last cached time stored: " + sharedCacheData["last_cached"] + " " + new Date(sharedCacheData["last_cached"]*1000).toUTCString());
  // var cacheKey = req.params.cachekey
  timer.ms_to_props = timer.elapsed();
  loadSharedData({last_cached_to_compare: request_last_cached}).then(response => {
    try {
      timer.ms_to_validate_cache = timer.elapsed();

      const resphtml = renderReaderApp(props, sharedCacheData, timer);

      timer.ms_to_complete = timer.elapsed();
      delete res.locals.timing.elapsed;  // no need to pass this around

      res.end(resphtml);
    } catch (render_e){
      logger.error(render_e);
    }
  }).catch(error => {
    res.status(500).end('Data required for render is missing:  ' + error.message);
  });
});

router.post('/Footer/:cachekey', function(req, res) {
  const props = JSON.parse(req.body.propsJSON);
  SefariaReact.unpackDataFromProps(props);
  const html  = ReactDOMServer.renderToString(React.createElement(SefariaReact.Footer));
  res.send(html);
});

router.get('/healthz', function(req, res) {
  res.send('Healthy')
});

server.use(expressLogger);    // express-winston logger makes sense BEFORE the router
server.use(router);
server.use(errorLogger);      // express-winston errorLogger makes sense AFTER the router.

const main = async function(){
  logger.info("Startup. Prefetching cached data:");
  try {
    await loadSharedData({startup: true});
  }
  catch (e) {
    logger.info("Redis data not ready yet");
  }
  server.listen(settings.NODEJS_PORT, function() {
    logger.info('Redis Host: ' + settings.REDIS_HOST);
    logger.info('Redis Port: ' + settings.REDIS_PORT);
    logger.info('Debug: ' + settings.DEBUG);
    logger.info('Listening on ' + settings.NODEJS_PORT);
  });
};

cache.on('error', function (err) {
  logger.error('Redis Connection Error ' + err);
});
cache.on('connect', function() {
  logger.info('Connected to Redis');
  cache.select(1, function (){
    logger.info("REDIS DB: " + cache.selected_db);
    main();
  })
});


