---
title: MediaGet v3
emoji: 📥
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 3000
pinned: false
---

# InstaGet v2 — Instagram Downloader

Download foto, video, reels, dan carousel Instagram menggunakan **yt-dlp** sebagai engine utama.

## Mengapa v2?

Versi sebelumnya mengandalkan reverse-engineering endpoint GraphQL internal Instagram yang sudah tidak aktif, serta HTML scraping yang tidak bisa berjalan karena Instagram kini menggunakan client-side rendering. v2 menggunakan **yt-dlp** — tool open source yang secara aktif dirawat dan selalu mengikuti perubahan Instagram.

## Struktur Proyek

```
igdownloader/
├── server.js        ← Express server + proxy download
├── scraper.js       ← Engine scraping (yt-dlp + fallback oEmbed)
├── package.json
└── public/
    └── index.html   ← Frontend UI
```

## Cara Kerja

```
URL Instagram
     │
     ▼
[1] yt-dlp --dump-single-json   ← engine utama (mendukung semua tipe)
     │ Tidak tersedia / gagal?
     ▼
[2] oEmbed API                  ← fallback (hanya thumbnail)
     │
     ▼
URL Media (foto/video resolusi penuh)
     │
     ▼
/api/proxy                      ← bypass CORS CDN Instagram → Browser
```

## Instalasi

### 1. Install yt-dlp (wajib untuk video)

```bash
# Python pip (direkomendasikan)
pip install yt-dlp

# Atau via package manager
brew install yt-dlp          # macOS
sudo apt install yt-dlp      # Ubuntu/Debian
winget install yt-dlp        # Windows
```

### 2. Install dependencies Node.js

```bash
npm install
```

### 3. Jalankan server

```bash
node server.js
# atau untuk development:
npm run dev
```

### 4. Buka browser

```
http://localhost:3000
```

Saat server start, terminal akan menampilkan status yt-dlp:
```
✅ Server berjalan di http://localhost:3000
🔧 yt-dlp: ✅ Terdeteksi
```

## API Endpoints

### POST /api/fetch

Ambil metadata dan URL media dari postingan Instagram.

**Request:**
```json
{ "url": "https://www.instagram.com/reel/ABC123/" }
```

**Response (sukses):**
```json
{
  "success": true,
  "data": {
    "type": "GraphVideo",
    "author": "username",
    "caption": "Teks caption...",
    "mediaItems": [
      {
        "type": "video",
        "url": "https://cdninstagram.com/...",
        "thumbnail": "https://cdninstagram.com/...",
        "width": 1080,
        "height": 1920,
        "duration": 30.5,
        "ext": "mp4"
      }
    ],
    "source": "ytdlp"
  }
}
```

### GET /api/proxy?url=...&filename=...

Proxy download media, bypass CORS CDN Instagram.

### GET /api/status

Cek status server dan ketersediaan yt-dlp.

```json
{ "status": "ok", "ytdlp": true, "timestamp": "..." }
```

## Update yt-dlp

Instagram sering mengubah endpoint-nya. Update yt-dlp secara berkala:

```bash
pip install -U yt-dlp
# atau
yt-dlp -U
```

## Tipe Konten yang Didukung

| Tipe          | Didukung | Keterangan                    |
|---------------|----------|-------------------------------|
| Foto tunggal  | ✅       | Resolusi penuh                |
| Video / Reels | ✅       | Kualitas tertinggi tersedia   |
| Carousel      | ✅       | Semua foto & video dalam satu |
| IGTV          | ✅       |                               |
| Stories       | ⚠️       | Hanya postingan publik        |

## ⚠️ Disclaimer

Dibuat untuk **keperluan edukasi**. Gunakan hanya untuk mengunduh konten milik sendiri.
Mengunduh konten orang lain tanpa izin dapat melanggar ToS Instagram dan hak cipta kreator.
