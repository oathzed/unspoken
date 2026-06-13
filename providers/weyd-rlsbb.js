/**
 * Nuvio provider — single Weyd source scraper (generated).
 * Config: en_DebridOnly/rlsbb.json
 */
(function (global) {
  'use strict';

  var WEYD_SOURCE_CONFIG = {"name":"Rapidgator","language":["hi","en"],"domains":["rlsbb.ru","rlsbb.to","rlsbb.com","rlsbb.unblocked.cx"],"base_url":"","search_url_format_episode":{"string_format":"https://search.rlsbb.in/?s=%s+S%02dE%02d","replacement":["title","season_int","episode_int"]},"search_url_format_movie":{"string_format":"https://search.rlsbb.in/?s=%s+%04d","replacement":["title","year_int"]},"more_pages_indicator":"","next_page_path":"","next_page_path_attr":"","links_on_first_page":false,"drill_down_path":"div#post-wrapper div.entry-data-wrapper h1.entry-title a[href*=rlsbb.in]","drill_down_path_attr":"href","is_torrent":false,"is_direct":true,"links_container_path":"ul.commentList div.messageBox","link_path":"p a[href*=\"rapidgator.net/file/\"]","link_path_attr":"href","title_path":"p:not(:has(a))","title_path_attr":"","details_path":"|title_path|","details_path_attr":"","magnet_path":"","magnet_path_attr":"","seeders_path":"","seeders_path_attr":"","filesize_path":"p:has(b):contains(size) b","filesize_path_attr":"text","quality_path":"|title_path|","quality_path_attr":"","info_path":"|title_path|","info_path_attr":""};
  var LOG_TAG = 'Rapidgator';
  var TMDB_API_KEY = 'd80ba92bc7cefe3359668d30d06f3305';
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var DRILL_CONCURRENCY = 6;
  var MAX_DRILL_LINKS = 50;
  var MAX_HTML_ROWS = 200;
  var MAX_STREAMS_PER_PAGE = 999;
  var MAX_TOTAL_STREAMS = 999;

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

  function padNum(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /** Weyd: spaces -> + (not full URI encoding). */
  function weydPlusEncode(str) {
    return String(str || '').trim().replace(/\s+/g, '+');
  }

  function encodeTitle(str) {
    return weydPlusEncode(str);
  }

  function titleLower(str) {
    return weydPlusEncode(String(str || '').toLowerCase());
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

  function metaSearchTitle(meta) {
    if (!meta) return '';
    return meta.searchTitle || meta.title || '';
  }

  function stripRegionalTitleSuffix(name) {
    return String(name || '')
      .replace(
        /\s+(USA|UK|U\.K\.|Australia|France|Spain|Italy|Germany|Norway|Sweden|Games|All Stars)$/i,
        ''
      )
      .trim();
  }

  function resolveSearchTitle(tmdbName, mediaType, season, numSeasons) {
    if (mediaType !== 'tv' || !tmdbName) return tmdbName || 'Unknown';
    if (season == null || !numSeasons || season <= numSeasons) return tmdbName;
    var stripped = stripRegionalTitleSuffix(tmdbName);
    return stripped && stripped !== tmdbName ? stripped : tmdbName;
  }

  function resolveReplacement(key, meta) {
    var searchTitle = metaSearchTitle(meta);
    switch (key) {
      case 'title':
        return encodeTitle(searchTitle);
      case 'title_lower':
        return titleLower(searchTitle);
      case 'title_lower_dash':
        return titleLowerDash(searchTitle);
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

  function isTestFullMode() {
    try {
      if (typeof global !== 'undefined' && global.WEYD_TEST_FULL) return true;
      if (
        typeof process !== 'undefined' &&
        process.env &&
        process.env.WEYD_TEST_FULL === '1'
      ) {
        return true;
      }
    } catch (modeErr) {}
    return false;
  }

  function magnetDisplayName(magnet) {
    if (!magnet) return '';
    var s = String(magnet);
    var m = s.match(/[?&]dn=([^&]+)/i);
    if (!m) return '';
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch (decodeErr) {
      return m[1].replace(/\+/g, ' ');
    }
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
    var releaseTitle = cleanReleaseTitle((opts.title || '').trim());
    if (
      !releaseTitle ||
      releaseTitle === opts.sourceName ||
      releaseTitle === opts.sourceName + ' torrent'
    ) {
      releaseTitle =
        cleanReleaseTitle(magnetDisplayName(opts.magnet || opts.hash)) ||
        releaseTitle;
    }
    var magnet = buildMagnet(
      opts.magnet || opts.hash,
      releaseTitle || opts.title
    );
    if (!magnet) return null;
    if (!releaseTitle) releaseTitle = magnetDisplayName(magnet);
    var seeders = opts.seeders != null ? opts.seeders : '?';
    var size = opts.size ? formatBytes(opts.size) : '';
    var q = opts.quality || extractQuality(releaseTitle || opts.title);
    var label = opts.sourceName;
    if (releaseTitle) label += ' · ' + releaseTitle;
    else label += ' · ' + q;
    if (seeders !== '?' && seeders !== 0) label += ' · 👤 ' + seeders;
    if (size) label += ' · ' + size;
    return {
      name: label,
      title: label,
      url: magnet,
      quality: q,
      releaseName: releaseTitle || '',
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
        var seasonNum = season != null ? parseInt(season, 10) : null;
        var searchTitle = resolveSearchTitle(
          title,
          mediaType,
          seasonNum,
          data.number_of_seasons
        );
        if (searchTitle !== title) {
          console.log(
            '[' +
              LOG_TAG +
              '] search title "' +
              searchTitle +
              '" (S' +
              seasonNum +
              ' > ' +
              data.number_of_seasons +
              ' seasons for "' +
              title +
              '")'
          );
        }
        return {
          title: title || 'Unknown',
          searchTitle: searchTitle,
          year: year,
          imdb_id: imdb,
          mediaType: mediaType,
          season: seasonNum,
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
    return Promise.resolve(WEYD_SOURCE_CONFIG);
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

  function normalizeForMatch(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function episodePatterns(meta) {
    if (!meta || meta.mediaType !== 'tv') return [];
    if (meta.season == null || meta.episode == null) return [];
    var s = parseInt(meta.season, 10);
    var e = parseInt(meta.episode, 10);
    var sp = s < 10 ? '0' + s : String(s);
    var ep = e < 10 ? '0' + e : String(e);
    return [
      's' + sp + 'e' + ep,
      's' + s + 'e' + e,
      s + 'x' + ep,
      s + 'x' + e,
    ];
  }

  function metaMatchesTitle(meta, scrapedTitle) {
    if (!meta || !scrapedTitle) return true;
    var searchTitle = metaSearchTitle(meta);
    if (!searchTitle) return true;
    var t = String(scrapedTitle).toLowerCase();
    var tNorm = String(scrapedTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
    var showNorm = searchTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Show name must be present
    if (showNorm.length >= 3 && tNorm.indexOf(showNorm) < 0) {
      var alt = showNorm.replace(/^the/, '');
      if (alt.length >= 3 && tNorm.indexOf(alt) < 0) return false;
    }

    if (meta.mediaType === 'tv') {
      var pats = episodePatterns(meta);
      if (pats.length) {
        // 2. Episode code must be present somewhere
        var hasEp = false;
        for (var i = 0; i < pats.length; i++) {
          if (t.indexOf(pats[i]) >= 0) { hasEp = true; break; }
        }
        if (!hasEp) return false;

        // 3. Reject spin-offs/variants: the episode code must appear with
        //    ONLY separators (space/dot/underscore/dash) between show name end
        //    and episode code — no extra words allowed in between.
        //    e.g. "Love Island S08E01" passes, "Love Island US S08E01" fails,
        //    "Love Island After Sun S08E01" fails.
        var showWords = searchTitle.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
        var showPat = showWords.map(function(w) {
          return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('[\\s._\\-]+');
        for (var pi = 0; pi < pats.length; pi++) {
          var epPat = pats[pi].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // allow only separators between show name and episode code
          if (new RegExp(showPat + '[\\s._\\-]*' + epPat, 'i').test(t)) return true;
        }
        return false;
      }
      return true;
    }

    if (meta.mediaType === 'movie' && meta.year) {
      if (t.indexOf(String(meta.year)) < 0) return false;
    }
    return true;
  }

  // Loose version used for drill-down link filtering — just checks show name
  // and episode are both present, without strict adjacency. This avoids
  // blocking posts where the title has extra info before the episode code.
  function metaMatchesTitleLoose(meta, scrapedTitle) {
    if (!meta || !scrapedTitle) return true;
    var searchTitle = metaSearchTitle(meta);
    if (!searchTitle) return true;
    var t = String(scrapedTitle).toLowerCase();
    var tNorm = t.replace(/[^a-z0-9]/g, '');
    var showNorm = searchTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (showNorm.length >= 3 && tNorm.indexOf(showNorm) < 0) {
      var alt = showNorm.replace(/^the/, '');
      if (alt.length >= 3 && tNorm.indexOf(alt) < 0) return false;
    }
    if (meta.mediaType === 'tv') {
      var pats = episodePatterns(meta);
      if (!pats.length) return true;
      for (var i = 0; i < pats.length; i++) {
        if (t.indexOf(pats[i]) >= 0) return true;
      }
      return false;
    }
    if (meta.mediaType === 'movie' && meta.year) {
      if (t.indexOf(String(meta.year)) < 0) return false;
    }
    return true;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function hrefNeedleFromPath(pathStr) {
    if (!pathStr) return '';
    // handles both a[href*="needle"] and a[href*='needle']
    var qm = pathStr.match(/\[href\*=["']([^"']+)["']\]/);
    if (qm) return qm[1];
    // handles a[href^="needle"]
    var pm = pathStr.match(/\[href\^=["']([^"']+)["']\]/);
    if (pm) return pm[1];
    if (pathStr.indexOf('magnet') >= 0) return 'magnet:';
    return '';
  }

  function parseApiResponse(json, source, meta) {
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
      if (meta && title && !metaMatchesTitle(meta, title)) continue;
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
    if (!url) {
      var noUrl = [];
      noUrl._status = 'no_url';
      noUrl._error = 'Could not build search URL (missing imdb_id or bad config)';
      return Promise.resolve(noUrl);
    }
    var bases = [source.base_url].concat(source.fallback_urls || []);
    var tryIdx = 0;
    var lastErr = null;
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
          return parseApiResponse(json, source, meta);
        })
        .catch(function (err) {
          lastErr = err;
          tryIdx++;
          if (tryIdx < bases.length) return attempt();
          var failed = [];
          failed._status = 'fetch_error';
          failed._error = lastErr ? (lastErr.message || String(lastErr)) : 'fetch failed';
          return failed;
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
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_m, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/&#(\d+);/g, function (_m, num) {
        return String.fromCharCode(parseInt(num, 10));
      });
  }

  function cleanReleaseTitle(title) {
    return String(title || '')
      .replace(/^magnet\s*link\s*/i, '')
      .replace(/^download\s*torrent\s*/i, '')
      .replace(/\s+\d+\s+(months?|years?|weeks?|days?|hours?)\s+ago\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
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
      magnets.push(decodeHtml(m[0]));
    }
    return magnets;
  }

  function extractAnchors(html, maxLinks) {
    var links = [];
    var re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var cap = maxLinks || 500;
    while ((m = re.exec(html)) !== null) {
      links.push({ href: m[1], text: stripTags(m[2]) });
      if (links.length >= cap) break;
    }
    return links;
  }

  function extractDrillAnchors(html, rule) {
    if (rule && rule.indexOf('entry-title') >= 0) {
      var scoped = [];
      var blockRe = /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<\/h1>/gi;
      var bm;
      while ((bm = blockRe.exec(html)) !== null) scoped.push(bm[0]);
      if (scoped.length) {
        var links = [];
        for (var i = 0; i < scoped.length; i++) {
          links = links.concat(extractAnchors(scoped[i], 20));
        }
        return links;
      }
    }
    return extractAnchors(html, 200);
  }

  function extractHrefs(html) {
    return extractAnchors(html);
  }

  function extractPageTitle(html, source) {
    if (!html) return '';
    var tp = (source && source.title_path) || '';
    if (tp.indexOf('h2') >= 0) {
      var h2m = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (h2m) return stripTags(h2m[1]);
    }
    if (tp.indexOf('name') >= 0) {
      var nm = html.match(
        />\s*Name\s*:?\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
      );
      if (nm) return stripTags(nm[1]);
    }
    var h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1m) return stripTags(h1m[1]).substring(0, 200);
    return '';
  }

  function extractTitleFromRow(html, source, row) {
    if (!row) return '';
    if (source && source.title_path && source.title_path.indexOf('h2') >= 0) {
      var h2r = row.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (h2r) return cleanReleaseTitle(stripTags(h2r[1]));
    }
    var pageTitle = cleanReleaseTitle(extractPageTitle(html, source));
    if (pageTitle) return pageTitle;
    var anchor = row.match(
      /<a[^>]*href=["']magnet:[^"']+["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (anchor) {
      var at = cleanReleaseTitle(stripTags(anchor[1]));
      if (
        at &&
        at.length > 2 &&
        at.toLowerCase() !== 'magnet' &&
        at.toLowerCase() !== 'download' &&
        at.toLowerCase() !== 'torrent'
      ) {
        return at;
      }
    }
    var mg = row.match(/magnet:\?[^"'<\s]+/i);
    if (mg) {
      var dn = magnetDisplayName(decodeHtml(mg[0]));
      if (dn) return cleanReleaseTitle(dn);
    }
    var rowText = stripTags(row);
    if (rowText && rowText.length > 3 && rowText.length < 300) {
      return cleanReleaseTitle(rowText);
    }
    return '';
  }

  function extractHtmlRows(html, containerPath) {
    if (!containerPath) return [html];
    var rows = [];
    // these containers hold all links in one block — return whole page for needle scanning
    if (containerPath.indexOf('entry-content') >= 0 ||
        containerPath.indexOf('bbWrapper') >= 0 ||
        containerPath.indexOf('box_in') >= 0) {
      return [html];
    }
    if (containerPath.indexOf('messageBox') >= 0) {
      var parts = html.split(/<div[^>]*class="[^"]*messageBox[^"]*"[^>]*>/i);
      var maxParts = MAX_HTML_ROWS + 1;
      for (var i = 1; i < parts.length && i < maxParts; i++) rows.push(parts[i]);
      return rows.length ? rows : [html];
    }
    if (containerPath.indexOf('magnet') >= 0) {
      var aMagRe =
        /<a\s[^>]*href\s*=\s*["'](magnet:[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
      var am;
      while ((am = aMagRe.exec(html)) !== null) {
        rows.push(am[0]);
        if (rows.length >= MAX_HTML_ROWS) break;
      }
      return rows.length ? rows : [html];
    }
    if (containerPath.indexOf('download') >= 0) {
      var dlParts = html.split(
        /<div[^>]*class="[^"]*download[^"]*"[^>]*>/i
      );
      for (var d = 1; d < dlParts.length && d < MAX_HTML_ROWS + 1; d++) {
        rows.push(dlParts[d]);
      }
      return rows.length ? rows : [html];
    }
    if (containerPath.indexOf('tr') >= 0 || containerPath.indexOf('table') >= 0) {
      var trRe = /<tr[\s>][\s\S]*?<\/tr>/gi;
      var tm;
      while ((tm = trRe.exec(html)) !== null) {
        rows.push(tm[0]);
        if (rows.length >= MAX_HTML_ROWS) break;
      }
      return rows.length ? rows : [html];
    }
    return [html];
  }

  function hrefMatchesRule(href, rule) {
    if (!rule) return true;
    href = href || '';
    var containsM = rule.match(/\[href\*=([^\]]+)\]/);
    if (containsM) {
      var needle = containsM[1].replace(/['"]/g, '');
      return href.indexOf(needle) >= 0;
    }
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

  function filterDrillLinks(html, source, pageUrl, meta) {
    var rule = source.drill_down_path || '';
    var links = extractDrillAnchors(html, rule);
    var out = [];
    var seen = {};
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href;
      var text = links[i].text || '';
      if (!hrefMatchesRule(href, rule)) continue;
      if (rule.indexOf('rlsbb') >= 0 && href.indexOf('rlsbb') < 0) continue;
      if (rule.indexOf('rlsbb') >= 0 && href.indexOf('/category/') >= 0) continue;
      if (text === 'No data found') continue;
      if (rule.indexOf('rapidgator') >= 0 && href.indexOf('rapidgator') < 0) {
        continue;
      }
      if (rule.indexOf('/torrent') >= 0 && href.indexOf('/torrent') < 0) {
        continue;
      }
      if (
        meta &&
        source.check_title_before_drill_down
      ) {
        if (!metaMatchesTitleLoose(meta, text)) continue;
      }      var full = resolveUrl(pageUrl, href);
      if (!seen[full]) {
        seen[full] = true;
        out.push(full);
      }
    }
    return out;
  }

  function scrapeHtmlRows(html, source, pageUrl, meta) {
    var name = source.name || LOG_TAG;
    var rows = extractHtmlRows(html, source.links_container_path || '');
    var streams = [];
    var linkNeedle = hrefNeedleFromPath(source.link_path || '');
    var magnetNeedle = hrefNeedleFromPath(source.magnet_path || '');

    var pageTitle = extractPageTitle(html, source);
    var rowCap = rows.length > MAX_HTML_ROWS ? MAX_HTML_ROWS : rows.length;
    for (var r = 0; r < rowCap; r++) {
      if (streams.length >= MAX_STREAMS_PER_PAGE) break;
      var row = rows[r];
      var rowTitle =
        extractTitleFromRow(html, source, row) || pageTitle || '';
      if (meta && rowTitle && !metaMatchesTitle(meta, rowTitle)) continue;

      if (source.is_direct && !source.is_torrent) {
        if (!linkNeedle) continue;
        // scan every anchor in the row that contains the needle
        var allAnchors = extractAnchors(row, 500);
        for (var ai = 0; ai < allAnchors.length; ai++) {
          var aHref = decodeHtml(allAnchors[ai].href || '');
          if (aHref.indexOf(linkNeedle) < 0) continue;
          var fullUrl = resolveUrl(pageUrl, aHref);
          var st = streamFromDirect({
            sourceName: name,
            title: rowTitle || name,
            url: fullUrl,
          });
          if (st) streams.push(st);
        }
        continue;
      }

      if (magnetNeedle || source.magnet_path) {
        var magnets = extractAllMagnets(row);
        for (var mi = 0; mi < magnets.length; mi++) {
          var stM = streamFromTorrent({
            sourceName: name,
            title: rowTitle || name,
            magnet: magnets[mi],
          });
          if (stM) {
            streams.push(stM);
            if (streams.length >= MAX_STREAMS_PER_PAGE) break;
          }
        }
      }
    }
    return streams;
  }

  function scrapeHtmlPage(html, source, pageUrl, meta) {
    if (source.links_container_path) {
      return scrapeHtmlRows(html, source, pageUrl, meta);
    }
    var name = source.name || LOG_TAG;
    var streams = [];
    var pageTitle = extractPageTitle(html, source);

    // direct link mode — scan all anchors for the link needle
    if (source.is_direct && !source.is_torrent) {
      var linkNeedle2 = hrefNeedleFromPath(source.link_path || '');
      if (linkNeedle2) {
        var allLinks = extractAnchors(html, 1000);
        for (var li = 0; li < allLinks.length; li++) {
          var lHref = decodeHtml(allLinks[li].href || '');
          if (lHref.indexOf(linkNeedle2) < 0) continue;
          var st3 = streamFromDirect({
            sourceName: name,
            title: pageTitle || name,
            url: resolveUrl(pageUrl, lHref),
          });
          if (st3) streams.push(st3);
        }
        return streams;
      }
    }

    // torrent / magnet fallback
    var magnets = extractAllMagnets(html);
    var seen = {};
    for (var m = 0; m < magnets.length; m++) {
      var hash = normalizeHash(magnets[m]);
      if (!hash || seen[hash]) continue;
      seen[hash] = true;
      var st2 = streamFromTorrent({
        sourceName: name,
        title: pageTitle || magnetDisplayName(magnets[m]) || name,
        magnet: magnets[m],
      });
      if (st2) streams.push(st2);
    }
    return streams;
  }

  function scrapeHtml(source, meta) {
    var url = buildFullUrl(source, meta);
    if (!url) {
      var noUrl = [];
      noUrl._status = 'no_url';
      noUrl._error = 'Could not build search URL (missing imdb_id or bad config)';
      return Promise.resolve(noUrl);
    }
    console.log('[' + LOG_TAG + '] GET ' + url);
    return fetchText(url).then(function (html) {
      if (!source.links_on_first_page && source.drill_down_path) {
        var drill = filterDrillLinks(html, source, url, meta).slice(
          0,
          MAX_DRILL_LINKS
        );
        if (!drill.length) {
          var noDrill = [];
          noDrill._status = 'no_results';
          noDrill._error = 'No drill-down links matched on search page';
          return noDrill;
        }
        var collected = [];
        return mapLimit(drill, DRILL_CONCURRENCY, function (link) {
          if (collected.length >= MAX_TOTAL_STREAMS) return Promise.resolve([]);
          return fetchText(link)
            .then(function (detail) {
              return scrapeHtmlPage(detail, source, link, meta);
            })
            .catch(function () {
              return [];
            })
            .then(function (pageStreams) {
              for (var pi = 0; pi < pageStreams.length; pi++) {
                collected.push(pageStreams[pi]);
                if (collected.length >= MAX_TOTAL_STREAMS) break;
              }
              return pageStreams;
            });
        }).then(function () {
          return collected;
        });
      }
      return scrapeHtmlPage(html, source, url, meta);
    }).catch(function (err) {
      var failed = [];
      failed._status = 'fetch_error';
      failed._error = err ? (err.message || String(err)) : 'fetch failed';
      return failed;
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
    if (isTestFullMode()) return out;
    return out.slice(0, 45);
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
        var raw = streams || [];
        var out = dedupeStreams(raw);
        out._matched = raw.length;
        out._status = raw._status || (out.length > 0 ? 'ok' : 'empty');
        out._error  = raw._error  || null;
        console.log(
          '[' + LOG_TAG + '] matched ' + raw.length + ', returning ' + out.length +
          (out._error ? ' (error: ' + out._error + ')' : '')
        );
        return out;
      })
      .catch(function (err) {
        console.log('[' + LOG_TAG + '] error: ' + (err && err.message));
        var failed = [];
        failed._status = 'exception';
        failed._error  = err ? (err.message || String(err)) : 'unknown error';
        failed._matched = 0;
        return failed;
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
