/**
 * Media Scraper Module — v3 (Multi-Platform)
 * Mendukung: Instagram, TikTok, YouTube, Facebook
 * Menggunakan yt-dlp sebagai engine utama (andal & selalu diupdate)
 * dengan fallback ke oEmbed untuk Instagram.
 */

const { execFile, exec } = require("child_process");
const axios = require("axios");

// ─── Platform Detection ─────────────────────────────────────────────────────

/**
 * Daftar platform yang didukung beserta pola URL-nya.
 */
const PLATFORMS = {
  instagram: {
    name: "Instagram",
    icon: "📸",
    hostPatterns: [/^(www\.)?instagram\.com$/],
    pathPatterns: [
      /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    ],
    requiresPath: true,  // harus punya path valid
  },
  tiktok: {
    name: "TikTok",
    icon: "🎵",
    hostPatterns: [
      /^(www\.)?tiktok\.com$/,
      /^vm\.tiktok\.com$/,           // short link
      /^vt\.tiktok\.com$/,           // short link variant
      /^m\.tiktok\.com$/,
    ],
    pathPatterns: [
      /\/@[\w.]+\/video\/(\d+)/,     // @user/video/1234
      /\/v\/(\d+)/,                  // /v/1234
      /^\/[A-Za-z0-9]+$/,           // short link /ZMxxxxxx
    ],
    requiresPath: false,
  },
  youtube: {
    name: "YouTube",
    icon: "▶️",
    hostPatterns: [
      /^(www\.)?youtube\.com$/,
      /^m\.youtube\.com$/,
      /^youtu\.be$/,
      /^music\.youtube\.com$/,
    ],
    pathPatterns: [
      /\/watch\?/,                   // /watch?v=xxx
      /\/shorts\/[\w-]+/,           // /shorts/xxx
      /^\/[\w-]{11}$/,              // youtu.be/xxx (11 char ID)
    ],
    requiresPath: false,
  },
  facebook: {
    name: "Facebook",
    icon: "👤",
    hostPatterns: [
      /^(www\.)?facebook\.com$/,
      /^m\.facebook\.com$/,
      /^web\.facebook\.com$/,
      /^fb\.watch$/,                 // short video links
      /^(www\.)?fb\.com$/,
    ],
    pathPatterns: [
      /\/(watch|videos|reel|share)\//,
      /\/posts\//,
      /\/photo/,
      /\/story\.php/,
      /^\/[\w.]+\/videos\//,
      /^\/\w+$/,                     // fb.watch/xxx
    ],
    requiresPath: false,
  },
  twitter: {
    name: "Twitter",
    icon: "🐦",
    hostPatterns: [
      /^(www\.)?twitter\.com$/,
      /^(www\.)?x\.com$/,
    ],
    pathPatterns: [/\/status\/\d+/],
    requiresPath: true,
  },
  spotify: {
    name: "Spotify",
    icon: "🎧",
    hostPatterns: [/^open\.spotify\.com$/],
    pathPatterns: [/\/track\/[a-zA-Z0-9]+/],
    requiresPath: true,
  },
  pinterest: {
    name: "Pinterest",
    icon: "📌",
    hostPatterns: [
      /^(www\.)?pinterest\.(com|co\.uk|de|fr|es|it|ca|com\.au|co\.kr|jp|at|ch|com\.mx|pt|se|nz|ph|ie|cl|co\.in)$/,
      /^pin\.it$/,
      /^(www\.)?pinterest\.\w+$/,
    ],
    pathPatterns: [
      /\/pin\/\d+/,
      /^\/[a-zA-Z0-9]+$/, // for pin.it shortlinks
    ],
    requiresPath: false,
  },
};

/**
 * Deteksi platform dari URL.
 * @returns {{ platform: string, config: object } | null}
 */
function detectPlatform(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();

    for (const [key, config] of Object.entries(PLATFORMS)) {
      const hostMatch = config.hostPatterns.some((pat) => pat.test(host));
      if (hostMatch) {
        // Kalau platform butuh path validation
        if (config.requiresPath) {
          const fullPath = parsed.pathname + parsed.search;
          const pathMatch = config.pathPatterns.some((pat) => pat.test(fullPath));
          if (!pathMatch) return null;
        }
        return { platform: key, config };
      }
    }
  } catch {
    // URL tidak valid
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractShortcode(url) {
  const patterns = [
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reels\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m) return m[1];
  }
  return null;
}

function runCommand(cmd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    // Gabungkan cmd dan args menjadi satu string untuk dijalankan melalui shell.
    // Ini diperlukan di Windows agar Python Scripts (yt-dlp) bisa ditemukan via PATH.
    const fullCmd = [cmd, ...args.map(a => `"${a}"`)].join(' ');
    let settled = false;

    const proc = exec(fullCmd, { timeout, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (err) {
        if (err.killed || err.signal === 'SIGTERM' || err.signal === 'SIGKILL') {
          return reject(new Error(`Command timeout setelah ${Math.round(timeout / 1000)} detik`));
        }
        return reject(new Error(stderr || err.message));
      }
      resolve(stdout.trim());
    });

    // Safety net: jika callback tidak terpanggil setelah timeout + 5 detik
    const safetyTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        reject(new Error(`Command timeout (safety) setelah ${Math.round(timeout / 1000)} detik`));
      }
    }, timeout + 5000);

    // Bersihkan timer jika proses selesai normal
    proc.on('exit', () => clearTimeout(safetyTimeout));
  });
}

// ─── Cek apakah yt-dlp tersedia ─────────────────────────────────────────────

async function checkYtDlp() {
  try {
    await runCommand("yt-dlp", ["--version"], 5000);
    return true;
  } catch {
    return false;
  }
}

// ─── yt-dlp scraping (multi-platform) ───────────────────────────────────────

/**
 * Menggunakan yt-dlp --dump-json untuk mengambil semua metadata
 * tanpa mengunduh file. yt-dlp menangani semua seluk-beluk setiap platform
 * (cookie, header, rotasi endpoint) secara otomatis.
 *
 * @param {string} url - URL media
 * @param {string} platform - Nama platform (instagram, tiktok, youtube, facebook)
 */
async function scrapeViaYtDlp(url, platform = "instagram") {
  console.log(`[Scraper] Mencoba yt-dlp untuk ${platform}...`);

  // Spotify Intercept: Fetch title then search on YouTube
  let targetUrl = url;
  if (platform === "spotify") {
    console.log(`[Scraper] Intercepting Spotify URL untuk mendapatkan judul...`);
    try {
      const spRes = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      const titleMatch = spRes.data.match(/<title>(.*?)<\/title>/);
      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1];
        // Bersihkan title, misal: "Nama Lagu - song and lyrics by Artis | Spotify"
        title = title.replace(/ - song and lyrics by /i, " ");
        title = title.replace(/ \| Spotify/i, "");
        console.log(`[Scraper] Spotify Title ditemukan: ${title}`);
        targetUrl = `ytsearch1:${title}`;
      } else {
        throw new Error("Tidak dapat menemukan judul lagu dari Spotify.");
      }
    } catch (e) {
      throw new Error("Gagal mengambil metadata Spotify: " + e.message);
    }
  }

  const args = [
    "--dump-single-json",
    "--no-warnings",
    "--no-check-certificates",
  ];

  // Deteksi apakah URL mengarah ke Playlist / Profil
  const isPlaylist = url.match(/(\/user\/|\/c\/|\/channel\/|@|list=|playlist\/|\/collection\/)/i) !== null;
  
  if (isPlaylist) {
    console.log(`[Scraper] Mendeteksi URL Playlist/Profil. Mengambil maksimal 10 video...`);
    args.push("--yes-playlist");
    args.push("--playlist-end", "10"); 
  } else {
    args.push("--no-playlist");
  }

  // Argumen spesifik per platform
  switch (platform) {
    case "instagram":
      args.push("--extractor-args", "instagram:direct_video_url=true");
      break;

    case "youtube":
      args.push("--extractor-args", "youtube:player_client=web");
      break;

    case "tiktok":
      args.push("--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
      break;

    case "facebook":
    case "twitter":
    case "pinterest":
      break;
      
    case "spotify":
      args.push("-f", "bestaudio[ext=m4a]/bestaudio/best");
      break;
  }

  args.push(targetUrl);

  // YouTube/Facebook mungkin butuh waktu lebih lama
  const timeout = (platform === "youtube" || platform === "facebook") ? 90000 : 60000;
  const raw = await runCommand("yt-dlp", args, timeout);
  const info = JSON.parse(raw);

  return parseYtDlpOutput(info, platform);
}

/**
 * Konversi output yt-dlp ke format internal yang dipakai server & frontend
 */
function parseYtDlpOutput(info, platform = "instagram") {
  const result = {
    platform,
    type: "unknown",
    shortcode: info.id || "",
    author: info.uploader || info.channel || info.creator || "unknown",
    caption: info.description || info.title || "",
    title: info.title || "",
    timestamp: info.timestamp || null,
    likeCount: info.like_count || 0,
    commentCount: info.comment_count || 0,
    viewCount: info.view_count || 0,
    duration: info.duration || null,
    mediaItems: [],
    source: "ytdlp",
  };

  // Carousel/playlist: yt-dlp mengembalikan field "entries"
  if (info.entries && info.entries.length > 0) {
    result.type = "playlist";
    result.mediaItems = info.entries.map((entry) =>
      extractMediaItem(entry)
    );
  }
  // Single video/photo
  else {
    const item = extractMediaItem(info);
    result.type = item.type === "video" ? "video" : "image";
    result.mediaItems = [item];
  }

  return result;
}

/**
 * Ekstrak URL terbaik dari satu entry yt-dlp
 * Prioritas: format kualitas tertinggi → url langsung → thumbnail
 */
function extractMediaItem(entry) {
  const isVideo = entry.ext === "mp4" || entry.ext === "webm" ||
    entry._type === "video" ||
    (entry.formats && entry.formats.some((f) => f.vcodec !== "none"));

  // Pilih format terbaik untuk video
  let bestUrl = entry.url;
  let availableFormats = [];

  // ─── Penanganan khusus FOTO ───
  // Jika bukan video, cari URL gambar dari berbagai field yang mungkin tersedia
  if (!isVideo) {
    // Coba ambil URL gambar dari berbagai sumber
    let imageUrl = entry.url || null;

    // Jika url kosong, gunakan thumbnail sebagai URL gambar utama
    if (!imageUrl && entry.thumbnail) {
      imageUrl = entry.thumbnail;
    }

    // Jika masih kosong, cek array thumbnails (resolusi tertinggi)
    if (!imageUrl && entry.thumbnails && entry.thumbnails.length > 0) {
      const sorted = [...entry.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
      imageUrl = sorted[0].url || sorted[0];
    }

    // Jika ada formats, cek apakah ada format gambar di sana
    if (entry.formats && entry.formats.length > 0) {
      const imgFormats = entry.formats.filter(
        (f) => f.url && (f.ext === 'jpg' || f.ext === 'jpeg' || f.ext === 'png' || f.ext === 'webp' || f.vcodec === 'none')
      );
      if (imgFormats.length > 0) {
        // Pilih resolusi tertinggi
        imgFormats.sort((a, b) => (b.width || 0) - (a.width || 0));
        imageUrl = imgFormats[0].url;
      }
    }

    if (imageUrl) {
      bestUrl = imageUrl;
      // Tentukan ekstensi dari URL
      let imgExt = entry.ext || 'jpg';
      if (imageUrl.includes('.png')) imgExt = 'png';
      else if (imageUrl.includes('.webp')) imgExt = 'webp';
      else if (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')) imgExt = 'jpg';

      availableFormats.push({
        type: 'image',
        quality: 'Original',
        url: imageUrl,
        ext: imgExt
      });
    }

    // Return early untuk foto, tidak perlu proses video formats
    let thumb = entry.thumbnail || null;
    if (!thumb && entry.thumbnails && entry.thumbnails.length > 0) {
      const sorted = [...entry.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
      thumb = sorted[0].url || sorted[0];
    }
    const finalUrl = bestUrl || imageUrl || thumb || "";
    if (!thumb) thumb = finalUrl;

    // Jika sama sekali kosong, set flag agar bisa di-retry
    if (availableFormats.length === 0 && finalUrl) {
      availableFormats.push({
        type: 'image',
        quality: 'Default',
        url: finalUrl,
        ext: entry.ext || 'jpg'
      });
    }

    return {
      type: "image",
      url: finalUrl,
      thumbnail: thumb || finalUrl,
      width: entry.width || null,
      height: entry.height || null,
      duration: null,
      ext: entry.ext || 'jpg',
      formats: availableFormats
    };
  }

  // ─── Penanganan VIDEO (kode asli) ───
  if (isVideo && entry.formats && entry.formats.length > 0) {
    // Format dengan video codec terbaik yang JUGA memiliki audio dan BUKAN playlist (HLS/DASH)
    const videoFormats = entry.formats.filter(
      (f) => f.vcodec !== "none" && f.acodec !== "none" && f.url && f.ext === "mp4" && f.protocol && f.protocol.startsWith('http')
    );
    if (videoFormats.length > 0) {
      // Sort by height descending, ambil yang terbesar
      videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
      bestUrl = videoFormats[0].url;

      // Kumpulkan resolusi unik
      const seenResolutions = new Set();
      videoFormats.forEach(f => {
        const res = f.height ? `${f.height}p` : 'HD';
        if (!seenResolutions.has(res)) {
          seenResolutions.add(res);
          availableFormats.push({
            type: 'video',
            quality: res,
            url: f.url,
            ext: f.ext
          });
        }
      });
    }

    // Ekstrak audio format jika ada (audio only) dan bukan playlist
    const audioFormats = entry.formats.filter(
      (f) => f.vcodec === "none" && f.url && f.protocol && f.protocol.startsWith('http')
    );
    let bestAudioUrl = null;
    if (audioFormats.length > 0) {
      // Sort by abr (audio bitrate) descending
      audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
      bestAudioUrl = audioFormats[0].url;
      availableFormats.push({
        type: 'audio',
        quality: 'Audio',
        url: audioFormats[0].url,
        ext: audioFormats[0].ext === 'm4a' ? 'm4a' : 'mp3'
      });
    }

    // ─── Format Video-Only 1080p+ (needsMerge) ───
    if (bestAudioUrl) {
      const videoOnlyFormats = entry.formats.filter(
        (f) => f.vcodec !== "none" && f.acodec === "none" && f.url &&
               f.protocol && f.protocol.startsWith('http') &&
               (f.height || 0) >= 1080
      );
      const seenMergeRes = new Set();
      const existingRes = new Set(availableFormats.filter(f => f.type === 'video').map(f => f.quality));
      videoOnlyFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
      videoOnlyFormats.forEach(f => {
        const res = f.height ? `${f.height}p` : 'HD';
        if (!seenMergeRes.has(res) && !existingRes.has(res)) {
          seenMergeRes.add(res);
          availableFormats.push({
            type: 'video',
            quality: `${res} HD`,
            url: f.url,
            ext: 'mp4',
            needsMerge: true,
            audioUrl: bestAudioUrl
          });
        }
      });
    }
  }

  // Jika tidak ada format yang tersaring tapi ada URL, jadikan default
  if (availableFormats.length === 0 && entry.url) {
    availableFormats.push({
      type: 'video',
      quality: 'Default',
      url: entry.url,
      ext: entry.ext || "mp4"
    });
  }

  // Fallback tambahan: jika video, dan yt-dlp tidak memberi audio-only track,
  // beri pseudo-audio option (menggunakan URL video utama)
  if (isVideo && !availableFormats.some(f => f.type === 'audio')) {
    availableFormats.push({
      type: 'audio',
      quality: 'Audio',
      url: bestUrl || entry.url,
      ext: 'mp3'
    });
  }

  // Ambil thumbnail terbaik
  let thumb = entry.thumbnail || null;
  if (!thumb && entry.thumbnails && entry.thumbnails.length > 0) {
    const sorted = [...entry.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
    thumb = sorted[0].url || sorted[0];
  }
  let finalUrl = bestUrl || entry.url;
  if (!finalUrl && availableFormats.length > 0) {
    finalUrl = availableFormats[0].url;
  }
  if (!thumb) thumb = finalUrl;

  return {
    type: "video",
    url: finalUrl || "",
    thumbnail: thumb,
    width: entry.width || null,
    height: entry.height || null,
    duration: entry.duration || null,
    ext: entry.ext || "mp4",
    formats: availableFormats
  };
}

// ─── Metode 2: oEmbed (fallback khusus Instagram) ────────────────────────────

/**
 * oEmbed hanya bisa dapat thumbnail (bukan video asli).
 * Dipakai sebagai last-resort kalau yt-dlp tidak terinstall.
 * Hanya mendukung Instagram.
 */
async function scrapeViaOEmbed(url) {
  console.log("[Scraper] Mencoba oEmbed API (data terbatas)...");

  const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&maxwidth=640`;
  const response = await axios.get(oembedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MediaGet/3.0)",
    },
    timeout: 10000,
  });

  const d = response.data;
  return {
    platform: "instagram",
    type: "image",
    shortcode: "",
    author: d.author_name || "unknown",
    caption: d.title || "",
    title: d.title || "",
    timestamp: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    duration: null,
    mediaItems: [
      {
        type: "image",
        url: d.thumbnail_url,
        thumbnail: d.thumbnail_url,
        width: d.thumbnail_width,
        height: d.thumbnail_height,
        ext: "jpg",
      },
    ],
    source: "oembed",
    warning:
      "⚠️ yt-dlp tidak terinstall — hanya thumbnail yang tersedia. " +
      "Install yt-dlp untuk mengunduh video resolusi penuh.",
  };
}

// ─── TikTok & Facebook retry dengan cookies browser ──────────────────────────

async function scrapeViaCookiesRetry(url, platform) {
  console.log(`[Scraper] Mencoba yt-dlp ${platform} dengan cookies browser...`);

  // Coba beberapa browser yang umum digunakan
  const browsers = ["chrome", "edge", "firefox", "brave"];
  for (const browser of browsers) {
    try {
      const args = [
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        "--cookies-from-browser", browser,
        url,
      ];
      
      // Khusus TikTok, gunakan User-Agent mobile
      if (platform === "tiktok") {
        args.push("--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
      }

      const raw = await runCommand("yt-dlp", args, 60000);
      const info = JSON.parse(raw);
      console.log(`[Scraper] Berhasil dengan cookies dari ${browser}`);
      return parseYtDlpOutput(info, platform);
    } catch (err) {
      console.warn(`[Scraper] Cookies ${browser} gagal: ${err.message.substring(0, 80)}`);
    }
  }
  throw new Error(`Semua metode cookies browser gagal untuk ${platform}`);
}

// ─── TikTok TikWM API fallback ─────────────────────────────────────────────────

async function scrapeViaTikwmAPI(url) {
  console.log("[Scraper] Mencoba TikWM API...");

  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const response = await axios.get(apiUrl, { timeout: 15000 });

  const data = response.data;
  if (!data || data.code !== 0 || !data.data) {
    throw new Error("TikWM API tidak mengembalikan data yang valid");
  }

  const item = data.data;
  
  // TikWM memberikan direct MP4 URL tanpa watermark (item.play)
  // dan audio MP3 (item.music)
  const isVideo = !!item.play;
  const isImage = !!item.images; // Photo slide
  
  const mediaItems = [];
  
  if (isVideo) {
    mediaItems.push({
      type: "video",
      url: item.play,
      thumbnail: item.cover,
      width: null,
      height: null,
      duration: item.duration || null,
      ext: "mp4",
      formats: [
        { type: "video", quality: "No Watermark", url: item.play, ext: "mp4" },
        ...(item.music ? [{ type: "audio", quality: "Audio", url: item.music, ext: "mp3" }] : [])
      ]
    });
  } else if (isImage && item.images.length > 0) {
    item.images.forEach((imgUrl, i) => {
      mediaItems.push({
        type: "image",
        url: imgUrl,
        thumbnail: imgUrl,
        width: null,
        height: null,
        duration: null,
        ext: "jpg",
        formats: [
          { type: "image", quality: `Image ${i+1}`, url: imgUrl, ext: "jpg" }
        ]
      });
    });
  } else {
    throw new Error("Tipe media tidak dikenali oleh TikWM API");
  }

  return {
    platform: "tiktok",
    type: isVideo ? "video" : "playlist",
    shortcode: item.id || "",
    author: item.author?.unique_id || "unknown",
    caption: item.title || "",
    title: item.title || "",
    timestamp: item.create_time || null,
    likeCount: item.digg_count || 0,
    commentCount: item.comment_count || 0,
    viewCount: item.play_count || 0,
    duration: item.duration || null,
    mediaItems: mediaItems,
    source: "tikwm",
    warning: null
  };
}

// ─── Facebook Siputzx API fallback ─────────────────────────────────────────────

async function scrapeViaSiputzxAPI(url) {
  console.log("[Scraper] Mencoba Siputzx API untuk Facebook...");

  const apiUrl = `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`;
  const response = await axios.get(apiUrl, { timeout: 15000 });

  const data = response.data;
  if (!data || data.status !== true || !data.data || !data.data.downloads) {
    throw new Error("Siputzx API tidak mengembalikan data yang valid untuk Facebook");
  }

  const item = data.data;
  const formats = [];
  
  item.downloads.forEach(dl => {
    if (dl.url) {
      formats.push({
        type: dl.type === "video" ? "video" : "audio",
        quality: dl.quality || "HD",
        url: dl.url,
        ext: "mp4" // Assuming mp4 for facebook video
      });
    }
  });

  if (formats.length === 0) {
    throw new Error("Tidak ditemukan link unduhan dari Siputzx API");
  }

  // Ambil URL dengan kualitas terbaik sebagai default url
  const bestFormat = formats.find(f => f.quality.toLowerCase().includes('hd')) || formats[0];

  return {
    platform: "facebook",
    type: "video",
    shortcode: "",
    author: "facebook_user",
    caption: item.title || "Facebook Video",
    title: item.title || "Facebook Video",
    timestamp: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    duration: item.duration || null,
    mediaItems: [
      {
        type: "video",
        url: bestFormat.url,
        thumbnail: item.thumbnail || null,
        width: null,
        height: null,
        duration: item.duration || null,
        ext: "mp4",
        formats: formats
      }
    ],
    source: "siputzx",
    warning: null
  };
}

// ─── Scrape Foto via HTML Page (og:image) ───────────────────────────────────

/**
 * Fallback untuk mengambil foto dari halaman web manapun.
 * Mengekstrak og:image, twitter:image, dan URL gambar dari meta tags.
 * Bekerja untuk semua platform: Instagram, Twitter/X, Pinterest, Facebook, dll.
 */
async function scrapePhotoViaPage(url) {
  console.log(`[Scraper] Mencoba scrape foto via HTML page...`);

  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 15000,
    maxRedirects: 5,
  });

  const html = response.data;
  const imageUrls = [];
  const seen = new Set();

  // 1. og:image (digunakan Instagram, Facebook, Pinterest, dll)
  const ogImageRegex = /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/gi;
  let match;
  while ((match = ogImageRegex.exec(html)) !== null) {
    const u = match[1].replace(/&amp;/g, '&');
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }
  // Juga cek format terbalik: content dulu, property setelahnya
  const ogImageRegex2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/gi;
  while ((match = ogImageRegex2.exec(html)) !== null) {
    const u = match[1].replace(/&amp;/g, '&');
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }

  // 2. twitter:image
  const twImageRegex = /<meta\s+(?:property|name)=["']twitter:image(?::src)?["']\s+content=["']([^"']+)["']/gi;
  while ((match = twImageRegex.exec(html)) !== null) {
    const u = match[1].replace(/&amp;/g, '&');
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }
  const twImageRegex2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image(?::src)?["']/gi;
  while ((match = twImageRegex2.exec(html)) !== null) {
    const u = match[1].replace(/&amp;/g, '&');
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }

  // 3. Instagram: cari URL CDN gambar dari embedded JSON data
  const cdnRegex = /https?:\/\/[^\s"'<>]*(?:cdninstagram\.com|fbcdn\.net)[^\s"'<>]*\.(?:jpg|jpeg|png|webp)[^\s"'<>]*/gi;
  while ((match = cdnRegex.exec(html)) !== null) {
    let u = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
    // Hindari thumbnail kecil
    if (u.includes('s150x150') || u.includes('150x150')) continue;
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }

  // 4. Pinterest: cari URL pinimg
  const pinRegex = /https?:\/\/i\.pinimg\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  while ((match = pinRegex.exec(html)) !== null) {
    let u = match[0];
    // Ganti ukuran kecil ke original
    u = u.replace(/\/[0-9]+x[0-9]*\//, '/originals/');
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }

  // 5. Twitter/X: cari URL twimg
  const twimgRegex = /https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)[^\s"'<>]*/gi;
  while ((match = twimgRegex.exec(html)) !== null) {
    let u = match[0].replace(/&amp;/g, '&');
    // Ambil kualitas terbaik
    if (!u.includes('name=') && !u.includes('format=')) {
      u = u + '?format=jpg&name=orig';
    } else if (u.includes('name=')) {
      u = u.replace(/name=[a-z]+/i, 'name=orig');
    }
    if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  }

  // Ambil title dan author dari meta tags
  let title = '';
  const titleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:title["']/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1];

  let author = '';
  const authorMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:site_name|author|twitter:creator)["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:site_name|author|twitter:creator)["']/i);
  if (authorMatch) author = authorMatch[1];

  if (imageUrls.length === 0) {
    throw new Error("Tidak ditemukan foto dalam halaman ini.");
  }

  // Deduplikasi: buang URL yang mirip (hanya beda parameter query)
  const uniqueUrls = [];
  const seenBase = new Set();
  for (const u of imageUrls) {
    // Abaikan logo Instagram/UI statis yang muncul karena login wall
    if (u.includes('static.cdninstagram.com') || u.includes('rsrc.php')) continue;

    const base = u.split('?')[0];
    if (!seenBase.has(base)) {
      seenBase.add(base);
      uniqueUrls.push(u);
    }
  }

  if (uniqueUrls.length === 0) {
    throw new Error("Hanya ditemukan logo/UI, tidak ditemukan foto konten asli.");
  }

  console.log(`[Scraper] Ditemukan ${uniqueUrls.length} foto via HTML page.`);

  const mediaItems = uniqueUrls.slice(0, 10).map((imgUrl, i) => {
    let ext = 'jpg';
    if (imgUrl.includes('.png')) ext = 'png';
    else if (imgUrl.includes('.webp')) ext = 'webp';

    return {
      type: 'image',
      url: imgUrl,
      thumbnail: imgUrl,
      width: null,
      height: null,
      duration: null,
      ext: ext,
      formats: [
        { type: 'image', quality: `Foto ${i + 1}`, url: imgUrl, ext: ext }
      ]
    };
  });

  return {
    platform: "unknown", // Akan di-overwrite oleh caller
    type: mediaItems.length > 1 ? "playlist" : "image",
    shortcode: "",
    author: author || "unknown",
    caption: title || "",
    title: title || "",
    timestamp: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    duration: null,
    mediaItems: mediaItems,
    source: "page_scrape",
    warning: null
  };
}

// ─── Fungsi utama (multi-platform) ──────────────────────────────────────────

/**
 * Scrape media dari URL yang didukung.
 * Mendukung: Instagram, TikTok, YouTube, Facebook, Twitter, Pinterest.
 *
 * @param {string} url - URL media
 * @returns {Promise<object>} Data media
 */
async function scrapeMedia(url) {
  // Deteksi platform
  const detected = detectPlatform(url);
  if (!detected) {
    throw new Error(
      "URL tidak valid atau platform tidak didukung. " +
      "Platform yang didukung: Instagram, TikTok, YouTube, Facebook."
    );
  }

  const { platform, config } = detected;
  console.log(`[Scraper] Platform terdeteksi: ${config.name}`);

  // Untuk Instagram, validasi tambahan shortcode
  if (platform === "instagram") {
    const shortcode = extractShortcode(url);
    if (!shortcode) {
      throw new Error(
        "URL Instagram tidak valid. Gunakan link postingan, reel, atau IGTV."
      );
    }
  }

  // Cek yt-dlp tersedia
  const ytdlpAvailable = await checkYtDlp();

  if (ytdlpAvailable) {
    try {
      const result = await scrapeViaYtDlp(url, platform);

      // Validasi: cek apakah semua media items memiliki URL yang valid
      const hasValidMedia = result.mediaItems.some(item => item.url && item.url.length > 10);
      if (!hasValidMedia) {
        console.warn(`[Scraper] yt-dlp mengembalikan data tapi URL media kosong. Mencoba fallback foto...`);
        throw new Error("URL media kosong dari yt-dlp");
      }

      console.log(
        `[Scraper] Berhasil via yt-dlp (${result.mediaItems.length} item dari ${config.name})`
      );
      return result;
    } catch (err) {
      console.warn(`[Scraper] yt-dlp gagal untuk ${config.name}: ${err.message}`);

      // YouTube & TikTok: coba retry dengan cookies browser
      if (platform === "youtube" || platform === "tiktok") {
        try {
          const result = await scrapeViaCookiesRetry(url, platform);
          console.log(`[Scraper] ${platform} berhasil via cookies browser`);
          return result;
        } catch (retryErr) {
          console.warn(`[Scraper] ${platform} cookies retry gagal: ${retryErr.message}`);
        }
      }
      
      // Facebook: gunakan Siputzx fallback
      if (platform === "facebook") {
        try {
          return await scrapeViaSiputzxAPI(url);
        } catch (fbErr) {
          console.warn(`[Scraper] Facebook fallback gagal: ${fbErr.message}`);
        }
      }
    }
  } else {
    console.warn("[Scraper] yt-dlp tidak ditemukan!");
  }

  // ─── Fallback Umum via api-dylux (Multi-Platform) ───
  if (["instagram", "youtube", "tiktok", "facebook", "twitter"].includes(platform)) {
    try {
      console.log(`[Scraper] yt-dlp gagal, mencoba api-dylux untuk ${platform}...`);
      const dylux = require('api-dylux');
      let dlResult;
      let mediaItems = [];
      let author = platform + "_user";
      let title = platform.charAt(0).toUpperCase() + platform.slice(1) + " Media";

      if (platform === "tiktok") {
        dlResult = await dylux.tiktok(url);
        if (dlResult && (dlResult.play || dlResult.nowm || dlResult.watermark)) {
          const vidUrl = dlResult.nowm || dlResult.play || dlResult.watermark;
          mediaItems.push({
            type: 'video', url: vidUrl, thumbnail: dlResult.cover || '', ext: 'mp4',
            formats: [{ type: 'video', quality: 'Original', url: vidUrl, ext: 'mp4' }]
          });
          if (dlResult.title) title = dlResult.title;
          if (dlResult.author) author = dlResult.author;
        }
      } else if (platform === "youtube") {
        dlResult = await dylux.ytmp4(url);
        if (dlResult && (dlResult.result || dlResult.url)) {
          const vidUrl = dlResult.result || dlResult.url;
          mediaItems.push({
            type: 'video', url: vidUrl, thumbnail: dlResult.thumb || '', ext: 'mp4',
            formats: [{ type: 'video', quality: 'Original', url: vidUrl, ext: 'mp4' }]
          });
          if (dlResult.title) title = dlResult.title;
          if (dlResult.channel) author = dlResult.channel;
        }
      } else if (platform === "instagram") {
        console.log(`[Scraper] mencoba @bochilteam/scraper untuk Instagram...`);
        const { instagramdl } = require('@bochilteam/scraper');
        dlResult = await instagramdl(url);
        if (dlResult && Array.isArray(dlResult)) {
          mediaItems = dlResult.map(item => {
            const isVid = item.type === 'video' || item.url.includes('.mp4');
            return {
              type: isVid ? 'video' : 'image', url: item.url, thumbnail: item.thumbnail || item.url, ext: isVid ? 'mp4' : 'jpg',
              formats: [{ type: isVid ? 'video' : 'image', quality: 'Original', url: item.url, ext: isVid ? 'mp4' : 'jpg' }]
            };
          });
        }
      } else if (platform === "facebook") {
        dlResult = await dylux.fbdl(url);
        if (dlResult && (dlResult.result || dlResult.video_hd || dlResult.video_sd)) {
           const hd = dlResult.result?.hd || dlResult.video_hd;
           const sd = dlResult.result?.sd || dlResult.video_sd;
           const finalUrl = hd || sd || dlResult.result;
           if (typeof finalUrl === 'string') {
             mediaItems.push({
               type: 'video', url: finalUrl, thumbnail: '', ext: 'mp4',
               formats: [
                 ...(hd ? [{ type: 'video', quality: 'HD', url: hd, ext: 'mp4' }] : []),
                 ...(sd ? [{ type: 'video', quality: 'SD', url: sd, ext: 'mp4' }] : [])
               ]
             });
           }
        }
      } else if (platform === "twitter") {
        dlResult = await dylux.twitter(url);
        if (dlResult && (dlResult.url || dlResult.SD || dlResult.HD)) {
           const hd = dlResult.HD || (Array.isArray(dlResult.url) && dlResult.url[0]?.url) || dlResult.url;
           if (hd && typeof hd === 'string') {
             mediaItems.push({
               type: 'video', url: hd, thumbnail: '', ext: 'mp4',
               formats: [{ type: 'video', quality: 'Original', url: hd, ext: 'mp4' }]
             });
           }
        }
      }

      if (mediaItems.length > 0) {
        console.log(`[Scraper] Berhasil via api-dylux (${mediaItems.length} item)`);
        return {
          platform: platform,
          type: mediaItems.length > 1 ? "playlist" : (mediaItems[0].type || "video"),
          shortcode: extractShortcode(url) || "",
          author: author,
          caption: title,
          title: title,
          timestamp: null,
          likeCount: 0,
          commentCount: 0,
          viewCount: 0,
          duration: null,
          mediaItems: mediaItems,
          source: "dylux_api",
          warning: null
        };
      }
    } catch (err) {
      console.warn(`[Scraper] api-dylux gagal: ${err.message}`);
    }
  }

  // ─── Fallback Khusus TikTok via TikWM ───
  if (platform === "tiktok") {
    try {
      return await scrapeViaTikwmAPI(url);
    } catch (err) {
      console.warn(`[Scraper] TikWM API gagal: ${err.message}`);
    }
  }

  // ─── Fallback foto via HTML page scraping (semua platform) ───
  try {
    const photoResult = await scrapePhotoViaPage(url);
    photoResult.platform = platform;
    console.log(`[Scraper] Berhasil via page scrape (${photoResult.mediaItems.length} foto)`);
    return photoResult;
  } catch (photoErr) {
    console.warn(`[Scraper] Page scrape gagal: ${photoErr.message}`);
  }



  if (platform === "instagram") {
    throw new Error(
      `Semua metode scraping gagal untuk Instagram. ` +
      `URL mungkin private atau sistem sedang down.`
    );
  }

  // Platform lain tanpa yt-dlp = tidak bisa
  throw new Error(
    `yt-dlp diperlukan untuk mengunduh dari ${config.name}. ` +
    `Install dengan: pip install yt-dlp`
  );
}

// Backward-compatible alias
const scrapeInstagram = scrapeMedia;

module.exports = {
  scrapeMedia,
  scrapeInstagram,
  detectPlatform,
  extractShortcode,
  checkYtDlp,
  PLATFORMS,
};
