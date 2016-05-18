// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js

var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    vm = require('vm'),
    request = require('request'),
    redis = require('redis'),
    React = require('react'),
    ReactDOMServer = require('react-dom/server'),
    Sefaria = require('../static/js/sefaria')
    SefariaReact = require('../static/js/s2'),
    ReaderApp = React.createFactory(SefariaReact.ReaderApp);

http.createServer(function(req, res) {
  console.log(req.url);
  var parsed   = url.parse(req.url, true);
  var pathname = parsed.pathname
  var query    = parsed.query;

  if (pathname == '/ReaderApp') {

    res.setHeader('Content-Type', 'text/html')

    var props = {
        multiPanel:                  JSON.parse(query.multiPanel || null),
        initialRefs:                 JSON.parse(query.initialRefs || null),
        initialFilter:               JSON.parse(query.initialFilter || null),
        initialMenu:                 query.initialMenu || null,
        initialQuery:                query.initialQuery || null,
        initialSearchFilters:        JSON.parse(query.initialSearchFilters || null),
        initialSheetsTag:            JSON.parse(query.initialSheetsTag || null),
        initialNavigationCategories: JSON.parse(query.initialNavigationCategories || null),
        initialSettings:             JSON.parse(query.initialSettings || null),
        initialPanels:               JSON.parse(query.initialPanels || null),
        initialDefaultVersions:      JSON.parse(query.initialDefaultVersions || null),
        headerMode:                  false
    }

    // TODO is direct to redis better than http/django? 
    // redisClient = redis.createClient(); // TODO don't assume database 0
    request("http://localhost:8000/data.js", function(error, response, body) {
      if (!error && response.statusCode == 200) {
        eval(body);
        var html = ReactDOMServer.renderToString(ReaderApp(props));
        res.end(html)
      } else {
        res.end("There was an error accessing /data.js.");
      }
    });

  } else {
    res.end("Unsupported Route - please specify a component name.");
  }

// The http server listens on port 4040, TODO read from package.json config
}).listen(4040, function(err) {
  if (err) throw err;
  console.log('Listening on 4040...');
});