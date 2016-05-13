// Initially copypasta'd from https://github.com/mhart/react-server-example
// https://github.com/mhart/react-server-example/blob/master/server.js

var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    React = require('react'),
    ReactDOMServer = require('react-dom/server'),
    SefariaReact = require('../static/js/s2'),
    ReaderApp = React.createFactory(SefariaReact.ReaderApp);

http.createServer(function(req, res) {

  var parsed   = url.parse(req.url, true);
  var pathname = parsed.pathname
  var query    = parsed.query;
  
  //console.log("Request");
  console.log(pathname);

  if (pathname == '/ReaderApp') {

    res.setHeader('Content-Type', 'text/html')

    var props = {
        multiPanel:                  JSON.parse(query.multiPanel || null),
        initialRefs:                 JSON.parse(query.initialRefs || null),
        initialFilter:               JSON.parse(query.initialFilter || null),
        initialMenu:                 JSON.parse(query.initialMenu || null),
        initialQuery:                JSON.parse(query.initialQuery || null),
        initialSearchFilters:        JSON.parse(query.initialSearchFilters || null),
        initialSheetsTag:            JSON.parse(query.initialSheetsTag || null),
        initialNavigationCategories: JSON.parse(query.initialNavigationCategories || null),
        initialSettings:             JSON.parse(query.initialSettings || null),
        initialPanels:               JSON.parse(query.initialPanels || null),
        initialDefaultVersions:      JSON.parse(query.initialDefaultVersions || null),
        headerMode:                  false
    }

    var html = ReactDOMServer.renderToString(ReaderApp(props));

    res.end(html)

  } else {
    res.end("Unsupported Route - please specificy a component name.");
  }

// The http server listens on port 4040, TODO read from package.json config
}).listen(4040, function(err) {
  if (err) throw err;
  console.log('Listening on 4040...');
});