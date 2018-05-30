// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js
                     require('source-map-support').install();
var http           = require('http'),
    express        = require('express'),
    bodyParser     = require('body-parser'),
    cookieParser   = require('cookie-parser'),
    request        = require('request'),
    settings       = require('./local_settings.json'),
    React          = require('react'),
    ReactDOMServer = require('react-dom/server'),
    SefariaReact   = require('../static/js/ReaderApp.jsx'),
    ReaderApp      = React.createFactory(SefariaReact.ReaderApp);

var server = express();

server.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
server.use(bodyParser.json({limit: '50mb'}));

var log = settings.DEBUG ? console.log : function() {};

var renderReaderApp = function(props, data, timer) {
  // Returns HTML of ReaderApp component given `props` and `data`
  data.initialPath    = props.initialPath;
  data.loggedIn       = props.loggedIn;
  data._uid           = props._uid;
  data.recentlyViewed = props.recentlyViewed;

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
  var dataVars = JSON.parse(req.body.dataJSON);
  // var cacheKey = req.params.cachekey
  log(props.initialRefs || props.initialMenu);
  log("Time to props: %dms", timer.elapsed());
  /*var options = {
    url: settings.DJANGO_HOST + "/data.js",
    headers: {
      "User-Agent": "sefaria-node"
    }
  };*/
  var html = renderReaderApp(props, dataVars, timer);
  res.end(html);
  /*request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      log("Time to get data.js: %dms", timer.elapsed());
      (0, eval)(body); // to understand why this is necessary, see: https://stackoverflow.com/questions/19357978/indirect-eval-call-in-strict-mode
      log("Time to eval data.js: %dms", timer.elapsed());
      var html = renderReaderApp(props, DJANGO_DATA_VARS, timer);
      res.end(html);
      log("Time to complete: %dms", timer.elapsed());
    } else {
      console.error("ERROR: %s %s", response.statusCode, error);
      res.end("There was an error accessing /data.js.");
    }
  });*/
});

server.post('/Footer/:cachekey', function(req, res) {
  var html  = ReactDOMServer.renderToStaticMarkup(React.createElement(SefariaReact.Footer));
  res.send(html);
});

server.listen(settings.PORT, function() {
  console.log('Listening on ' + settings.PORT);
});
