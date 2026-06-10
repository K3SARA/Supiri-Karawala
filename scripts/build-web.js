const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'web-dist');

const vendorFiles = [
  {
    from: path.join(root, 'node_modules', 'dexie', 'dist', 'dexie.js'),
    to: path.join(outDir, 'vendor', 'dexie.js'),
  },
  {
    from: path.join(root, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'),
    to: path.join(outDir, 'vendor', 'chart.umd.js'),
  },
  {
    from: path.join(root, 'node_modules', 'jsbarcode', 'dist', 'JsBarcode.all.min.js'),
    to: path.join(outDir, 'vendor', 'JsBarcode.all.min.js'),
  },
];

const copyDirs = ['css', 'js', 'assets'];

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Could not fully clear ${dir}: ${err.message}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        if (!['EPERM', 'EACCES'].includes(err.code)) throw err;
        console.warn(`Keeping existing locked file ${destPath}: ${err.message}`);
      }
    }
  }
}

function listFiles(dir, baseDir = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, baseDir));
    } else {
      files.push(
        fullPath
          .slice(baseDir.length + 1)
          .split(path.sep)
          .join('/')
      );
    }
  }
  return files;
}

function writeIndex() {
  const sourcePath = path.join(root, 'index.html');
  const targetPath = path.join(outDir, 'index.html');
  let html = fs.readFileSync(sourcePath, 'utf8');

  html = html
    .replace('./node_modules/dexie/dist/dexie.js', 'vendor/dexie.js')
    .replace('./node_modules/chart.js/dist/chart.umd.js', 'vendor/chart.umd.js')
    .replace('./node_modules/jsbarcode/dist/JsBarcode.all.min.js', 'vendor/JsBarcode.all.min.js');

  if (!html.includes('manifest.webmanifest')) {
    html = html.replace(
      '</head>',
        '  <link rel="icon" type="image/png" href="assets/logo.png">\n' +
        '  <link rel="apple-touch-icon" href="assets/logo.png">\n' +
      '  <link rel="manifest" href="manifest.webmanifest">\n' +
        '  <meta name="theme-color" content="#2563eb">\n' +
        '</head>'
    );
  }

  if (!html.includes('serviceWorker.register')) {
    html = html.replace(
      '</body>',
      '  <script>\n' +
        "    if ('serviceWorker' in navigator) {\n" +
        "      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));\n" +
        '    }\n' +
        '  </script>\n' +
        '</body>'
    );
  }

  fs.writeFileSync(targetPath, html);
}

function writeManifest() {
  const manifest = {
    name: 'Supiri Karawala',
    short_name: 'Supiri Karawala',
    description: 'Offline Supiri Karawala POS Software',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#F4F7FE',
    theme_color: '#2563eb',
    icons: [
      {
        src: 'assets/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  fs.writeFileSync(
    path.join(outDir, 'manifest.webmanifest'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

function writeServiceWorker() {
  const assets = [
    './',
    'index.html',
    'manifest.webmanifest',
    ...listFiles(path.join(outDir, 'css')).map((file) => `css/${file}`),
    ...listFiles(path.join(outDir, 'js')).map((file) => `js/${file}`),
    ...listFiles(path.join(outDir, 'assets')).map((file) => `assets/${file}`),
    ...listFiles(path.join(outDir, 'vendor')).map((file) => `vendor/${file}`),
  ];

  const sw = `const CACHE_NAME = 'supiri-karawala-v3';
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key === CACHE_NAME ? null : caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
`;

  fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
}

function main() {
  removeDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  for (const dir of copyDirs) {
    copyDir(path.join(root, dir), path.join(outDir, dir));
  }

  fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });
  for (const vendor of vendorFiles) {
    if (!fs.existsSync(vendor.from)) {
      throw new Error(`Missing dependency file: ${vendor.from}. Run npm install first.`);
    }
    fs.copyFileSync(vendor.from, vendor.to);
  }

  writeIndex();
  writeManifest();
  writeServiceWorker();

  console.log(`Web app built at ${outDir}`);
}

main();
