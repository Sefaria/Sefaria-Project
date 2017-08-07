var ga;
if (typeof window !== 'undefined' ) {
  ga = window.ga;
} else {
  ga = function() {}; // Fail gracefully if we reach one of these methods server side
  ga._mock = true;
}

module.exports = ga;
