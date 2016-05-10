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

  var query = url.parse(req.url,true).query;
  
  
  //console.log("Request");
  //console.log(req);

  if (req.url == '/ReaderApp') {

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
})


// A utility function to safely escape JSON for embedding in a <script> tag
function safeStringify(obj) {
  return JSON.stringify(obj).replace(/<\/script/g, '<\\/script').replace(/<!--/g, '<\\!--');
}