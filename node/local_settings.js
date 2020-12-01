
const local_settings = {
  DJANGO_HOST: function(){
    if ('DJANGO_HOST' in process.env) {
      return process.env.DJANGO_HOST;
    } else {
      throw new Error('The environment variable "DJANGO_HOST" must be defined.');
    }
  }(),

  DJANGO_PORT: function(){
    if ('DJANGO_PORT' in process.env) {
      return process.env.DJANGO_PORT;
    } else {
      return 80; // default
    }
  }(),

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