// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js
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

const server = express();
server.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
server.use(bodyParser.json({limit: '50mb'}));

const log = settings.DEBUG ? console.log : function() {};

const cacheKeyMapping = {"toc": "toc", "topic_toc": "topic_toc", "terms": "term_mapping", "books": "books_en" }
let sharedCacheData = {
  "toc": null,
  "topic_toc": null,
  "terms": null,
  "books": null
};

const cache = redis.createClient(settings.REDIS_PORT, settings.REDIS_HOST, {prefix: ':1:'});
const getAsync = promisify(cache.get).bind(cache);


const loadSharedData = async function(){
    //TODO: If the data wasnt placed in Redis by django to begin with, well, we're screwed.
    // Or you know, fix it so Node does send a signal to Django to populate cache.
    let redisCalls = [];
    for (const [key, value] of Object.entries(cacheKeyMapping)) {
      if(await needsUpdating(key)){
        redisCalls.push(getAsync(value).then(resp => {
          sharedCacheData[key] = resp;
        }).catch(error => {
          console.log(`${value}: ${error.message}`);
        }));
      }
    }
    try{
      return await Promise.all(redisCalls);
    }catch(e) {
      console.error(e.message);
      return Promise.reject(e); //Is this the correct way??
    }
}

const needsUpdating = function(cachekey){
  //TODO: add timestamp liveness checks here
  return !sharedCacheData[cachekey];
}

const renderReaderApp = function(props, data, timer) {
  // Returns HTML of ReaderApp component given `props` and `data`
  log(props.initialPath);

  SefariaReact.sefariaSetup(data); //Do we really need to do Sefaria.setup every request?
  SefariaReact.unpackDataFromProps(props);
  log("Time to set data: %dms", timer.elapsed());
  const html  = ReactDOMServer.renderToString(ReaderApp(props));
  log("Time to render: %dms", timer.elapsed());
  console.log("%s %dms", data.initialPath,  timer.elapsed());
  return html;
};

server.post('/ReaderApp/:cachekey', function(req, res) {
  const timer = {
    start: new Date(),
    elapsed: function() { return (new Date() - this.start); }
  };
  const props = JSON.parse(req.body.propsJSON);
  // var cacheKey = req.params.cachekey
  log(props.initialRefs || props.initialMenu);
  log("Time to props: %dms", timer.elapsed());
  loadSharedData().then(response => {
    try{
      log("Time to validate cache data: %dms", timer.elapsed());
      const resphtml = renderReaderApp(props, sharedCacheData, timer);
      res.end(resphtml);
      log("Time to complete: %dms", timer.elapsed());
    }catch (render_e){
      console.log(render_e);
    }
  }).catch(error => {
    res.status(500).end('something blew up: ' + error.message);
  });
});

server.post('/Footer/:cachekey', function(req, res) {
  const props = JSON.parse(req.body.propsJSON);
  SefariaReact.unpackDataFromProps(props);
  const html  = ReactDOMServer.renderToStaticMarkup(React.createElement(SefariaReact.Footer));
  res.send(html);
});


const main = async function(){
  await loadSharedData();
  server.listen(settings.NODEJS_PORT, function() {
    console.log('Redis Host: ' + settings.REDIS_HOST);
    console.log('Redis Port: ' + settings.REDIS_PORT);
    console.log('Debug: ' + settings.DEBUG);
    console.log('Listening on ' + settings.NODEJS_PORT);
  });
}

cache.on('error', function (err) {
  console.error('Redis Connection Error ' + err);
});
cache.on('connect', function() {
  console.log('Connected to Redis');
  cache.select(1, function (){
    console.log("REDIS DB: ", cache.selected_db);
    main();
  })
});


