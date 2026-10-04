// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js
import "core-js/stable";
import "regenerator-runtime/runtime";
require('source-map-support').install();
require('css-modules-require-hook')({  // so that node can handle require statements for css files
   generateScopedName: '[name]',
});
const redis         = require('redis');
const dns           = require('dns');
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

const resolve4Async = promisify(dns.resolve4);

/*
Resolves the Redis endpoint this SSR cache reader should connect to, mirroring
sefaria.system.redis_sentinel.get_redis_client(): when SENTINEL_HEADLESS_URL is configured
(prod/staging), resolve the Sentinel headless Service's current pod IPs over DNS, ask one of
them who the master is (SENTINEL get-master-addr-by-name), and connect there. Otherwise
(local dev, which has no Sentinel) connect directly to REDIS_URL/REDIS_PORT.

Unlike the Python client, this resolves the master once at startup rather than on every
connection checkout -- the `redis` npm package here (v2.8, pre-Sentinel-aware versions)
has no client-side Sentinel support to re-ask on a failover. That matches this process's
existing reliability characteristics against the single-instance Redis it replaces (no
failover either), but -- unlike the Python side -- it will not notice a Sentinel failover
without a restart. Flagged as unverified: no live Sentinel/Node environment was available
to test this against; validate in staging before trusting it in prod.
*/
const resolveSharedCacheRedisUrl = async function(){
  if (!settings.SENTINEL_HEADLESS_URL) {
    return `redis://${settings.REDIS_URL.replace('redis://', '')}:${settings.REDIS_PORT}`;
  }
  const sentinelIps = await resolve4Async(settings.SENTINEL_HEADLESS_URL);
  // createClient(port, host, ...): port must come first, or a numeric-looking string here
  // would be misread as a unix socket path rather than a host to dial -- see
  // node_modules/redis/lib/createClient.js's argument-sniffing.
  const sentinelClient = redis.createClient(settings.REDIS_PORT, sentinelIps[0]);
  const sentinelCommandAsync = promisify(sentinelClient.send_command).bind(sentinelClient);
  try {
    const [host, port] = await sentinelCommandAsync(
      'sentinel', ['get-master-addr-by-name', settings.SENTINEL_MASTER_SET]
    );
    return `redis://${host}:${port}`;
  } finally {
    sentinelClient.quit();
  }
};

let cache, getAsync;


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
  props.remoteConfig = props.remoteConfig || {};
  SefariaReact.sefariaSetup(data, props, true);  // true means reset cache - we are clearing out old data
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

router.post('/ReaderApp/:cachekey', function(req, res, next) {
  // timing stored on locals so that it gets returned with the result to be logged
  const timer = res.locals.timing = {
    start: new Date(),
    elapsed: function() { return (new Date() - this.start); }
  };
  const props = req.body.propsJSON ? JSON.parse(req.body.propsJSON) : req.body;
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
    } catch (render_e) {
      return next(render_e);
    }
  }).catch(error => {
    return next(error);
  });
});

router.post('/Footer/:cachekey', function(req, res) {
  const props = req.body.propsJSON ? JSON.parse(req.body.propsJSON) : req.body;
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
    logger.info('Debug: ' + settings.DEBUG);
    logger.info('Listening on ' + settings.NODEJS_PORT);
  });
};

resolveSharedCacheRedisUrl().then(function(redisUrl){
  const clientOpts = {prefix: ':1:'};
  if (settings.SENTINEL_HEADLESS_URL) {
    clientOpts.auth_pass = settings.REDIS_PASSWORD;
  }
  cache = redis.createClient(redisUrl, clientOpts);
  getAsync = promisify(cache.get).bind(cache);

  cache.on('error', function (err) {
    logger.error('Redis Connection Error ' + err);
  });
  cache.on('connect', function() {
    logger.info('Connected to Redis: ' + redisUrl);
    cache.select(settings.SHARED_CACHE_DB_NUM, function (){
      logger.info("REDIS DB: " + cache.selected_db);
      main();
    })
  });
}).catch(function(err){
  logger.error('Failed to resolve shared-cache Redis endpoint: ' + err);
});
