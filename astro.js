/*
 * Loona Astrology Tools — astro.js  *** STUB — the lead drops the final
 * engine file here before publish. ***
 * API: ASTRO.computeChart({year,month,day,hourUTC,minUTC,lat,lonEast})
 *   -> {sun, moon, planets:{mercury..pluto}, asc, mc}
 *   each {lon, sign (English name), degInSign, house (planets only)}.
 * This stub returns a structurally correct chart from a crude solar
 * approximation ONLY so the UI wiring can be tested end to end.
 */
(function (global) {
  'use strict';
  var SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  function rev(x){ x = x % 360; return x < 0 ? x + 360 : x; }
  function toSign(lon){ var L = rev(lon); var i = Math.floor(L / 30); return { lon: L, sign: SIGNS[i], degInSign: L - i * 30 }; }
  function computeChart(input) {
    var start = Date.UTC(input.year, 0, 0);
    var doy = Math.floor((Date.UTC(input.year, input.month - 1, input.day) - start) / 86400000);
    var sunLon = rev(280 + doy * 0.9856 + (input.hourUTC + input.minUTC / 60) * 0.041);
    var ascLon = rev(sunLon + 90 + input.lonEast);
    function body(lon, asc){ var b = toSign(lon); b.house = Math.floor(rev(b.lon - asc) / 30) + 1; return b; }
    var planets = {};
    var keys = ['mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
    keys.forEach(function (k, i) { planets[k] = body(sunLon + 25 * (i + 1), ascLon); });
    var sun = body(sunLon, ascLon), moon = body(sunLon + 78, ascLon);
    var asc = toSign(ascLon); asc.house = 1;
    var mc = body(ascLon + 270, ascLon);
    return { sun: sun, moon: moon, planets: planets, asc: asc, mc: mc, houses: { system: 'Equal House' }, houseSystem: 'Equal House', stub: true };
  }
  var ASTRO = { SIGNS: SIGNS, computeChart: computeChart, lonToSign: toSign };
  if (typeof module !== 'undefined' && module.exports) module.exports = ASTRO;
  global.ASTRO = ASTRO;
})(typeof window !== 'undefined' ? window : globalThis);
