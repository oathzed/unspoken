/**
 * Generates one Nuvio provider per Weyd source JSON.
 * Run: node scripts/build-weyd-providers.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'providers', '_weyd-engine.template.js');
const PROVIDERS_DIR = path.join(ROOT, 'providers');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

const SCRAPERS = {
  1: [
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/animetosho.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/mediaf.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/glodls.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/bitlord.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/stream.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/tordb.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/anirena.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/torrentdownload.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/commet.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/bitmag.json',
  ],
  2: [
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/torrentgalaxy.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/piratebay.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/kickass.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/solid.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/nyaa.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/csv.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/yourbittorrent.json',
  ],
  3: [
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/1337x.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/rarbg.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/kenben.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/Bitsearch.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/rutor.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/btcq.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/dmm.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/ext.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/limetorrents.json',
  ],
  4: [
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/torrentz2.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/torlockseries.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/yts.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/tt2nz.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/ox.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/tortio.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/4movie.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/isohunt.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_Torrent/torlockmovies.json',
  ],
  5: [
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_DebridOnly/rlsbb.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_DebridOnly/Uploadgig.json',
    'https://raw.githubusercontent.com/lalitjoshi06/Scrapers/main/en_DebridOnly/maxrls.json',
  ],
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'weyd-build' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function slugFromUrl(url) {
  const file = url.split('/').pop().replace('.json', '');
  return file.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function uniqueUrls() {
  const seen = new Set();
  const out = [];
  for (const group of Object.keys(SCRAPERS).sort()) {
    for (const url of SCRAPERS[group]) {
      if (!seen.has(url)) {
        seen.add(url);
        out.push({ url, group: Number(group) });
      }
    }
  }
  return out;
}

async function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const entries = uniqueUrls();
  const manifestScrapers = [];
  const generatedIds = new Set();

  for (const entry of entries) {
    const id = 'weyd-' + slugFromUrl(entry.url);
    if (generatedIds.has(id)) continue;
    generatedIds.add(id);

    let config = { name: id };
    try {
      config = await fetchJson(entry.url);
    } catch (e) {
      console.warn('Could not fetch config for', entry.url, e.message);
    }

    const displayName = config.name || slugFromUrl(entry.url);
    const isDebrid = !!config.is_direct && !config.is_torrent;
    const content = template
      .replace(/__WEYD_SOURCE_JSON_URL__/g, entry.url)
      .replace(/__WEYD_LOG_TAG__/g, displayName.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

    const outPath = path.join(PROVIDERS_DIR, id + '.js');
    fs.writeFileSync(outPath, content, 'utf8');
    console.log('Wrote', id + '.js', '(' + displayName + ')');

    manifestScrapers.push({
      id,
      name: isDebrid ? displayName : '🧲 ' + displayName,
      description: 'Weyd scraper — ' + displayName + (isDebrid ? ' (direct)' : ' (torrent)'),
      version: '1.0.0',
      author: 'Weyd Bridge',
      supportedTypes: ['movie', 'tv'],
      filename: 'providers/' + id + '.js',
      enabled: true,
      limited: true,
      formats: isDebrid ? ['mp4', 'm3u8', 'mkv'] : ['mp4', 'm3u8', 'mkv'],
      logo: 'https://i.postimg.cc/ZRYTCy0T/torrentio.png',
      contentLanguage: config.language || ['en'],
    });
  }

  const manifest = {
    name: 'Weyd Torrent Pack',
    version: '1.0.0',
    scrapers: manifestScrapers,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('\nUpdated manifest.json with', manifestScrapers.length, 'scrapers');

  const legacy = path.join(PROVIDERS_DIR, 'weyd-torrent.js');
  if (fs.existsSync(legacy)) {
    fs.unlinkSync(legacy);
    console.log('Removed legacy weyd-torrent.js');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
