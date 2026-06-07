/**
 * Server Utama — MediaGet v3 (Multi-Platform Downloader)
 * Mendukung: Instagram, TikTok, YouTube, Facebook
 * Express.js + yt-dlp backend
 */

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { scrapeMedia, detectPlatform, checkYtDlp, PLATFORMS } = require("./scraper");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validasi apakah URL mengarah ke platform yang didukung.
 * Menggunakan URL constructor untuk parsing yang aman.
 */
function isValidMediaUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return detectPlatform(urlString) !== null;
  } catch {
    return false;
  }
}

/**
 * Validasi apakah URL mengarah ke CDN yang diizinkan.
 * Mendukung CDN dari Instagram, TikTok, YouTube, dan Facebook.
 */
function isAllowedCdnUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    const allowedPatterns = [
      // Instagram / Meta CDN
      /\.cdninstagram\.com$/,
      /\.instagram\.com$/,
      /\.fbcdn\.net$/,
      /^scontent[\w-]*\.cdninstagram\.com$/,
      /^scontent[\w-]*\.xx\.fbcdn\.net$/,
      /^video[\w-]*\.cdninstagram\.com$/,
      /^scontent[\w-]*\.[\w-]+\.fbcdn\.net$/,  // scontent-xxx.xx.fbcdn.net (various regions)
      /^instagram\.[\w-]+\.fbcdn\.net$/,
      // Facebook CDN
      /\.facebook\.com$/,
      /^video[\w-]*\.xx\.fbcdn\.net$/,
      /^scontent[\w-]*\.fbcdn\.net$/,
      /^fbvideo[\w-]*\.fbcdn\.net$/,
      /^external[\w-]*\.xx\.fbcdn\.net$/,      // external-xxx.xx.fbcdn.net (og:image)
      /\.snapcdn\.app$/,
      // TikTok CDN
      /\.tiktokcdn\.com$/,
      /\.tiktokcdn-us\.com$/,
      /\.musical\.ly$/,
      /\.tiktokv\.com$/,
      /\.byteoversea\.com$/,
      /\.ibytedtos\.com$/,
      /\.muscdn\.com$/,
      /\.tikwm\.com$/,
      /^v[\d]*[\w-]*\.tiktokcdn\.com$/,
      /^p[\d]*[\w-]*\.tiktokcdn\.com$/,        // p16-xxx.tiktokcdn.com (image CDN)
      // YouTube / Google CDN
      /\.googlevideo\.com$/,
      /\.youtube\.com$/,
      /\.ytimg\.com$/,
      /\.googleusercontent\.com$/,
      /\.ggpht\.com$/,                          // Google profile/channel images
      /^rr[\d]*[\w-]*\.googlevideo\.com$/,
      // Twitter / X CDN
      /\.twimg\.com$/,
      /\.twitter\.com$/,
      /\.x\.com$/,
      /^pbs\.twimg\.com$/,                      // Twitter media images
      /^abs\.twimg\.com$/,
      // Pinterest CDN
      /\.pinimg\.com$/,
      /\.pinterest\.com$/,
      /^i\.pinimg\.com$/,
      /^v1\.pinimg\.com$/,
      /^s\.pinimg\.com$/,
      /^media[\w-]*\.pinimg\.com$/,
    ];
    return allowedPatterns.some((pat) => pat.test(host));
  } catch {
    return false;
  }
}

/**
 * Tentukan Referer header berdasarkan URL CDN.
 */
function getRefererForCdn(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes("tiktok") || host.includes("musical") || host.includes("byteoversea") || host.includes("ibytedtos") || host.includes("muscdn")) {
      return "https://www.tiktok.com/";
    }
    if (host.includes("googlevideo") || host.includes("youtube") || host.includes("ytimg")) {
      return "https://www.youtube.com/";
    }
    if (host.includes("facebook") || host.includes("fbcdn") || host.includes("fbvideo")) {
      return "https://www.facebook.com/";
    }
    if (host.includes("twimg") || host.includes("twitter") || host.includes("x.com")) {
      return "https://x.com/";
    }
    if (host.includes("pinimg")) {
      return "https://www.pinterest.com/";
    }
    return "https://www.instagram.com/";
  } catch {
    return "https://www.instagram.com/";
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Rate Limiter (in-memory) ────────────────────────────────────────────────
// Untuk production, ganti dengan express-rate-limit + Redis

const requestCounts = new Map();
const RATE_LIMIT = 10;     // maks request per IP
const RATE_WINDOW = 60000; // per 1 menit

// Bersihkan entri yang sudah kadaluwarsa setiap 5 menit
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (now > entry.resetAt) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW;
  }

  entry.count++;
  requestCounts.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak request. Coba lagi dalam ${Math.ceil((entry.resetAt - now) / 1000)} detik.`,
    });
  }

  next();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/status
 * Cek status server dan ketersediaan yt-dlp
 */
app.get("/api/status", async (req, res) => {
  const ytdlpOk = await checkYtDlp();
  const platforms = Object.entries(PLATFORMS).map(([key, cfg]) => ({
    id: key,
    name: cfg.name,
    icon: cfg.icon,
  }));
  res.json({
    status: "ok",
    ytdlp: ytdlpOk,
    platforms,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/fetch
 * Body: { url: "https://..." }
 *
 * Mendukung URL dari: Instagram, TikTok, YouTube, Facebook
 *
 * Respon sukses:
 * {
 *   success: true,
 *   data: {
 *     platform: "instagram" | "tiktok" | "youtube" | "facebook",
 *     type: "video" | "image" | "playlist",
 *     author: "username",
 *     caption: "...",
 *     title: "...",
 *     mediaItems: [{ type, url, thumbnail, width, height, duration, ext }],
 *     source: "ytdlp" | "oembed",
 *     warning?: "..."
 *   }
 * }
 */
app.post("/api/fetch", rateLimit, async (req, res) => {
  let { url, urls } = req.body;

  if (url && typeof url === "string") {
    urls = [url];
  }

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, error: "URL diperlukan" });
  }

  if (urls.length > 10) {
    return res.status(400).json({ success: false, error: "Maksimal 10 URL dalam satu permintaan" });
  }

  // Request-level timeout: 110 detik (sedikit kurang dari client timeout 120 detik)
  const REQUEST_TIMEOUT = 110000;
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: "Request timeout — server membutuhkan waktu terlalu lama. " +
               "Coba lagi atau pastikan URL valid dan bisa diakses."
      });
    }
  }, REQUEST_TIMEOUT);

  try {
    const supported = Object.values(PLATFORMS).map((p) => p.name).join(", ");
    const results = [];
    const errors = [];

    // Proses secara sekuensial agar tidak membebani RAM / yt-dlp
    for (const u of urls) {
      if (timedOut) break; // Hentikan loop jika sudah timeout

      if (typeof u !== "string" || !u.trim()) continue;

      const cleanUrl = u.trim();
      if (!isValidMediaUrl(cleanUrl)) {
        errors.push({ url: cleanUrl, error: `URL tidak valid atau tidak didukung.` });
        continue;
      }

      try {
        console.log(`[API] Fetching: ${cleanUrl}`);
        const data = await scrapeMedia(cleanUrl);
        results.push(data);
      } catch (err) {
        console.error(`[API] Error on ${cleanUrl}:`, err.message);
        errors.push({ url: cleanUrl, error: err.message });
      }
    }

    clearTimeout(timeoutTimer);
    if (timedOut || res.headersSent) return; // Jangan kirim respons ganda

    if (results.length === 0 && errors.length > 0) {
      return res.status(500).json({ success: false, error: errors[0].error, details: errors });
    }

    // Selalu mengembalikan array di 'data' agar konsisten
    res.json({ success: true, data: results, errors: errors.length > 0 ? errors : undefined });
  } catch (unexpectedErr) {
    clearTimeout(timeoutTimer);
    console.error('[API] Unexpected error:', unexpectedErr);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Terjadi kesalahan internal server." });
    }
  }
});

/**
 * POST /api/fetch-private
 * Mengambil media (Instagram/TikTok/dsb) dari source code HTML (Mode Private)
 */
app.post("/api/fetch-private", rateLimit, async (req, res) => {
  const { html } = req.body;
  if (!html || typeof html !== 'string') return res.status(400).json({ success: false, error: "HTML source required" });

  try {
    const mediaItems = [];
    
    // Regex mencari URL mentah yang biasanya berakhiran .mp4 atau terkode di HTML
    const mp4Regex = /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g;
    let match;
    const seen = new Set();
    
    while ((match = mp4Regex.exec(html)) !== null) {
      let url = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
      
      // Filter URL sampah, hanya ambil dari CDN sosmed terkenal
      if (!url.includes('cdninstagram') && !url.includes('fbcdn') && !url.includes('tiktokcdn') && !url.includes('twimg')) {
        continue;
      }

      if (!seen.has(url)) {
        seen.add(url);
        mediaItems.push({ type: 'video', url: url, ext: 'mp4' });
      }
    }

    // Jika tidak ada video, coba cari foto (jpg) khusus Instagram
    if (mediaItems.length === 0) {
      const jpgRegex = /https?:\/\/[^\s"'<>]+\.jpg[^\s"'<>]*/g;
      while ((match = jpgRegex.exec(html)) !== null) {
        let url = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (!url.includes('cdninstagram') && !url.includes('fbcdn')) continue;
        // Hindari thumbnail kecil
        if (url.includes('150x150') || url.includes('s150x150')) continue;
        
        if (!seen.has(url)) {
          seen.add(url);
          mediaItems.push({ type: 'image', url: url, ext: 'jpg' });
        }
      }
    }

    if (mediaItems.length === 0) {
      return res.status(404).json({ success: false, error: "Tidak ditemukan tautan media dalam HTML tersebut." });
    }

    // Batasi maksimal 10 untuk menghindari spam link
    const results = [{
      platform: "Private",
      title: "Private Media",
      caption: "Diunduh melalui Mode Private. (Format kualitas asli)",
      mediaItems: mediaItems.slice(0, 10)
    }];

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('[API Fetch Private Error]:', err);
    res.status(500).json({ success: false, error: "Gagal memparsing HTML." });
  }
});

/**
 * GET /api/lyrics?q=...
 * Mencari lirik menggunakan lrclib.net API (gratis)
 */
app.get("/api/lyrics", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ success: false, error: "Query judul diperlukan" });
    
    const response = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { timeout: 10000 });
    if (response.data && response.data.length > 0) {
      return res.json({ 
        success: true, 
        lyrics: response.data[0].plainLyrics || response.data[0].syncedLyrics || "Lirik ditemukan tapi kosong."
      });
    } else {
      return res.json({ success: false, message: "Lirik tidak ditemukan" });
    }
  } catch (err) {
    console.error("Lyrics API error:", err.message);
    res.status(500).json({ success: false, error: "Gagal mengambil lirik" });
  }
});

/**
 * GET /api/trim?url=...&start=...&duration=...
 * Potong video (Smart Video Trimmer) menggunakan ffmpeg
 */
app.get("/api/trim", async (req, res) => {
  const { url, start, duration, filename } = req.query;
  if (!url) return res.status(400).send("URL required");

  const startSec = start || 0;
  const durSec = duration || 15;
  const outName = filename || "trimmed_video.mp4";

  res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
  res.setHeader("Content-Type", "video/mp4");

  const { spawn } = require('child_process');
  
  const ffmpeg = spawn('ffmpeg', [
    '-i', url,
    '-ss', startSec.toString(),
    '-t', durSec.toString(),
    '-c', 'copy', 
    '-movflags', 'frag_keyframe+empty_moov', 
    '-f', 'mp4',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);
  
  ffmpeg.stderr.on('data', (d) => {
    // abaikan stderr ffmpeg untuk mencegah log yang terlalu berisik
  });

  req.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
  });
});

/**
 * GET /api/convert-live?url=...
 * Konversi video ke format vertical (Live Wallpaper) maks 15 detik
 */
app.get("/api/convert-live", async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send("URL required");

  const outName = filename ? filename.replace('.mp4', '_live.mp4') : "live_wallpaper.mp4";
  res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
  res.setHeader("Content-Type", "video/mp4");

  const { spawn } = require('child_process');
  
  const ffmpeg = spawn('ffmpeg', [
    '-i', url,
    '-t', '15',
    '-vf', 'crop=ih*(9/16):ih',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);
  
  req.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
  });
});

/**
 * GET /api/gif?url=...&start=...&duration=...
 * Konversi video ke GIF (maks 5 detik, 10fps, lebar 320px)
 */
app.get("/api/gif", async (req, res) => {
  const { url, start, duration, filename } = req.query;
  if (!url) return res.status(400).send("URL required");

  const startSec = start || 0;
  const durSec = Math.min(parseInt(duration) || 3, 5); // Max 5 detik untuk GIF
  const outName = filename ? filename.replace(/\.(mp4|webm)/, '.gif') : "animated.gif";

  res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
  res.setHeader("Content-Type", "image/gif");

  const { spawn } = require('child_process');
  
  const ffmpeg = spawn('ffmpeg', [
    '-i', url,
    '-ss', startSec.toString(),
    '-t', durSec.toString(),
    '-vf', 'fps=10,scale=320:-1:flags=lanczos',
    '-c:v', 'gif',
    '-f', 'gif',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);
  
  req.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
  });
});

/**
 * GET /api/extract-audio?url=...
 * Ekstrak audio dari video menggunakan ffmpeg dan kirim sebagai mp3
 */
app.get("/api/extract-audio", async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send("URL required");

  // Validasi URL
  if (!isAllowedCdnUrl(url)) {
    return res.status(403).json({ error: "Domain tidak diizinkan" });
  }

  const outName = filename ? filename.replace(/\.(mp4|webm|jpg|png)/, '.mp3') : "extracted_audio.mp3";

  res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
  res.setHeader("Content-Type", "audio/mpeg");

  const referer = getRefererForCdn(url);
  const { spawn } = require('child_process');
  
  const ffmpeg = spawn('ffmpeg', [
    '-headers', `Referer: ${referer}\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n`,
    '-i', url,
    '-vn', // No video
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);
  
  ffmpeg.stderr.on('data', (d) => {
    // abaikan stderr ffmpeg
  });

  req.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
  });
});

/**
 * GET /api/merge-video?videoUrl=...&audioUrl=...
 * Menggabungkan video tanpa suara (1080p+) dengan audio menggunakan ffmpeg on-the-fly
 */
app.get("/api/merge-video", async (req, res) => {
  const { videoUrl, audioUrl, filename } = req.query;
  if (!videoUrl || !audioUrl) return res.status(400).send("videoUrl and audioUrl required");

  // Validasi URL
  if (!isAllowedCdnUrl(videoUrl) || !isAllowedCdnUrl(audioUrl)) {
    return res.status(403).json({ error: "Domain tidak diizinkan" });
  }

  const outName = filename || "merged_video.mp4";

  res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
  res.setHeader("Content-Type", "video/mp4");

  const referer = getRefererForCdn(videoUrl);
  const { spawn } = require('child_process');
  
  const ffmpeg = spawn('ffmpeg', [
    '-headers', `Referer: ${referer}\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n`,
    '-i', videoUrl,
    '-headers', `Referer: ${referer}\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\\r\\n`,
    '-i', audioUrl,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-strict', 'experimental',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);
  
  ffmpeg.stderr.on('data', (d) => {
    // abaikan stderr ffmpeg
  });

  req.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
  });
});

/**
 * GET /api/proxy?url=...&filename=...
 *
 * Proxy untuk download media dari CDN platform.
 * Diperlukan karena CDN platform menolak request langsung dari browser
 * (CORS + Referer check). Server kita yang mengambil lalu meneruskan ke client.
 *
 * Parameter opsional:
 *   filename — nama file untuk header Content-Disposition
 */
app.get("/api/proxy", async (req, res) => {
  const { url, filename } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Parameter url diperlukan" });
  }

  // Validasi domain CDN dengan parsing URL yang aman
  if (!isAllowedCdnUrl(url)) {
    return res.status(403).json({ error: "Domain tidak diizinkan" });
  }

  // Batas ukuran file: 500 MB
  const MAX_FILE_SIZE = 500 * 1024 * 1024;

  // Tentukan Referer yang sesuai berdasarkan CDN
  const referer = getRefererForCdn(url);
  const origin = referer.replace(/\/$/, "");

  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,audio/*,*/*;q=0.8",
      Referer: referer,
    };

    // Pinterest CDN menolak header Origin — jangan kirim untuk Pinterest
    const isPinterest = url.includes('pinimg') || url.includes('pinterest');
    if (!isPinterest) {
      headers.Origin = origin;
    }

    // Forward Range header to support IDM & multi-threaded downloads
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const response = await axios.get(url, {
      responseType: "stream",
      headers: headers,
      timeout: 120000, // 120 detik untuk file besar
      maxRedirects: 5,
      decompress: false, // Mencegah mismatch Content-Length jika CDN merespon dengan gzip/deflate
      validateStatus: (status) => status >= 200 && status < 300,
      beforeRedirect: (options) => {
        const redirectUrl = `${options.protocol}//${options.hostname}${options.path}`;
        // Izinkan redirect ke domain Pinterest karena CDN-nya sering redirect
        const redirectHost = options.hostname.toLowerCase();
        if (!isAllowedCdnUrl(redirectUrl) && !redirectHost.includes('pinterest') && !redirectHost.includes('pinimg')) {
          throw new Error("Redirect ke domain yang tidak diizinkan");
        }
      },
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    const contentLength = response.headers["content-length"];

    // Tolak file yang terlalu besar (abaikan cek ini untuk request berformat Range)
    if (!req.headers.range && contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
      response.data.destroy();
      return res.status(413).json({ error: "File terlalu besar (maks 500 MB)" });
    }

    res.status(response.status); // Teruskan 200 OK atau 206 Partial Content
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (response.headers["accept-ranges"]) res.setHeader("Accept-Ranges", response.headers["accept-ranges"]);
    if (response.headers["content-range"]) res.setHeader("Content-Range", response.headers["content-range"]);

    // Tentukan ekstensi dari content-type
    let ext = "bin";
    if (contentType.includes("video")) ext = "mp4";
    else if (contentType.includes("audio")) ext = "mp3";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("webm")) ext = "webm";

    if (req.query.inline === "true") {
      res.setHeader("Content-Disposition", "inline");
    } else {
      const safeFilename = filename
        ? filename.replace(/[^a-zA-Z0-9_.-]/g, "_")
        : `media_${Date.now()}.${ext}`;

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"`
      );
    }

    // Stream langsung ke client — tidak disimpan di server
    response.data.pipe(res);

    // Mencegah crash jika stream terputus di tengah jalan
    response.data.on('error', (err) => {
      console.error('[Proxy] Stream error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    // Batalkan stream jika pengguna membatalkan unduhan
    req.on('close', () => {
      response.data.destroy();
    });
  } catch (err) {
    console.error("[Proxy] Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Gagal mengambil file media dari CDN" });
    }
  }
});

/**
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Fallback: serve index.html (SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start ───────────────────────────────────────────────────────────────────

function startServer(port, retried = false) {
  const server = app.listen(port, async () => {
    try {
      const ytdlpOk = await checkYtDlp();
      const platformList = Object.values(PLATFORMS).map((p) => `${p.icon} ${p.name}`).join(" | ");
      console.log(`\n✅ Server berjalan di http://localhost:${port}`);
      console.log(`🔧 yt-dlp: ${ytdlpOk ? "✅ Terdeteksi" : "❌ Tidak ditemukan — install dengan: pip install yt-dlp"}`);
      console.log(`🌐 Platform: ${platformList}`);
      console.log(`📥 API: POST http://localhost:${port}/api/fetch`);
      console.log(`🔁 Proxy: GET http://localhost:${port}/api/proxy?url=...\n`);
    } catch (err) {
      console.error("[Startup] Gagal cek yt-dlp:", err.message);
      console.log(`\n✅ Server berjalan di http://localhost:${port}`);
      console.log(`🔧 yt-dlp: ⚠️ Tidak bisa dicek\n`);
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && !retried) {
      console.log(`⚠️  Port ${port} sedang dipakai. Mencoba mematikan proses lama...`);
      const { exec } = require("child_process");
      // Cari PID yang memakai port lalu kill
      exec(`netstat -ano | findstr :${port}`, (e, stdout) => {
        if (stdout) {
          const lines = stdout.trim().split("\n");
          const pids = new Set();
          lines.forEach((line) => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== "0" && pid !== String(process.pid)) pids.add(pid);
          });
          if (pids.size > 0) {
            const pidList = [...pids].join(" /PID ");
            exec(`taskkill /F /PID ${pidList}`, (killErr) => {
              if (!killErr) {
                console.log(`✅ Proses lama (PID: ${[...pids].join(", ")}) berhasil dimatikan.`);
                setTimeout(() => startServer(port, true), 1000);
              } else {
                console.error(`❌ Gagal mematikan proses: ${killErr.message}`);
                process.exit(1);
              }
            });
          } else {
            console.error("❌ Tidak bisa menemukan PID yang memakai port.");
            process.exit(1);
          }
        } else {
          console.error("❌ Tidak bisa mendeteksi proses di port tersebut.");
          process.exit(1);
        }
      });
    } else {
      console.error(`❌ Server error: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer(PORT);


module.exports = app;
