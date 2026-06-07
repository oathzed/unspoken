/**
 * Nuvio provider — single Weyd source scraper (generated).
 * Source: https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_DebridOnly/maxrls.json
 */
(function (global) {
  'use strict';

  var WEYD_SOURCE_JSON_URL = 'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_DebridOnly/maxrls.json';
  var LOG_TAG = 'max-rls';
  var TMDB_API_KEY = 'd80ba92bc7cefe3359668d30d06f3305';
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var DRILL_CONCURRENCY = 2;
  var MAX_DRILL_LINKS = 8;
  var MAX_TOTAL_STREAMS = 20;

  var TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
  ];

  var HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/json,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  var sourceCache = null;

  function padNum(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function encodePlus(str) {
    return encodeURIComponent(String(str || '')).replace(/%20/g, '+');
  }

  function encodeTitle(str) {
    return encodePlus(str);
  }

  function titleLower(str) {
    return encodePlus(String(str || '').toLowerCase());
  }

  function titleLowerDash(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  function parseYear(dateStr) {
    if (!dateStr) return null;
    var y = parseInt(String(dateStr).split('-')[0], 10);
    return isNaN(y) ? null : y;
  }

  function flatten(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        for (var j = 0; j < arr[i].length; j++) out.push(arr[i][j]);
      } else if (arr[i]) out.push(arr[i]);
    }
    return out;
  }

  function mergeHeaders(a, b) {
    var o = {};
    var k;
    a = a || {};
    b = b || {};
    for (k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    }
    for (k in b) {
      if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
    }
    return o;
  }

  function mapLimit(list, limit, fn) {
    var results = new Array(list.length);
    var idx = 0;
    var active = 0;
    return new Promise(function (resolve) {
      if (!list.length) return resolve([]);
      function next() {
        while (active < limit && idx < list.length) {
          (function (i) {
            active++;
            Promise.resolve(fn(list[i], i))
              .then(function (r) {
                results[i] = r;
              })
              .catch(function () {
                results[i] = [];
              })
              .then(function () {
                active--;
                if (idx >= list.length && active === 0) resolve(results);
                else next();
              });
          })(idx++);
        }
      }
      next();
    });
  }

  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: mergeHeaders(HEADERS, opts.headers || {}),
    };
    if (opts.skipSizeCheck) init.skipSizeCheck = true;
    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    });
  }

  function fetchText(url) {
    return fetchWithTimeout(url).then(function (r) {
      return r.text();
    });
  }

  function fetchJson(url) {
    return fetchWithTimeout(url, { skipSizeCheck: true }).then(function (r) {
      return r.json();
    });
  }

  function javaFormat(template, values) {
    var out = template;
    var vi = 0;
    while (vi < values.length) {
      var m = out.match(/%(\d+\$)?(\.\d+)?(0)?(\d+)?([sd])/);
      if (!m) break;
      var spec = m[0];
      var val = values[vi++];
      var rep;
      if (m[5] === 'd') {
        var width = m[4] ? parseInt(m[4], 10) : 0;
        var num = parseInt(val, 10);
        if (isNaN(num)) num = 0;
        rep = width ? padNum(num, width) : String(num);
      } else {
        rep = String(val);
      }
      out = out.replace(spec, rep);
    }
    return out;
  }

  function resolveReplacement(key, meta) {
    switch (key) {
      case 'title':
        return encodeTitle(meta.title);
      case 'title_lower':
        return titleLower(meta.title);
      case 'title_lower_dash':
        return titleLowerDash(meta.title);
      case 'year_text':
        return meta.year != null ? String(meta.year) : '';
      case 'year_int':
        return meta.year != null ? meta.year : 0;
      case 'season_text':
        return meta.season != null ? String(meta.season) : '';
      case 'season_int':
        return meta.season != null ? parseInt(meta.season, 10) : 0;
      case 'episode_text':
        return meta.episode != null ? String(meta.episode) : '';
      case 'episode_int':
        return meta.episode != null ? parseInt(meta.episode, 10) : 0;
      case 'imdb_id':
        return meta.imdb_id || '';
      default:
        return '';
    }
  }

  function buildSearchPath(source, meta) {
    var fmt =
      meta.mediaType === 'tv'
        ? source.search_url_format_episode
        : source.search_url_format_movie;
    if (!fmt || !fmt.string_format) return null;
    var reps = fmt.replacement || [];
    var needsImdb = false;
    for (var i = 0; i < reps.length; i++) {
      if (reps[i] === 'imdb_id') needsImdb = true;
    }
    if (needsImdb && !meta.imdb_id) return null;
    var values = [];
    for (var j = 0; j < reps.length; j++) {
      values.push(resolveReplacement(reps[j], meta));
    }
    return javaFormat(fmt.string_format, values);
  }

  function buildFullUrl(source, meta) {
    var path = buildSearchPath(source, meta);
    if (!path) return null;
    if (path.indexOf('http://') === 0 || path.indexOf('https://') === 0) {
      return path;
    }
    var base = source.base_url || '';
    if (!base && source.fallback_urls && source.fallback_urls.length) {
      base = source.fallback_urls[0];
    }
    if (!base) return null;
    if (base.charAt(base.length - 1) === '/' && path.charAt(0) === '/') {
      return base + path.substring(1);
    }
    return base + path;
  }

  function getPath(obj, pathStr) {
    if (!pathStr || pathStr === '0') return pathStr === '0' ? 0 : null;
    if (pathStr === '|hash|') return null;
    var parts = pathStr.split('{}');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function extractQuality(text) {
    if (!text) return 'Unknown';
    var t = String(text).toLowerCase();
    if (t.indexOf('2160') >= 0 || t.indexOf('4k') >= 0) return '4K';
    if (t.indexOf('1080') >= 0) return '1080p';
    if (t.indexOf('720') >= 0) return '720p';
    if (t.indexOf('480') >= 0) return '480p';
    var m = t.match(/(\d{3,4})p/);
    if (m) return m[1] + 'p';
    return 'Unknown';
  }

  function formatBytes(size) {
    if (size == null || size === '') return '';
    var n = parseFloat(size);
    if (isNaN(n)) return String(size);
    if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n > 1e6) return (n / 1e6).toFixed(2) + ' MB';
    return String(n);
  }

  function buildMagnet(hashOrMagnet, displayName) {
    if (!hashOrMagnet) return '';
    var s = String(hashOrMagnet).trim();
    if (s.indexOf('magnet:') === 0) {
      if (s.indexOf('&tr=') < 0) {
        var tr = TRACKERS.map(function (t) {
          return '&tr=' + encodeURIComponent(t);
        }).join('');
        return s + tr;
      }
      return s;
    }
    var hash = s.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (hash.length !== 40 && hash.length !== 32) return '';
    var tr2 = TRACKERS.map(function (t) {
      return '&tr=' + encodeURIComponent(t);
    }).join('');
    var dn = displayName ? '&dn=' + encodeURIComponent(displayName) : '';
    return 'magnet:?xt=urn:btih:' + hash + dn + tr2;
  }

  function normalizeHash(h) {
    if (!h) return '';
    h = String(h).trim();
    if (h.indexOf('magnet:') === 0) {
      var m = h.match(/btih:([a-fA-F0-9]{32,40})/i);
      return m ? m[1].toLowerCase() : '';
    }
    return h.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  }

  function streamFromTorrent(opts) {
    var magnet = buildMagnet(opts.magnet || opts.hash, opts.title);
    if (!magnet) return null;
    var seeders = opts.seeders != null ? opts.seeders : '?';
    var size = opts.size ? formatBytes(opts.size) : '';
    var q = opts.quality || extractQuality(opts.title);
    var label = opts.sourceName + ' · ' + q;
    if (seeders !== '?' && seeders !== 0) label += ' · 👤 ' + seeders;
    if (size) label += ' · ' + size;
    return {
      name: label,
      title: label,
      url: magnet,
      quality: q,
      subtitles: [],
    };
  }

  function streamFromDirect(opts) {
    if (!opts.url || opts.url.indexOf('http') !== 0) return null;
    var label = (opts.title || opts.url).substring(0, 120);
    return {
      name: label,
      title: label,
      url: opts.url,
      quality: extractQuality(opts.title),
      subtitles: [],
    };
  }

  function getTmdbApiKey() {
    try {
      var g = global;
      if (g && g.SCRAPER_SETTINGS && g.SCRAPER_SETTINGS.tmdbApiKey) {
        return String(g.SCRAPER_SETTINGS.tmdbApiKey);
      }
    } catch (e) {}
    return TMDB_API_KEY;
  }

  function getMeta(tmdbId, mediaType, season, episode) {
    var type = mediaType === 'tv' ? 'tv' : 'movie';
    var url =
      TMDB_BASE +
      '/' +
      type +
      '/' +
      tmdbId +
      '?api_key=' +
      getTmdbApiKey() +
      '&append_to_response=external_ids';
    return fetchJson(url)
      .then(function (data) {
        var title = type === 'tv' ? data.name : data.title;
        var year = parseYear(
          type === 'tv' ? data.first_air_date : data.release_date
        );
        var imdb =
          (data.external_ids && data.external_ids.imdb_id) || null;
        return {
          title: title || 'Unknown',
          year: year,
          imdb_id: imdb,
          mediaType: mediaType,
          season: season != null ? parseInt(season, 10) : null,
          episode: episode != null ? parseInt(episode, 10) : null,
        };
      })
      .catch(function (err) {
        console.log('[' + LOG_TAG + '] TMDB failed: ' + (err && err.message));
        return {
          title: 'Unknown',
          year: null,
          imdb_id: null,
          mediaType: mediaType,
          season: season != null ? parseInt(season, 10) : null,
          episode: episode != null ? parseInt(episode, 10) : null,
        };
      });
  }

  function loadSourceConfig() {
    if (sourceCache) return Promise.resolve(sourceCache);
    return fetchJson(WEYD_SOURCE_JSON_URL).then(function (data) {
      sourceCache = data;
      return data;
    });
  }

  function collectApiItems(json, api) {
    var items = [];
    if (api.path_to_base_array) {
      var bases = getPath(json, api.path_to_base_array);
      if (!bases) bases = [];
      if (!Array.isArray(bases)) bases = [bases];
      for (var b = 0; b < bases.length; b++) {
        var sub = api.path_to_array
          ? getPath(bases[b], api.path_to_array)
          : [bases[b]];
        if (!sub) continue;
        if (!Array.isArray(sub)) sub = [sub];
        for (var s = 0; s < sub.length; s++) {
          items.push({ row: sub[s], parent: bases[b] });
        }
      }
      return items;
    }
    if (api.path_to_array) {
      var arr = getPath(json, api.path_to_array);
      if (!arr) return [];
      if (!Array.isArray(arr)) arr = [arr];
      for (var i = 0; i < arr.length; i++) {
        items.push({ row: arr[i], parent: json });
      }
      return items;
    }
    if (Array.isArray(json)) {
      for (var k = 0; k < json.length; k++) {
        items.push({ row: json[k], parent: json });
      }
      return items;
    }
    items.push({ row: json, parent: json });
    return items;
  }

  function apiField(item, parent, api, key) {
    var pathKey = api[key];
    if (pathKey === '0') return 0;
    if (pathKey == null || pathKey === '') return null;
    var fromRow = getPath(item, pathKey);
    if (fromRow != null) return fromRow;
    return getPath(parent, pathKey);
  }

  function parseApiResponse(json, source) {
    var api = source.api;
    var name = source.name || LOG_TAG;
    var pairs = collectApiItems(json, api);
    var streams = [];
    for (var i = 0; i < pairs.length; i++) {
      var row = pairs[i].row;
      var parent = pairs[i].parent;
      var title =
        apiField(row, parent, api, 'path_title_in_array') ||
        apiField(row, parent, api, 'path_title') ||
        '';
      if (api.api_title_split && title) {
        try {
          var parts = String(title).split(new RegExp(api.api_title_split));
          title = parts[parts.length - 1] || title;
        } catch (regexErr) {}
      }
      var hash = apiField(row, parent, api, 'path_hash');
      var magnet = apiField(row, parent, api, 'path_magnet');
      var torrentUrl = apiField(row, parent, api, 'path_torrent');
      var seeders = apiField(row, parent, api, 'path_seeders');
      var size = apiField(row, parent, api, 'path_size');
      var quality =
        apiField(row, parent, api, 'path_quality') || extractQuality(title);
      var link = magnet || hash;
      if (!link && torrentUrl) continue;
      var st = streamFromTorrent({
        sourceName: name,
        title: title,
        hash: link,
        magnet: magnet,
        seeders: seeders,
        size: size,
        quality: quality,
      });
      if (st) streams.push(st);
    }
    return streams;
  }

  function scrapeApi(source, meta) {
    var url = buildFullUrl(source, meta);
    if (!url) return Promise.resolve([]);
    var bases = [source.base_url].concat(source.fallback_urls || []);
    var tryIdx = 0;
    function attempt() {
      var tryUrl = url;
      if (tryIdx > 0 && bases[tryIdx]) {
        var path = buildSearchPath(source, meta);
        tryUrl =
          bases[tryIdx].replace(/\/$/, '') +
          (path.charAt(0) === '/' ? path : '/' + path);
      }
      return fetchJson(tryUrl)
        .then(function (json) {
          return parseApiResponse(json, source);
        })
        .catch(function () {
          tryIdx++;
          if (tryIdx < bases.length) return attempt();
          return [];
        });
    }
    return attempt();
  }

  function resolveUrl(base, href) {
    if (!href) return '';
    href = href.trim();
    if (href.indexOf('http://') === 0 || href.indexOf('https://') === 0) {
      return href;
    }
    if (href.indexOf('//') === 0) return 'https:' + href;
    var baseStr = String(base || '');
    var originMatch = baseStr.match(/^(https?:\/\/[^/]+)/i);
    var origin = originMatch ? originMatch[1] : '';
    if (!origin) return href;
    if (href.charAt(0) === '/') return origin + href;
    var baseNoQuery = baseStr.split('#')[0].split('?')[0];
    var dir =
      baseNoQuery.lastIndexOf('/') >= 0
        ? baseNoQuery.substring(0, baseNoQuery.lastIndexOf('/') + 1)
        : origin + '/';
    return dir + href;
  }

  function decodeHtml(s) {
    return String(s || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function stripTags(s) {
    return decodeHtml(String(s || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractAllMagnets(html) {
    var magnets = [];
    var re = /magnet:\?[^"'<\s]+/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      magnets.push(m[0]);
    }
    return magnets;
  }

  function extractHrefs(html) {
    var links = [];
    var re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      links.push({ href: m[1] });
    }
    return links;
  }

  function hrefMatchesRule(href, rule) {
    if (!rule) return true;
    href = href || '';
    var hm = rule.match(/\[href\^=([^\]]+)\]/);
    if (hm) {
      var prefix = hm[1].replace(/['"]/g, '');
      return href.indexOf(prefix) === 0;
    }
    if (rule.match(/:contains\(/)) return false;
    if (rule.indexOf('/torrent') >= 0 && href.indexOf('/torrent') >= 0) {
      return true;
    }
    return true;
  }

  function filterDrillLinks(html, source, pageUrl) {
    var rule = source.drill_down_path || '';
    var links = extractHrefs(html);
    var out = [];
    var seen = {};
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href;
      if (!hrefMatchesRule(href, rule)) continue;
      if (rule.indexOf('rlsbb') >= 0 && href.indexOf('rlsbb') < 0) continue;
      if (rule.indexOf('rapidgator') >= 0 && href.indexOf('rapidgator') < 0) {
        continue;
      }
      if (rule.indexOf('/torrent') >= 0 && href.indexOf('/torrent') < 0) {
        continue;
      }
      var full = resolveUrl(pageUrl, href);
      if (!seen[full]) {
        seen[full] = true;
        out.push(full);
      }
    }
    return out;
  }

  function scrapeHtmlPage(html, source, pageUrl) {
    var name = source.name || LOG_TAG;
    var streams = [];
    if (source.is_direct && !source.is_torrent) {
      var dlinks = extractHrefs(html);
      for (var d = 0; d < dlinks.length; d++) {
        var h = dlinks[d].href;
        if (h.indexOf('rapidgator') >= 0 || h.indexOf('http') === 0) {
          var full = resolveUrl(pageUrl, h);
          var st = streamFromDirect({
            sourceName: name,
            title: name + ' link',
            url: full,
          });
          if (st) streams.push(st);
        }
      }
      return streams;
    }
    var magnets = extractAllMagnets(html);
    var seen = {};
    for (var m = 0; m < magnets.length; m++) {
      var hash = normalizeHash(magnets[m]);
      if (!hash || seen[hash]) continue;
      seen[hash] = true;
      var st2 = streamFromTorrent({
        sourceName: name,
        title: name + ' torrent',
        magnet: magnets[m],
      });
      if (st2) streams.push(st2);
    }
    return streams;
  }

  function scrapeHtml(source, meta) {
    var url = buildFullUrl(source, meta);
    if (!url) return Promise.resolve([]);
    return fetchText(url).then(function (html) {
      if (!source.links_on_first_page && source.drill_down_path) {
        var drill = filterDrillLinks(html, source, url).slice(0, MAX_DRILL_LINKS);
        if (!drill.length) return scrapeHtmlPage(html, source, url);
        return mapLimit(drill, DRILL_CONCURRENCY, function (link) {
          return fetchText(link)
            .then(function (detail) {
              return scrapeHtmlPage(detail, source, link);
            })
            .catch(function () {
              return [];
            });
        }).then(flatten);
      }
      return scrapeHtmlPage(html, source, url);
    });
  }

  function scrapeSource(source, meta) {
    if (!source) return Promise.resolve([]);
    if (source.api) return scrapeApi(source, meta);
    return scrapeHtml(source, meta);
  }

  function dedupeStreams(streams) {
    var seen = {};
    var out = [];
    for (var i = 0; i < streams.length; i++) {
      var s = streams[i];
      if (!s || !s.url) continue;
      var key =
        s.url.indexOf('magnet:') === 0 ? normalizeHash(s.url) : s.url;
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(s);
    }
    out.sort(function (a, b) {
      var order = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, Unknown: 1 };
      return (order[b.quality] || 0) - (order[a.quality] || 0);
    });
    return out.slice(0, MAX_TOTAL_STREAMS);
  }

  function getStreams(tmdbId, mediaType, season, episode) {
    console.log(
      '[' +
        LOG_TAG +
        '] ' +
        mediaType +
        ' ' +
        tmdbId +
        (mediaType === 'tv' ? ' S' + season + 'E' + episode : '')
    );
    return getMeta(tmdbId, mediaType, season, episode)
      .then(function (meta) {
        return loadSourceConfig().then(function (source) {
          return scrapeSource(source, meta);
        });
      })
      .then(function (streams) {
        console.log('[' + LOG_TAG + '] found ' + streams.length);
        return dedupeStreams(streams);
      })
      .catch(function (err) {
        console.log('[' + LOG_TAG + '] error: ' + (err && err.message));
        return [];
      });
  }

  var exportsObj = { getStreams: getStreams };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : typeof window !== 'undefined'
          ? window
          : this;
  if (root) {
    root.getStreams = getStreams;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : typeof window !== 'undefined'
        ? window
        : this
);
