
const local_settings = {

  NODEJS_PORT: function(){
    if ('NODEJS_PORT' in process.env) {
      return process.env.NODEJS_PORT;
    } else {
      return 3000; // default;
    } 
  }(),

  REDIS_HOST: function(){
    if ('REDIS_HOST' in process.env) {
      return process.env.REDIS_HOST;
    } else {
      return "127.0.0.1"; // default;
    }
  }(),

  REDIS_PORT: function(){
    if ('REDIS_PORT' in process.env) {
      return process.env.REDIS_PORT;
    } else {
      return 6379; // default;
    }
  }(),

  DEBUG: function(){
    if ('DEBUG' in process.env) {
      return process.env.DEBUG;
    } else {
      return false; // default
    }
  }()
}

module.exports = local_settings;