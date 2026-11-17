/*
 * Loona Astrology Tools — Astronomy Engine
 * Dependency-free, browser + Node compatible (UMD style).
 *
 * Algorithm: Paul Schlyter's "How to compute planetary positions"
 * (low-precision method, https://stjarnhimlen.se/comp/ppcomp.html)
 *  - Sun / Moon / planets from Keplerian elements valid for the
 *    day-number system below (epoch 2000 Jan 0.0 = 1999 Dec 31, 00:00 UT).
 *  - Moon: Schlyter's major perturbation terms applied.
 *  - Jupiter / Saturn / Uranus: Schlyter's major mutual-perturbation
 *    terms applied.
 *  - Pluto: not covered by Schlyter's element set, so it uses
 *    approximate JPL Keplerian elements (Table 1 style, J2000) solved
 *    with the same Kepler / heliocentric -> geocentric machinery.
 *    Pluto moves ~1.5 deg/year, so this is sign-accurate except
 *    within ~1-2 deg of a sign cusp.
 *
 * Expected accuracy (Schlyter, vs a full ephemeris):
 *  Sun ~0.01 deg, Moon ~a few arc-minutes in longitude after
 *  perturbations, inner planets ~1-2 arc-minutes to ~0.1 deg,
 *  outer planets up to ~0.2-0.3 deg in the worst historical cases.
 *  Any body within ~1 deg of a sign cusp can therefore flip signs
 *  against a higher-precision ephemeris — see ENGINE-NOTES.md.
 *
 * Houses: EQUAL HOUSE system only (cusps = Ascendant + 30 deg steps).
 * This is labelled everywhere; it is NOT Placidus.
 */
(function (global) {
  'use strict';

  var SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];

  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;

  function rev(x) { // normalize to 0..360
    x = x % 360;
    return x < 0 ? x + 360 : x;
  }
  function sinD(x) { return Math.sin(x * D2R); }
  function cosD(x) { return Math.cos(x * D2R); }
  // integer division truncating toward zero (as in Schlyter's C code)
  function idiv(a, b) { return Math.trunc(a / b); }

  function lonToSign(lon) {
    var L = rev(lon);
    var idx = Math.floor(L / 30);
    return { lon: L, sign: SIGNS[idx], degInSign: L - idx * 30, signIndex: idx };
  }

  /* ------------------------------------------------------------------ */
  /* Day number (Schlyter) for a UTC date/time.                          */
  /* d = 0 at 2000 Jan 0.0 (1999 Dec 31, 00:00 UT).                      */
  /* ------------------------------------------------------------------ */
  function julianDay(year, month, day, utHours) {
    // Standard Gregorian Julian Day (Fliegel–Van Flandern form).
    // JD for 2000 Jan 1, 12:00 UT = 2451545.0 (check value).
    var a = idiv(14 - month, 12);
    var y = year + 4800 - a;
    var m = month + 12 * a - 3;
    var jdn = day + idiv(153 * m + 2, 5) + 365 * y
      + idiv(y, 4) - idiv(y, 100) + idiv(y, 400) - 32045;
    return jdn - 0.5 + utHours / 24.0;
  }

  function dayNumber(year, month, day, utHours) {
    // Schlyter's d: days since 2000 Jan 0.0 (1999 Dec 31, 00:00 UT),
    // whose JD is 2451543.5. NOTE: this is computed from the JD above
    // rather than Schlyter's integer shortcut formula — an early build
    // using that shortcut produced d values 15 days low (verified:
    // Sun ~15 deg low, Moon ~195 deg off on all reference charts);
    // the JD route reproduces the epoch exactly (d = 1 at
    // 2000 Jan 1, 00:00 UT).
    return julianDay(year, month, day, utHours) - 2451543.5;
  }

  /* ------------------------------------------------------------------ */
  /* Kepler's equation (degrees), Schlyter's iteration.                  */
  /* ------------------------------------------------------------------ */
  function eccentricAnomaly(M, e) {
    M = rev(M);
    var E, delta;
    if (e < 0.8) {
      E = M + R2D * e * sinD(M) * (1 + e * cosD(M));
    } else {
      E = 180;
    }
    do {
      delta = (E - R2D * e * sinD(E) - M) / (1 - e * cosD(E));
      E = E - delta;
    } while (Math.abs(delta) > 0.001);
    return E;
  }

  /* Position in orbital plane -> true anomaly v (deg) and radius r. */
  function orbitalPlane(a, e, M) {
    var E = eccentricAnomaly(M, e);
    var xv = a * (cosD(E) - e);
    var yv = a * (Math.sqrt(1 - e * e) * sinD(E));
    var v = Math.atan2(yv, xv) * R2D;
    var r = Math.sqrt(xv * xv + yv * yv);
    return { v: v, r: r, E: E };
  }

  /* Heliocentric (or Moon: geocentric) ecliptic rectangular coords. */
  function eclipticRect(r, N, vw, i) {
    // vw = v + w  (longitude of the body in its orbit, from the node)
    return {
      x: r * (cosD(N) * cosD(vw) - sinD(N) * sinD(vw) * cosD(i)),
      y: r * (sinD(N) * cosD(vw) + cosD(N) * sinD(vw) * cosD(i)),
      z: r * (sinD(vw) * sinD(i))
    };
  }

  function rectToLonLat(p) {
    return {
      lon: rev(Math.atan2(p.y, p.x) * R2D),
      lat: Math.atan2(p.z, Math.sqrt(p.x * p.x + p.y * p.y)) * R2D,
      r: Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    };
  }

  /* ------------------------------------------------------------------ */
  /* Orbital elements (Schlyter), functions of day number d.             */
  /* N = longitude of ascending node, i = inclination,                   */
  /* w = argument of perihelion, a = semi-major axis (AU; Moon: Earth    */
  /* radii), e = eccentricity, M = mean anomaly.                         */
  /* ------------------------------------------------------------------ */
  function elements(name, d) {
    switch (name) {
      case 'sun':
        return { N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1.000000,
                 e: 0.016709 - 1.151e-9 * d, M: 356.0470 + 0.9856002585 * d };
      case 'moon':
        return { N: 125.1228 - 0.0529538083 * d, i: 5.1454,
                 w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.054900,
                 M: 115.3654 + 13.0649929509 * d };
      case 'mercury':
        return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.00e-8 * d,
                 w: 29.1241 + 1.01444e-5 * d, a: 0.387098,
                 e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
      case 'venus':
        return { N: 76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d,
                 w: 54.8910 + 1.38374e-5 * d, a: 0.723330,
                 e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
      case 'mars':
        return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d,
                 w: 286.5016 + 2.92961e-5 * d, a: 1.523688,
                 e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
      case 'jupiter':
        return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d,
                 w: 273.8777 + 1.64505e-5 * d, a: 5.20256,
                 e: 0.048498 + 4.469e-9 * d, M: 19.8950 + 0.0830853001 * d };
      case 'saturn':
        return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d,
                 w: 339.3939 + 2.97661e-5 * d, a: 9.55475,
                 e: 0.055546 - 9.499e-9 * d, M: 316.9670 + 0.0334442282 * d };
      case 'uranus':
        return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d,
                 w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d,
                 e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d };
      case 'neptune':
        return { N: 131.7806 + 3.0173e-5 * d, i: 1.7700 - 2.55e-7 * d,
                 w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d,
                 e: 0.008606 + 2.15e-9 * d, M: 256.2285 + 0.005968069 * d };
      case 'pluto': {
        // Approximate JPL Keplerian elements (J2000). Schlyter's d is
        // 1.5 days before the J2000 epoch (2000 Jan 1, 12:00 UT), so
        // the mean anomaly is referenced to (d - 1.5).
        // L(J2000) = 238.929, longitude of perihelion = 224.0689,
        // node = 110.3035 -> w = 113.7654, M(J2000) = 14.8601,
        // mean motion = 360 / (248.020 yr) = 0.003972 deg/day.
        var dd = d - 1.5;
        return { N: 110.3035 + 0.000032 * dd, i: 17.1418,
                 w: 113.7654 + 0.000027 * dd, a: 39.482,
                 e: 0.24883, M: 14.8601 + 0.003972 * dd };
      }
      default:
        throw new Error('unknown body: ' + name);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sun: geocentric ecliptic longitude (+ rectangular coords, needed    */
  /* to convert planets from heliocentric to geocentric).                */
  /* ------------------------------------------------------------------ */
  function sunPosition(d) {
    var el = elements('sun', d);
    var op = orbitalPlane(el.a, el.e, el.M);
    var lon = rev(op.v + el.w);
    return {
      lon: lon,
      r: op.r,
      xs: op.r * cosD(lon),
      ys: op.r * sinD(lon),
      meanLon: rev(el.M + el.w),
      meanAnomaly: rev(el.M),
      eclipticLongitude: lon
    };
  }

  /* ------------------------------------------------------------------ */
  /* Moon: geocentric ecliptic longitude/latitude with Schlyter's        */
  /* major perturbation terms.                                           */
  /* ------------------------------------------------------------------ */
  function moonPosition(d, sun) {
    var el = elements('moon', d);
    var op = orbitalPlane(el.a, el.e, el.M);
    var p = eclipticRect(op.r, el.N, op.v + el.w, el.i);
    var pos = rectToLonLat(p);
    var lon = pos.lon, lat = pos.lat, r = pos.r;

    var Ms = sun.meanAnomaly;          // Sun's mean anomaly
    var Mm = rev(el.M);                // Moon's mean anomaly
    // Mean elongation D and argument of latitude F:
    var moonMeanLon = rev(el.N + el.w + el.M);
    var D = rev(moonMeanLon - sun.meanLon);
    var F = rev(moonMeanLon - el.N);

    // Longitude perturbations (degrees)
    lon += -1.274 * sinD(Mm - 2 * D)        // Evection
           + 0.658 * sinD(2 * D)            // Variation
           - 0.186 * sinD(Ms)               // Yearly equation
           - 0.059 * sinD(2 * Mm - 2 * D)
           - 0.057 * sinD(Mm - 2 * D + Ms)
           + 0.053 * sinD(Mm + 2 * D)
           + 0.046 * sinD(2 * D - Ms)
           + 0.041 * sinD(Mm - Ms)
           - 0.035 * sinD(D)                // Parallactic equation
           - 0.031 * sinD(Mm + Ms)
           - 0.015 * sinD(2 * F - 2 * D)
           + 0.011 * sinD(Mm - 4 * D);

    // Latitude perturbations (degrees)
    lat += -0.173 * sinD(F - 2 * D)
           - 0.055 * sinD(Mm - F - 2 * D)
           - 0.046 * sinD(Mm + F - 2 * D)
           + 0.033 * sinD(F + 2 * D)
           + 0.017 * sinD(2 * Mm + F);

    // Distance perturbations (Earth radii)
    r += -0.58 * cosD(Mm - 2 * D)
         - 0.46 * cosD(2 * D);

    return { lon: rev(lon), lat: lat, r: r };
  }

  /* ------------------------------------------------------------------ */
  /* One planet: heliocentric position, Schlyter perturbations for the   */
  /* giant planets, then geocentric ecliptic longitude/latitude.         */
  /* ------------------------------------------------------------------ */
  function planetPosition(name, d, sun, meanAnomalies) {
    var el = elements(name, d);
    var op = orbitalPlane(el.a, el.e, el.M);
    var p = eclipticRect(op.r, el.N, op.v + el.w, el.i);
    var pos = rectToLonLat(p);
    var lon = pos.lon, lat = pos.lat;

    var Mj = meanAnomalies.jupiter, Msa = meanAnomalies.saturn, Mu = meanAnomalies.uranus;
    if (name === 'jupiter') {
      lon += -0.332 * sinD(2 * Mj - 5 * Msa - 67.6)
             - 0.056 * sinD(2 * Mj - 2 * Msa + 21)
             + 0.042 * sinD(3 * Mj - 5 * Msa + 21)
             - 0.036 * sinD(Mj - 2 * Msa)
             + 0.022 * cosD(Mj - Msa)
             + 0.023 * sinD(2 * Mj - 3 * Msa + 52)
             - 0.016 * sinD(Mj - 5 * Msa - 69);
      // Recompute rectangular coords from corrected lon/lat at same r
      p = { x: op.r * cosD(lon) * cosD(lat), y: op.r * sinD(lon) * cosD(lat), z: op.r * sinD(lat) };
    } else if (name === 'saturn') {
      lon += +0.812 * sinD(2 * Mj - 5 * Msa - 67.6)
             - 0.229 * cosD(2 * Mj - 4 * Msa - 2)
             + 0.119 * sinD(Mj - 2 * Msa - 3)
             + 0.046 * sinD(2 * Mj - 6 * Msa - 69)
             + 0.014 * sinD(Mj - 3 * Msa + 32);
      lat += -0.020 * cosD(2 * Mj - 4 * Msa - 2)
             + 0.018 * sinD(2 * Mj - 6 * Msa - 49);
      p = { x: op.r * cosD(lon) * cosD(lat), y: op.r * sinD(lon) * cosD(lat), z: op.r * sinD(lat) };
    } else if (name === 'uranus') {
      lon += +0.040 * sinD(Msa - 2 * Mu + 6)
             + 0.035 * sinD(Msa - 3 * Mu + 33)
             - 0.015 * sinD(Mj - Mu + 20);
      p = { x: op.r * cosD(lon) * cosD(lat), y: op.r * sinD(lon) * cosD(lat), z: op.r * sinD(lat) };
    }

    // Heliocentric -> geocentric
    var xg = p.x + sun.xs;
    var yg = p.y + sun.ys;
    var zg = p.z;
    var geoLon = rev(Math.atan2(yg, xg) * R2D);
    var geoLat = Math.atan2(zg, Math.sqrt(xg * xg + yg * yg)) * R2D;
    return { lon: geoLon, lat: geoLat, helioLon: pos.lon, helioLat: pos.lat, r: op.r };
  }

  /* ------------------------------------------------------------------ */
  /* Ascendant, Midheaven, sidereal time.                                */
  /* ------------------------------------------------------------------ */
  function siderealAndAngles(d, utHours, lat, lonEast, sun) {
    var ecl = 23.4393 - 3.563e-7 * d; // obliquity of the ecliptic (deg)

    // GMST at 0h UT for this day, in degrees, via Schlyter:
    // GMST0 = (Sun's mean longitude + 180 deg) / 15, in hours.
    var gmst0Hours = rev(sun.meanLon + 180) / 15;
    var gmstHours = gmst0Hours + utHours;
    var lstHours = gmstHours + lonEast / 15;
    lstHours = ((lstHours % 24) + 24) % 24;
    var lstDeg = rev(lstHours * 15); // = RAMC in degrees

    // Midheaven: tan(MC) = tan(RAMC) / cos(ecl), correct quadrant via
    // atan2(sin RAMC, cos RAMC * cos ecl).
    var mcLon = rev(Math.atan2(sinD(lstDeg), cosD(lstDeg) * cosD(ecl)) * R2D);

    // Ascendant: atan2( cos RAMC, -(sin RAMC * cos ecl + tan lat * sin ecl) )
    var ascLon = rev(Math.atan2(
      cosD(lstDeg),
      -(sinD(lstDeg) * cosD(ecl) + Math.tan(lat * D2R) * sinD(ecl))
    ) * R2D);

    return { ascLon: ascLon, mcLon: mcLon, lstHours: lstHours, lstDeg: lstDeg, obliquity: ecl };
  }

  /* ------------------------------------------------------------------ */
  /* Main API                                                             */
  /* input: {year, month, day, hourUTC, minUTC, lat, lonEast}             */
  /*   hourUTC/minUTC = time of birth in UTC (hour may carry minutes     */
  /*   if minUTC is omitted). lat = degrees N (+), lonEast = degrees E   */
  /*   (+) / W (-).                                                       */
  /* ------------------------------------------------------------------ */
  function computeChart(input) {
    var year = input.year, month = input.month, day = input.day;
    var hourUTC = input.hourUTC || 0;
    var minUTC = input.minUTC || 0;
    var ut = hourUTC + minUTC / 60;
    var lat = input.lat, lonEast = input.lonEast;

    var d = dayNumber(year, month, day, ut);
    var sun = sunPosition(d);
    var moon = moonPosition(d, sun);

    var meanAnomalies = {
      jupiter: rev(elements('jupiter', d).M),
      saturn: rev(elements('saturn', d).M),
      uranus: rev(elements('uranus', d).M)
    };

    var planetNames = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    var planets = {};
    planetNames.forEach(function (name) {
      var pos = planetPosition(name, d, sun, meanAnomalies);
      planets[name] = lonToSign(pos.lon);
      planets[name].lat = pos.lat;
    });

    var angles = siderealAndAngles(d, ut, lat, lonEast, sun);
    var asc = lonToSign(angles.ascLon);
    var mc = lonToSign(angles.mcLon);

    var sunOut = lonToSign(sun.lon);
    var moonOut = lonToSign(moon.lon);
    moonOut.lat = moon.lat;

    // Equal House cusps: cusp 1 = Ascendant, each next cusp +30 deg.
    var houseCusps = [];
    for (var h = 0; h < 12; h++) {
      var cusp = lonToSign(asc.lon + 30 * h);
      cusp.house = h + 1;
      houseCusps.push(cusp);
    }

    function equalHouse(lon) {
      var diff = rev(lon - asc.lon);
      return Math.floor(diff / 30) + 1;
    }

    var houses = {
      system: 'Equal House',
      cusps: houseCusps,
      sun: equalHouse(sunOut.lon),
      moon: equalHouse(moonOut.lon),
      asc: 1,
      mc: equalHouse(mc.lon)
    };
    planetNames.forEach(function (name) { houses[name] = equalHouse(planets[name].lon); });
    // also attach house number onto each body object for convenience
    sunOut.house = houses.sun;
    moonOut.house = houses.moon;
    planetNames.forEach(function (name) { planets[name].house = houses[name]; });
    asc.house = 1;
    mc.house = houses.mc;

    return {
      sun: sunOut,
      moon: moonOut,
      planets: planets,
      asc: asc,
      mc: mc,
      houses: houses,
      houseSystem: 'Equal House',
      julianDay: julianDay(year, month, day, ut),
      dayNumber: d,
      siderealTimeHours: angles.lstHours,
      obliquity: angles.obliquity
    };
  }

  var ASTRO = {
    SIGNS: SIGNS,
    computeChart: computeChart,
    dayNumber: dayNumber,
    julianDay: julianDay,
    lonToSign: lonToSign,
    _internal: { sunPosition: sunPosition, moonPosition: moonPosition, planetPosition: planetPosition, elements: elements }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ASTRO;
  }
  global.ASTRO = ASTRO;
})(typeof window !== 'undefined' ? window : globalThis);
