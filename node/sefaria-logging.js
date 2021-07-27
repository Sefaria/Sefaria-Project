const expressWinston = require('express-winston');
const winston = require('winston');


const severity_format = winston.format(info => {
 info.severity = info.level;
 delete info.level;
 return info
});

const error_format = winston.format( info => {
  info.message = info.stack;
  delete info.stack;
  delete info.trace;
  return info;
});

const sefariaMeta = (req, res) => {
      const httpRequest = {};
      const meta = {};
      if (req) {
        meta.httpRequest = httpRequest;
        httpRequest.requestMethod = req.method;
        httpRequest.requestUrl = req?.input_props?.initialPath ? req.input_props.initialPath : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        httpRequest.requestSize = req.socket.bytesRead;
        if (req.input_props) {
            meta.initialRefs = req.input_props.initialRefs;
            meta.initialMenu = req.input_props.initialMenu;
        }
      }

      if (res) {
        meta.httpRequest = httpRequest;
        httpRequest.status = res.statusCode;
        httpRequest.latency = {
          seconds: Math.floor(res.responseTime / 1000),
          nanos: ( res.responseTime % 1000 ) * 1000000
        };
        meta.timing = res.locals.timing;
      }
      return meta;
    };

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({}),
    ],
    format: winston.format.combine(
        severity_format(),
        winston.format.json(),
    )
});

const expressLogger = expressWinston.logger({
    transports: [ new winston.transports.Console() ],
    format: winston.format.combine(
        severity_format(),
        winston.format.json(),
    ),
    metaField: null, //this causes the metadata to be stored at the root of the log entry
    responseField: null, // this prevents the response from being included in the metadata (including body and status code)
    requestField: null,
    msg: (req, res) => (req && req.input_props && req.input_props.initialPath) ? `${req.method} ${req.input_props.initialPath} ${res.statusCode}` : `${req.method} ${req.originalUrl} ${res.statusCode}` ,

    // requestWhitelist: ['headers', 'query'],  //these are not included in the standard StackDriver httpRequest
    // responseWhitelist: ['body'], // this populates the `res.body` so we can get the response size (not required)
    dynamicMeta:  sefariaMeta
});

const errorLogger = expressWinston.errorLogger({
    transports: [
        new winston.transports.Console()
    ],
    metaField: null, //this causes the metadata to be stored at the root of the log entry
    blacklistedMetaFields: ['exception'],  // Required to make metaField:null work, as per https://github.com/bithavoc/express-winston/issues/236
    dynamicMeta:  sefariaMeta,
    format: winston.format.combine(
        error_format(),
        severity_format(),
        winston.format.json(),
    )
});

export {logger, expressLogger, errorLogger}