/* Group Eats — search engine: location, Google Places, Yelp, OpenStreetMap, travel times, photos. */
'use strict';

var WHAT = [['Brunch', '🥞'], ['Breakfast', '🍳'], ['Coffee', '☕'], ['Lunch', '🥪'], ['Dinner', '🍝'], ['Drinks', '🍸'], ['Pizza', '🍕'], ['Sushi', '🍣'], ['Tacos', '🌮'], ['Ramen', '🍜'], ['Burgers', '🍔'], ['Dessert', '🍰']];
var OSM_SYN = {
  brunch: ['brunch', 'breakfast', 'cafe', 'coffee', 'diner', 'pancake', 'bakery', 'bagel', 'crepe', 'waffle', 'french_toast'],
  breakfast: ['breakfast', 'brunch', 'cafe', 'coffee', 'diner', 'pancake', 'bakery', 'bagel', 'donut'],
  coffee: ['coffee', 'cafe', 'coffee_shop', 'espresso', 'tea'],
  drinks: ['bar', 'pub', 'wine', 'cocktail', 'beer', 'brewery'],
  dessert: ['dessert', 'ice_cream', 'cake', 'bakery', 'gelato', 'pastry', 'donut', 'chocolate'],
  tacos: ['taco', 'mexican', 'tex-mex'], burgers: ['burger', 'american'], ramen: ['ramen', 'noodle', 'japanese'],
  lunch: [], dinner: []
};
var OSM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json,*/*;q=0.5', 'Referer': 'https://groupeats.app/' };
var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
var NOMINATIM_H = { 'Accept-Language': 'en', 'Accept': 'application/json', 'Referer': 'https://groupeats.app/' };
var CUISINE_EMOJI = [[/brunch|breakfast|pancake|diner/i, '🥞'], [/coffee|cafe|café|espresso/i, '☕'], [/pizza/i, '🍕'], [/sushi|japanese/i, '🍣'], [/ramen|noodle/i, '🍜'], [/mexican|taco/i, '🌮'],
  [/burger|american/i, '🍔'], [/italian|pasta/i, '🍝'], [/bakery|pastry|croissant/i, '🥐'], [/bar|pub|cocktail|wine|beer/i, '🍸'], [/thai|vietnam|asian|chinese|korean/i, '🥢'], [/indian/i, '🍛'], [/seafood|fish/i, '🦞'],
  [/steak/i, '🥩'], [/vegan|vegetarian|salad/i, '🥗'], [/dessert|ice cream|gelato/i, '🍨'], [/mediterranean|greek|middle eastern/i, '🫒'], [/french/i, '🥖']];
function emojiFor(p) { var s = (p.c || '') + ' ' + p.n; for (var i = 0; i < CUISINE_EMOJI.length; i++) if (CUISINE_EMOJI[i][0].test(s)) return CUISINE_EMOJI[i][1]; return '🍽'; }

function queryText(f) { return (f.text && f.text.trim()) || f.what || 'restaurants'; }
function describe(f, at) {
  if (!f) return '';
  var t = f.when && f.when.mode === 'at' && f.when.time ? ' at ' + niceWhen(f.when) : '';
  return '“' + queryText(f) + '”' + (at && at.label ? ' near ' + at.label : '') + t;
}
function niceWhen(w) { try { var d = new Date(w.date + 'T' + w.time); return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return w.time; } }
function targetDate(f) {
  if (f.when && f.when.mode === 'at' && f.when.date && f.when.time) { var d = new Date(f.when.date + 'T' + f.when.time); if (!isNaN(d)) return d; }
  return new Date();
}

// ================================================================ location
function geocode(label) {
  var u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' + enc(label);
  if (myLoc) u += '&viewbox=' + [myLoc.lng - 1, myLoc.lat + 1, myLoc.lng + 1, myLoc.lat - 1].join(',');
  return reqJSON('GET', u, NOMINATIM_H).catch(function () { return []; }).then(function (j) {
    if (j && j[0]) return { lat: +j[0].lat, lng: +j[0].lon, label: label, cc: j[0].address && j[0].address.country_code };
    if (info().hasGoogle) return reqJSON('POST', 'https://places.googleapis.com/v1/places:searchText', { 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.location' }, JSON.stringify({ textQuery: label, pageSize: 1 }), 'google')
      .then(function (g) { var p = g.places && g.places[0]; if (!p) throw new Error('Couldn’t find “' + label + '”. Try adding a city.'); return { lat: p.location.latitude, lng: p.location.longitude, label: label }; });
    throw new Error('Couldn’t find “' + label + '”. Try adding a city.');
  });
}
function reverseLabel(lat, lng) {
  return reqJSON('GET', 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=' + lat + '&lon=' + lng, NOMINATIM_H)
    .then(function (j) { var a = (j && j.address) || {}; var p = a.neighbourhood || a.suburb || a.quarter || a.road || a.village || a.town || ''; var c = a.city || a.town || a.village || a.county || ''; return { label: [p, c && c !== p ? c : ''].filter(Boolean).join(', ') || 'your location', cc: a.country_code }; })
    .catch(function () { return { label: 'your location', cc: '' }; });
}
function refreshMyLoc(force) {
  if (!force && myLoc && Date.now() - myLoc.ts < 3 * 60000) return Promise.resolve(myLoc);
  return getLocation().then(function (r) {
    if (!r.ok) throw new Error(r.error || 'Location unavailable');
    var prev = myLoc;
    myLoc = { lat: r.lat, lng: r.lng, acc: r.acc, ts: Date.now(), label: prev && dist(prev, r) < 400 ? prev.label : '', cc: prev ? prev.cc : '' };
    var done = myLoc.label ? Promise.resolve() : reverseLabel(r.lat, r.lng).then(function (x) { myLoc.label = x.label; myLoc.cc = x.cc; });
    return done.then(function () { maybeShareLoc(); scheduleRender(); return myLoc; });
  });
}
function originPoints() {
  var pts = [];
  memberList().forEach(function (m) {
    if (m.id === me.id) { if (myLoc && lsGet('ge:shareLoc', false)) pts.push({ lat: myLoc.lat, lng: myLoc.lng, who: m }); }
    else if (m.loc && Date.now() - m.loc.ts < 3 * 3600000) pts.push({ lat: m.loc.lat, lng: m.loc.lng, who: m });
  });
  return pts;
}
function groupCenter() {
  var pts = originPoints(); if (!pts.length) return null;
  var lat = 0, lng = 0; pts.forEach(function (p) { lat += p.lat; lng += p.lng; });
  return { lat: lat / pts.length, lng: lng / pts.length, n: pts.length };
}
function resolveCenter(f) {
  if (f.where.mode === 'place') {
    if (!f.where.label) return Promise.reject(new Error('Type a neighborhood, address or city first.'));
    return geocode(f.where.label);
  }
  if (f.where.mode === 'group') {
    var c = groupCenter();
    if (c && c.n > 1) return reverseLabel(c.lat, c.lng).then(function (x) { return { lat: c.lat, lng: c.lng, label: 'the middle of the group (' + x.label + ')', cc: x.cc }; });
    toast(c ? 'Only one location is shared, so this uses yours.' : 'Nobody has shared a location yet, so this uses yours.');
  }
  return refreshMyLoc(true).then(function (l) { return { lat: l.lat, lng: l.lng, label: l.label || 'you', cc: l.cc }; });
}

// ================================================================ Google Places (New)
var GFIELDS = ['id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel',
  'currentOpeningHours', 'regularOpeningHours', 'googleMapsUri', 'websiteUri', 'nationalPhoneNumber', 'servesBrunch', 'servesBreakfast',
  'servesVegetarianFood', 'outdoorSeating', 'goodForGroups', 'reservable', 'primaryTypeDisplayName', 'businessStatus', 'photos', 'reviews', 'editorialSummary']
  .map(function (x) { return 'places.' + x; }).join(',');
var PRICE = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
var DIET_QUERY = { vegan: 'vegan', 'gluten-free': 'gluten free', halal: 'halal', kosher: 'kosher', 'dairy-free': 'dairy free' };
function openFromPeriods(periods, when) {
  if (!periods || !periods.length) return null;
  if (periods.length === 1 && periods[0].open && !periods[0].close) return true;
  var t = when.getDay() * 1440 + when.getHours() * 60 + when.getMinutes();
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i]; if (!p.open || !p.close) continue;
    var o = p.open.day * 1440 + (p.open.hour || 0) * 60 + (p.open.minute || 0), c = p.close.day * 1440 + (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (c <= o) c += 10080;
    if ((t >= o && t < c) || (t + 10080 >= o && t + 10080 < c)) return true;
  }
  return false;
}
function hoursLine(descs, when) {
  if (!descs || descs.length !== 7) return '';
  return (descs[(when.getDay() + 6) % 7] || '').replace(/^[^:]+:\s*/, '').replace(/ | /g, ' ').slice(0, 60);
}
function googleSearch(f, at, needs) {
  var when = targetDate(f), now = f.when.mode !== 'at';
  var extra = needs.map(function (k) { return DIET_QUERY[k]; }).filter(Boolean);
  var body = { textQuery: queryText(f) + (extra.length ? ' ' + extra.join(' ') : ''), pageSize: 20, rankPreference: f.sort === 'distance' ? 'DISTANCE' : 'RELEVANCE',
    locationBias: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: Math.min(50000, f.radius * 1000) } } };
  if (now && f.open) body.openNow = true;
  if (f.minRating) body.minRating = f.minRating;
  if (f.priceMax) body.priceLevels = ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'].slice(0, f.priceMax);
  var wantVeg = needs.indexOf('vegetarian') >= 0 || needs.indexOf('vegan') >= 0;
  return reqJSON('POST', 'https://places.googleapis.com/v1/places:searchText', { 'Content-Type': 'application/json', 'X-Goog-FieldMask': GFIELDS }, JSON.stringify(body), 'google')
    .then(function (j) {
      return (j.places || []).filter(function (p) { return p.businessStatus !== 'CLOSED_PERMANENTLY' && !(wantVeg && p.servesVegetarianFood === false); }).map(function (p) {
        var op = now ? (p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null) : openFromPeriods(p.regularOpeningHours && p.regularOpeningHours.periods, when);
        var tg = [];
        if (p.servesBrunch) tg.push('Brunch'); if (p.servesBreakfast) tg.push('Breakfast'); if (p.servesVegetarianFood) tg.push('Veg options');
        if (p.outdoorSeating) tg.push('Outdoor'); if (p.goodForGroups) tg.push('Groups'); if (p.reservable) tg.push('Reservations');
        if (p.businessStatus === 'CLOSED_TEMPORARILY') { tg.push('Temporarily closed'); op = false; }
        return { id: 'g:' + p.id, n: (p.displayName && p.displayName.text) || 'Unnamed', a: p.shortFormattedAddress || p.formattedAddress || '',
          la: p.location.latitude, lo: p.location.longitude, c: p.primaryTypeDisplayName ? p.primaryTypeDisplayName.text : '',
          pr: p.priceLevel != null && PRICE[p.priceLevel] ? PRICE[p.priceLevel] : null,
          g: typeof p.rating === 'number' ? [p.rating, p.userRatingCount || 0] : null, op: op,
          ht: hoursLine((p.regularOpeningHours || p.currentOpeningHours || {}).weekdayDescriptions, when),
          tg: tg, u: p.googleMapsUri || '', w: (p.websiteUri || '').length < 120 ? p.websiteUri || '' : '', ph: p.nationalPhoneNumber || '',
          es: p.editorialSummary && p.editorialSummary.text ? p.editorialSummary.text.slice(0, 150) : '',
          _photos: (p.photos || []).slice(0, 4).map(function (x) { return x.name; }),
          rv: (p.reviews || []).filter(function (r) { return r.text && r.text.text; }).slice(0, 2).map(function (r) {
            return [r.rating, r.text.text.replace(/\s+/g, ' ').slice(0, 170), String((r.authorAttribution && r.authorAttribution.displayName) || '').split(' ')[0], r.relativePublishTimeDescription || ''];
          }) };
      });
    });
}
function googlePhotos(items) {
  var jobs = [];
  items.slice(0, 10).forEach(function (it) {
    (it._photos || []).slice(0, 1).forEach(function (name) {
      jobs.push(function () {
        return reqJSON('GET', 'https://places.googleapis.com/v1/' + name + '/media?maxWidthPx=720&skipHttpRedirect=true', null, null, 'google')
          .then(function (j) { if (j && j.photoUri && j.photoUri.length < 600) it.im = j.photoUri; }).catch(function () {});
      });
    });
  });
  var i = 0;
  function next() { if (i >= jobs.length) return Promise.resolve(); return jobs[i++]().then(next); }
  return Promise.all([next(), next(), next(), next()]);
}

// ================================================================ Yelp
function yelpParams(at, term, radiusM, limit) {
  return 'https://api.yelp.com/v3/businesses/search?latitude=' + at.lat.toFixed(6) + '&longitude=' + at.lng.toFixed(6) +
    '&radius=' + Math.round(Math.min(40000, radiusM)) + '&limit=' + limit + '&term=' + enc(term);
}
var YELP_DIET = { vegetarian: 'vegetarian', vegan: 'vegan', 'gluten-free': 'gluten_free', halal: 'halal', kosher: 'kosher' };
function yelpItem(b) {
  var bh = b.business_hours && b.business_hours[0];
  return { id: 'y:' + b.id, n: b.name, a: (b.location && (b.location.display_address || []).join(', ')) || '',
    la: b.coordinates.latitude, lo: b.coordinates.longitude, c: (b.categories || []).map(function (c) { return c.title; }).slice(0, 2).join(', '),
    pr: b.price ? b.price.length : null, y: [b.rating, b.review_count, String(b.url || '').split('?')[0]], op: bh && typeof bh.is_open_now === 'boolean' ? bh.is_open_now : null,
    tg: (b.transactions || []).indexOf('restaurant_reservation') >= 0 ? ['Reservations'] : [], ph: b.display_phone || '',
    im: b.image_url && b.image_url.length < 400 ? b.image_url : '' };
}
function yelpSearch(f, at, needs) {
  var u = yelpParams(at, queryText(f), f.radius * 1000, 40) + '&sort_by=' + (f.sort === 'distance' ? 'distance' : f.sort === 'rating' ? 'rating' : 'best_match');
  if (f.open) u += f.when.mode === 'at' ? '&open_at=' + Math.floor(targetDate(f).getTime() / 1000) : '&open_now=true';
  if (f.priceMax) u += '&price=' + [1, 2, 3, 4].slice(0, f.priceMax).join(',');
  var cats = needs.map(function (k) { return YELP_DIET[k]; }).filter(Boolean);
  if (cats.length) u += '&categories=' + cats.join(',');
  return reqJSON('GET', u, null, null, 'yelp').then(function (j) {
    return (j.businesses || []).filter(function (b) { return !b.is_closed && b.coordinates; }).map(function (b) {
      var it = yelpItem(b); if (f.open && it.op == null) it.op = true; return it;
    });
  });
}
function enrichWithYelp(items, f, at) {
  return reqJSON('GET', yelpParams(at, queryText(f), f.radius * 1000, 50), null, null, 'yelp').then(function (j) {
    var ys = (j.businesses || []).filter(function (b) { return b.coordinates; });
    items.forEach(function (it) {
      for (var i = 0; i < ys.length; i++) {
        var b = ys[i];
        if (dist(ll(it), { lat: b.coordinates.latitude, lng: b.coordinates.longitude }) < 250 && nameMatch(it.n, b.name)) {
          it.y = [b.rating, b.review_count, String(b.url || '').split('?')[0]]; if (!it.im && b.image_url) it._yim = b.image_url; break;
        }
      }
    });
    var missing = items.filter(function (it) { return !it.y; }).slice(0, 8), i = 0;
    function next() {
      if (i >= missing.length) return Promise.resolve();
      var it = missing[i++];
      return reqJSON('GET', yelpParams(ll(it), it.n, 300, 3), null, null, 'yelp').then(function (r) {
        var b = (r.businesses || []).filter(function (b) { return b.coordinates && nameMatch(it.n, b.name) && dist(ll(it), { lat: b.coordinates.latitude, lng: b.coordinates.longitude }) < 300; })[0];
        if (b) { it.y = [b.rating, b.review_count, String(b.url || '').split('?')[0]]; if (b.image_url) it._yim = b.image_url; }
      }).catch(function () {}).then(next);
    }
    return Promise.all([next(), next(), next()]);
  }).then(function () { return items; });
}

// ================================================================ OpenStreetMap (free, no ratings)
// Overpass servers are often overloaded: start the next one every 4 s instead of waiting for a
// failure, give each 20 s, and take the first good answer.
function overpass(query) {
  return new Promise(function (resolve, reject) {
    var done = false, failed = 0, errors = [];
    OVERPASS.forEach(function (url, i) {
      setTimeout(function () {
        if (done) return;
        req('POST', url, OSM_HEADERS, 'data=' + enc(query), '', 20000).then(function (r) {
          if (done) return;
          var j = null; try { j = JSON.parse(r.body); } catch (e) {}
          if (r.code === 200 && j && Array.isArray(j.elements) && !(j.remark && /runtime error|timed out/i.test(j.remark) && !j.elements.length)) { done = true; resolve(j); return; }
          errors.push(url.split('/')[2] + ' ' + (r.code || 'timeout'));
          if (++failed === OVERPASS.length) reject(new Error(errors.join(', ')));
        });
      }, i * 4000);
    });
  });
}
// Fallback when every Overpass server is down: Nominatim's place search (1 request per type, spaced 1.1 s apart
// per its usage policy). Returns Overpass-shaped elements so the same scoring code handles both.
var NOMI_TYPES = { drinks: ['bar', 'pub', 'restaurant'], coffee: ['cafe'], dessert: ['ice_cream', 'cafe'], brunch: ['cafe', 'restaurant'], breakfast: ['cafe', 'restaurant'] };
function nominatimPOIs(at, rM, key) {
  var types = NOMI_TYPES[key] || ['restaurant', 'cafe'];
  var dLat = rM / 111320, dLng = rM / (111320 * Math.cos(at.lat * Math.PI / 180)), box = [at.lng - dLng, at.lat + dLat, at.lng + dLng, at.lat - dLat].join(',');
  var els = [], i = 0;
  function next() {
    if (i >= types.length) return Promise.resolve();
    var t = types[i++];
    return reqJSON('GET', 'https://nominatim.openstreetmap.org/search?format=jsonv2&amenity=' + t + '&extratags=1&addressdetails=1&limit=50&bounded=1&viewbox=' + box, NOMINATIM_H)
      .then(function (j) {
        (j || []).forEach(function (x) {
          var e = x.extratags || {}, a = x.address || {}, tags = { name: x.name, amenity: x.type };
          Object.keys(e).forEach(function (k) { tags[k] = e[k]; });
          if (a.house_number) tags['addr:housenumber'] = a.house_number;
          if (a.road) tags['addr:street'] = a.road;
          if (a.city || a.town) tags['addr:city'] = a.city || a.town;
          if (x.name) els.push({ type: (x.osm_type || 'n')[0], id: x.osm_id, lat: +x.lat, lon: +x.lon, tags: tags });
        });
      }).catch(function () {}).then(function () { return i < types.length ? new Promise(function (r) { setTimeout(r, 1100); }).then(next) : null; });
  }
  return next().then(function () {
    if (!els.length) throw new Error('OpenStreetMap search is unavailable right now. Try again in a minute, or ask someone with the Android app and API keys to search.');
    return { elements: els };
  });
}
function osmSearch(f, at, needs) {
  var r = Math.min(2500, Math.round(f.radius * 1000));
  var q = '[out:json][timeout:20];nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]["name"](around:' + r + ',' + at.lat.toFixed(5) + ',' + at.lng.toFixed(5) + ');out center tags 300;';
  var when = targetDate(f);
  var key0 = queryText(f).toLowerCase().trim();
  // give the Overpass servers 12 s in total, then use Nominatim instead
  var op = overpass(q); op.catch(function () {});
  var slow = new Promise(function (res, rej) { setTimeout(function () { rej(new Error('slow')); }, 12000); });
  return Promise.race([op, slow]).catch(function () { return nominatimPOIs(at, r, key0); }).then(function (j) {
    var key = key0;
    var syn = OSM_SYN[key], terms = syn ? syn : key.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 1; });
    return (j.elements || []).map(function (el) {
      var t = el.tags || {}, lat = el.lat != null ? el.lat : el.center && el.center.lat, lng = el.lon != null ? el.lon : el.center && el.center.lon;
      if (lat == null) return null;
      var hay = [t.name, t.cuisine, t.amenity, t.brunch === 'yes' ? 'brunch' : '', t.breakfast === 'yes' ? 'breakfast' : '', t['diet:vegan'] === 'yes' ? 'vegan' : '', t['cuisine:en']].join(' ').toLowerCase().replace(/_/g, ' ');
      var score = 0;
      if (key === 'dinner' || key === 'lunch' || key === 'restaurants') score = t.amenity === 'restaurant' ? 2 : t.amenity === 'cafe' ? 0 : 1;
      else terms.forEach(function (w, i) { if (hay.indexOf(w.replace(/_/g, ' ')) >= 0) score += i === 0 ? 3 : 1; });
      if (key === 'brunch' && t.brunch === 'yes') score += 3;
      if (score <= 0) return null;
      var op = null, ht = '';
      if (t.opening_hours) {
        ht = t.opening_hours.slice(0, 60);
        try { op = new window.opening_hours(t.opening_hours, { lat: lat, lon: lng, address: { country_code: at.cc || 'us', state: '' } }, { mode: 0 }).getState(when); } catch (e) { op = null; }
      }
      var tg = [];
      if (t.brunch === 'yes' || /brunch/.test(t.cuisine || '')) tg.push('Brunch');
      if (t.outdoor_seating === 'yes') tg.push('Outdoor');
      if (/yes|recommended|required/.test(t.reservation || '')) tg.push('Reservations');
      DIETS.forEach(function (d) { var v = t['diet:' + d[0].replace('-', '_')]; if (v === 'yes' || v === 'only') { tg.push(d[1]); if (needs.indexOf(d[0]) >= 0) score += 2; } });
      var addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') + (t['addr:city'] ? ', ' + t['addr:city'] : '');
      var web = t.website || t['contact:website'] || '';
      return { id: 'o:' + el.type[0] + el.id, n: t.name, a: addr, la: lat, lo: lng,
        c: (t.cuisine || t.amenity || '').replace(/_/g, ' ').replace(/;/g, ', '), pr: null, op: op, ht: ht, tg: tg,
        w: web.length < 120 ? web : '', ph: t.phone || t['contact:phone'] || '', _s: score };
    }).filter(Boolean);
  });
}

// ================================================================ travel ("fairest for everyone")
var MODE_CHAR = { walk: 'w', transit: 't', drive: 'd' };
function estimateMin(m, mode) {
  var d = m * 1.3;
  return Math.max(1, Math.round(mode === 'drive' ? 4 + d / 420 : mode === 'transit' ? 8 + d / 260 : d / 80));
}
function travelTimes(items, mode, useGoogle) {
  var origins = originPoints();
  if (!items.length || !origins.length) return Promise.resolve(false);
  origins = origins.slice(0, 10);
  function estimate() {
    items.forEach(function (it) {
      var ts = origins.map(function (o) { return estimateMin(dist(o, ll(it)), mode); });
      it.tt = [Math.max.apply(null, ts), Math.round(ts.reduce(function (a, b) { return a + b; }, 0) / ts.length), MODE_CHAR[mode], 1];
    });
    return true;
  }
  if (!useGoogle || !info().hasGoogle) return Promise.resolve(estimate());
  var dests = items.slice(0, mode === 'transit' ? Math.floor(100 / origins.length) : Math.floor(600 / origins.length));
  var body = {
    origins: origins.map(function (o) { return { waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } } }; }),
    destinations: dests.map(function (it) { return { waypoint: { location: { latLng: { latitude: it.la, longitude: it.lo } } } }; }),
    travelMode: mode === 'drive' ? 'DRIVE' : mode === 'transit' ? 'TRANSIT' : 'WALK'
  };
  return reqJSON('POST', 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', { 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition' }, JSON.stringify(body), 'google')
    .then(function (rows) {
      var grid = {};
      (rows || []).forEach(function (e) { if (e.condition === 'ROUTE_EXISTS' && e.duration) (grid[e.destinationIndex || 0] = grid[e.destinationIndex || 0] || []).push(Math.round(parseInt(e.duration, 10) / 60)); });
      estimate();
      dests.forEach(function (it, i) { var ts = grid[i]; if (ts && ts.length === origins.length) it.tt = [Math.max.apply(null, ts), Math.round(ts.reduce(function (a, b) { return a + b; }, 0) / ts.length), MODE_CHAR[mode], 0]; });
      return true;
    }).catch(function () { toast('Google travel times unavailable (enable the Routes API). Using estimates.'); return estimate(); });
}

// ================================================================ ranking + orchestration
function ratingOf(p) {
  var n = 0, sum = 0;
  if (p.g) { sum += p.g[0] * p.g[1]; n += p.g[1]; }
  if (p.y) { sum += p.y[0] * p.y[1]; n += p.y[1]; }
  return n ? { r: sum / n, n: n } : null;
}
function rankScore(p, center) {
  var r = ratingOf(p), bayes = r ? (50 * 3.9 + r.n * r.r) / (50 + r.n) : 3.6;
  return bayes - 0.12 * dist(center, ll(p)) / 1000 + (p.op === true ? 0.15 : p.op === false ? -1 : 0) + (p._s ? p._s * 0.05 : 0);
}
function runSearch(f, at) {
  var i = info(), center = { lat: at.lat, lng: at.lng }, src, p;
  var gd = groupDiets(), needs = f.diet ? Object.keys(gd) : [];
  if (i.hasGoogle) { src = i.hasYelp ? 'Google + Yelp' : 'Google'; p = googleSearch(f, at, needs).then(function (items) { return i.hasYelp ? enrichWithYelp(items, f, at).catch(function () { return items; }) : items; }); }
  else if (i.hasYelp) { src = 'Yelp'; p = yelpSearch(f, at, needs); }
  else { src = 'OpenStreetMap'; p = osmSearch(f, at, needs); }
  return p.then(function (items) {
    items.forEach(function (it) { it.d = Math.round(dist(center, ll(it))); it.src = src[0]; });
    items = items.filter(function (it) {
      if (it.d > f.radius * 1000 * 1.35) return false;
      if (f.open && it.op === false) return false;
      var r = it.g ? it.g[0] : it.y ? it.y[0] : null;
      if (f.minRating && r != null && r < f.minRating) return false;
      if (f.priceMax && it.pr != null && it.pr > f.priceMax) return false;
      if (f.outdoor && it.tg.indexOf('Outdoor') < 0) return false;
      if (f.groups && it.tg.indexOf('Groups') < 0 && src !== 'OpenStreetMap') return false;
      if (f.reserve && it.tg.indexOf('Reservations') < 0) return false;
      if (f.brunchMenu && it.tg.indexOf('Brunch') < 0) return false;
      return true;
    });
    items.forEach(function (it) { it._r = rankScore(it, center); });
    items.sort(function (a, b) {
      if (f.sort === 'distance') return a.d - b.d;
      if (f.sort === 'rating') { var ra = ratingOf(a), rb = ratingOf(b); return (rb ? rb.r : 0) - (ra ? ra.r : 0) || a.d - b.d; }
      return b._r - a._r;
    });
    items = items.slice(0, 20);
    var fair = f.sort === 'fair';
    return Promise.all([
      originPoints().length >= (fair ? 1 : 2) ? travelTimes(items, f.mode || 'walk', fair) : Promise.resolve(false),
      i.hasGoogle ? googlePhotos(items) : Promise.resolve()
    ]).then(function () {
      if (fair) items.sort(function (a, b) { return (a.tt ? a.tt[0] : 999) - (b.tt ? b.tt[0] : 999) || b._r - a._r; });
      items.forEach(function (it, idx) {
        if (!it.im && it._yim && it._yim.length < 400) it.im = it._yim;
        if (idx >= 10) { delete it.rv; delete it.es; }
        ['_r', '_s', '_photos', '_yim'].forEach(function (k) { delete it[k]; });
        if (!it.tg || !it.tg.length) delete it.tg;
        if (it.rv && !it.rv.length) delete it.rv;
        Object.keys(it).forEach(function (k) { if (it[k] === '' || it[k] == null) delete it[k]; });
      });
      return { items: items, src: src, needs: needs };
    });
  });
}

// ---- co-search: run here if this phone has keys, otherwise ask a teammate's phone that has them
function startSearch() {
  if (!S) return;
  var f = JSON.parse(JSON.stringify(S.st.filters));
  pushFilters(true);
  setSearching(true, 'Finding where to search…');
  resolveCenter(f).then(function (at) {
    at = { lat: +at.lat.toFixed(5), lng: +at.lng.toFixed(5), label: at.label || '', cc: at.cc || '' };
    var rid = rnd(8), i = info();
    if (i.hasGoogle || i.hasYelp) return doSearchAndPublish(rid, f, at, null);
    var helper = memberList().filter(function (m) { return m.id !== me.id && (m.caps.g || m.caps.y) && Date.now() - m.lastSeen < 30 * 60000; })[0];
    if (!helper) return doSearchAndPublish(rid, f, at, null);
    setSearching(true, 'Asking ' + helper.name + '’s phone for live Google and Yelp results…');
    emit('searchReq', { rid: rid, f: f, at: at });
    S.waiting = { rid: rid, timer: setTimeout(function () {
      if (!S || !S.waiting || S.waiting.rid !== rid) return;
      S.waiting = null;
      setSearching(true, helper.name + '’s phone didn’t answer. Searching OpenStreetMap instead…');
      doSearchAndPublish(rid, f, at, null);
    }, 15000) };
  }).catch(function (e) { setSearching(false); toast(e.message || 'Search failed'); });
}
function doSearchAndPublish(rid, f, at, forReq) {
  if (!forReq) setSearching(true, 'Searching ' + describe(f, at) + '…');
  return runSearch(f, at).then(function (res) {
    publishResults(rid, f, at, res, forReq);
    if (!forReq) { setSearching(false); setTab('find'); scrollToResults(); }
  }).catch(function (e) {
    if (!forReq) setSearching(false);
    var m = e.message || 'Search failed';
    if (e.code === 403 || e.code === 400 || e.code === 401) m = 'API key problem: ' + m;
    toast(m);
    if (forReq) emit('msg', { text: 'My phone couldn’t run that search: ' + m });
    else if (/OpenStreetMap/.test(m)) $('searchNote').textContent = m;
  });
}
function publishResults(rid, f, at, res, forReq) {
  var chunks = [], cur = [], size = 0;
  res.items.forEach(function (it) { var b = bytes(JSON.stringify(it)); if (cur.length && size + b > 2900) { chunks.push(cur); cur = []; size = 0; } cur.push(it); size += b; });
  chunks.push(cur);
  chunks.forEach(function (items, idx) {
    emit('results', { rid: rid, part: idx, of: chunks.length, f: idx === 0 ? f : undefined, at: idx === 0 ? at : undefined, src: res.src, forN: forReq ? forReq.n : undefined, items: items });
  });
}
function maybeFulfil(ev) {
  var i = info();
  if (!(i.hasGoogle || i.hasYelp) || !ev.at) return;
  setTimeout(function () {
    if (!S || S.st.searches[ev.rid]) return;
    doSearchAndPublish(ev.rid, Object.assign(defaultFilters(), ev.f), ev.at, ev);
  }, 300 + Math.random() * 1500);
}
