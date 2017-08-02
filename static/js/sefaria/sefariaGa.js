var ga;
if (typeof document !== 'undefined' ) {
  ga = DJANGO_VARS.ga;
} else {
  ga = function() {}; // Fail gracefully if we reach one of these methods server side
  ga._mock = true;
}

module.exports = ga;
