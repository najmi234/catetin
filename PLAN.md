# Catetin — Rencana Pengembangan

Aplikasi pencatat pengeluaran pribadi berbasis **Android**. Menggantikan dua proyek lama:

- `expanse-recorder/`: bot WA (Baileys) dan pengecekan email Mandiri (IMAP), menulis ke Supabase
- `expense-dashboard/`: dashboard web React dengan API Express di atas Supabase

Kedua folder lama **tidak diubah**. Keduanya tetap berjalan sampai versi baru siap menggantikan (lihat Fase 4).

---

## 1. Keputusan

| Topik | Keputusan |
|---|---|
| Platform | Android saja |
| Aplikasi | Expo (React Native) + TypeScript |
| Backend | Di-host sendiri: satu layanan Node + TS berisi API, bot WA, dan pengecekan Gmail |
| Database | PostgreSQL (Docker, di server yang sama) lewat Drizzle ORM. **Tidak memakai Supabase.** |
| Input WA | Tetap memakai Baileys, chat ke diri sendiri |
| LLM | Tidak dipakai dulu |
| Domain | Sudah ada. HTTPS lewat Caddy. |

---

## 2. Arsitektur

```
┌──────────────────┐   HTTPS (Caddy)   ┌──────────────────────────────────────┐
│  apps/mobile     │ ◄───────────────► │  apps/server  (satu proses Node)     │
│  Expo (Android)  │   REST + SSE      │  ├─ API            (Hono)            │
└──────────────────┘                   │  ├─ Auth           (Better Auth)     │
         ▲                             │  ├─ Bot WA         (Baileys)         │
         │ Expo Push                   │  ├─ Gmail poller   (imapflow)        │
         └─────────────────────────────│  └─ Scheduler      (node-cron)       │
                                       └──────────────────┬───────────────────┘
                                                          │ Drizzle (127.0.0.1:5432)
                                       ┌──────────────────▼───────────────────┐
                                       │  PostgreSQL (Docker, volume lokal)   │
                                       └──────────────────────────────────────┘
                     packages/shared: parser, zod schema, tipe, format, util WIB
```

Prinsipnya: **semua cara mencatat** (pesan WA, email Mandiri, dan aplikasi) memakai parser dan service yang sama. Setiap transaksi baru memicu event SSE ke aplikasi, sehingga daftar transaksi langsung diperbarui.

---

## 3. Struktur folder

```
catetin/
├── PLAN.md
├── package.json                 # npm workspaces
├── docker-compose.yml           # PostgreSQL (dev & produksi)
├── tsconfig.base.json
├── eslint.config.js / .prettierrc
├── apps/
│   ├── mobile/                  # Expo app
│   │   ├── app/                 # Expo Router
│   │   │   ├── (auth)/login.tsx
│   │   │   └── (tabs)/
│   │   │       ├── index.tsx        # Dashboard
│   │   │       ├── history.tsx      # Riwayat harian
│   │   │       └── settings.tsx     # Kategori, akun
│   │   ├── components/
│   │   └── lib/                 # api client, auth client, query hooks, SSE
│   └── server/
│       ├── src/
│       │   ├── index.ts         # bootstrap: API + WA + Gmail + cron
│       │   ├── api/             # route Hono
│       │   ├── auth.ts          # Better Auth
│       │   ├── db/              # schema Drizzle, koneksi, migrations/
│       │   ├── services/        # transactions, categories, summary, events
│       │   ├── channels/
│       │   │   ├── whatsapp/    # koneksi Baileys, command handler
│       │   │   └── gmail/       # poller IMAP, parser Mandiri
│       │   └── jobs/            # cron (pengingat, backup)
│       ├── scripts/import-supabase.ts
│       └── data/                # auth_session/ Baileys (di-gitignore)
└── packages/
    └── shared/
        └── src/
            ├── parse-expense.ts # "kopi 15k #makan @qris" → objek transaksi
            ├── mandiri.ts       # parser email Mandiri
            ├── money.ts         # formatRupiah, parse nominal
            ├── time.ts          # batas hari/bulan WIB
            └── schemas.ts       # zod schema + tipe
```

---

## 4. Tech stack

### Bersama
- Node.js 24 LTS (dikunci lewat `.nvmrc` dan `engines` di `package.json`), TypeScript, npm workspaces
- `zod` untuk validasi dan tipe yang dipakai bersama oleh server dan mobile
- Zona waktu `Asia/Jakarta` dihitung dengan offset tetap UTC+7 (WIB tidak punya DST), tanpa library — hasilnya sama di Node dan Hermes
- `vitest` untuk test, ESLint + Prettier untuk kualitas kode

### Server (`apps/server`)
| Kebutuhan | Library |
|---|---|
| HTTP API | `hono` + `@hono/node-server` + `@hono/zod-validator` |
| Database | PostgreSQL 17 (image Docker resmi `postgres:17-alpine`, didukung sampai Nov 2029) |
| Driver & ORM | `postgres` (postgres.js) + `drizzle-orm` + `drizzle-kit` |
| DB untuk test | `@electric-sql/pglite` (Postgres in-memory, tanpa Docker) |
| Login | `better-auth` (plugin email OTP + plugin Expo) |
| Pengiriman email OTP | `nodemailer` lewat Gmail SMTP |
| Bot WA | `@whiskeysockets/baileys`, `qrcode-terminal`, `pino` |
| Gmail | `imapflow`, `mailparser` |
| Jadwal | `node-cron` |
| Push notification | `expo-server-sdk` |
| Menjalankan saat development | `tsx` |
| Proses di produksi | systemd (atau pm2) |

### Mobile (`apps/mobile`)
| Kebutuhan | Library |
|---|---|
| Framework | Expo SDK 58 + Expo Router (`NativeTabs`, `Stack.Protected`) |
| API client | `hono/client` (tipe request/response otomatis dari server) + TanStack Query |
| Login | `better-auth` Expo client + `expo-secure-store` |
| Pembaruan langsung | SSE (`react-native-sse`) yang memicu refresh data di TanStack Query |
| Form | State React biasa + parser/validasi dari `@catetin/shared` |
| UI | `StyleSheet` + token tema sendiri (`src/theme.ts`, mode terang/gelap), `lucide-react-native`, modal Expo Router |
| Tanggal | `@react-native-community/datetimepicker` (dikunci ke WIB) |
| Grafik | `react-native-gifted-charts` + `react-native-svg` |
| Notifikasi | `expo-notifications` (Fase 5) |
| Build | EAS Build menghasilkan APK (distribusi internal) |

---

## 5. Model data (PostgreSQL)

Nominal disimpan sebagai **`bigint` rupiah** (tanpa desimal). Waktu disimpan sebagai **`timestamptz`**, dan batas hari/bulan dihitung dalam zona `Asia/Jakarta`.

```
enum payment_method: 'cash' | 'qris' | 'debit' | 'ewallet' | 'transfer' | 'other'
enum channel:        'whatsapp' | 'email' | 'app' | 'import'

transactions
  id              uuid pk  default uuidv7()/gen_random_uuid()
  user_id         text fk → user.id  on delete cascade
  merchant        text not null
  amount          bigint not null  check (amount > 0)
  category_id     uuid fk → categories.id  on delete set null
  payment_method  payment_method not null default 'cash'
  channel         channel not null
  note            text null
  occurred_at     timestamptz not null   -- waktu transaksi
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now()
  external_id     text unique null       -- Message-ID email / id pesan WA (anti duplikat)
  index (user_id, occurred_at desc)

categories
  id uuid pk, user_id, name, color, icon, sort_order
  unique (user_id, name)

merchant_rules              -- kategori otomatis
  id uuid pk, user_id, merchant_key (lowercase, dinormalisasi), category_id, updated_at
  unique (user_id, merchant_key)

push_tokens
  id uuid pk, user_id, token unique, created_at

app_state                   -- penyimpanan key-value sederhana
  key text pk, value jsonb  -- contoh: 'gmail.last_uid'

user / session / account / verification   -- dibuat oleh Better Auth (adapter Drizzle)
```

Rekap harian dan bulanan dihitung di database, misalnya dengan
`date_trunc('day', occurred_at at time zone 'Asia/Jakarta')`.

Perbedaan dengan skema lama:
- `source` dipecah menjadi `payment_method` (cara bayar) dan `channel` (asal input).
- `created_at` dipecah menjadi `occurred_at` (waktu transaksi) dan `created_at` (waktu data dibuat).
- `gmail_message_id` diganti dengan `external_id` yang unik.

---

## 6. API (`/api`)

| Method | Path | Fungsi |
|---|---|---|
| * | `/api/auth/*` | Better Auth (kirim OTP, verifikasi, sesi) |
| GET | `/api/transactions?month=YYYY-MM&q=` | Daftar transaksi per bulan (WIB) |
| POST | `/api/transactions` | Tambah dengan data terstruktur (form) |
| POST | `/api/transactions/quick` | `{ text }` → diproses parser yang sama dengan WA, bisa banyak baris |
| PATCH | `/api/transactions/:id` | Ubah |
| DELETE | `/api/transactions/:id` | Hapus |
| GET | `/api/summary?month=YYYY-MM` | Total, jumlah transaksi, rata-rata harian, rekap harian, rekap per kategori |
| GET/POST/PATCH/DELETE | `/api/categories[/:id]` | Kelola kategori |
| POST | `/api/push-tokens` | Daftarkan token Expo Push |
| GET | `/api/events` | SSE: `transaction.created/updated/deleted` |
| GET | `/api/health` | Health check |

Pendaftaran akun dibatasi ke email di `OWNER_EMAIL`, karena aplikasi ini untuk satu pengguna. Nomor WA dan email Gmail dipetakan ke user tersebut lewat env.

---

## 7. Format input (parser bersama)

### MVP
| Input | Hasil |
|---|---|
| `kopi 15k` / `kopi 15rb` / `kopi 15.000` | Rp 15.000 |
| `kopi 15.5k`, `1,5rb`, `1.2jt` | Desimal ditangani dengan benar (memperbaiki bug lama: `15.5k` tercatat 155.000) |
| `bensin 50rb #transport` | Kategori diisi dari tag |
| `kopi 15k @qris` | Metode bayar (default: `cash`). Alias: `@tunai`, `@qr`, `@debet`, `@kartu`, `@gopay`/`@ovo`/`@dana`/`@shopeepay` → ewallet, `@tf` → transfer, `@lainnya` |
| Banyak baris dalam satu pesan | Satu transaksi per baris |
| Tanpa `#tag` | Kategori diambil dari `merchant_rules`, kalau ada |

### Perintah WA
| Perintah | Fungsi | Fase |
|---|---|---|
| `!help` | Bantuan | MVP |
| `!t`, `!t<tgl>` | Rekap hari ini / tanggal tertentu (`!t31` di bulan 30 hari ditolak) | MVP |
| `!m` | Rekap bulanan per hari | MVP |
| `!undo` | Hapus transaksi terakhir dari WA | MVP |
| `kemarin ...`, `tgl 12 ...` | Mencatat dengan tanggal mundur | 2 |
| Reply ke pesan "✅ Tercatat" | Koreksi nominal atau kategori | 2 |

---

## 8. Layar aplikasi (MVP)

1. **Login**: masukkan email, terima OTP, masuk.
2. **Dashboard**: pilih bulan, kartu (total, jumlah transaksi, rata-rata per hari aktif), grafik batang harian, pie per kategori, transaksi terbaru.
3. **Riwayat**: dikelompokkan per hari dan bisa dibuka-tutup, dengan pencarian. Geser item untuk edit atau hapus.
4. **Tambah**: kolom tambah cepat (format WA) dengan pratinjau hasil parsing, ditambah form lengkap di bottom sheet.
5. **Pengaturan**: kelola kategori (nama, warna, ikon), logout.

---

## 9. Tahapan kerja

### Fase 0 — Fondasi
- [x] Node 24 (`.nvmrc`, `engines: { node: ">=24" }`), npm workspaces, `tsconfig.base.json`, ESLint, Prettier, `.gitignore`, `git init`
- [x] `packages/shared`: `money.ts`, `time.ts`, `parse-expense.ts`, `mandiri.ts`, `schemas.ts`
- [x] Test parser mencakup kasus `15.5k`, `1,5rb`, `1.2jt`, `23.500`, multi-baris, `#tag`, `@metode`, dan input yang tidak valid
- [ ] Test `mandiri.ts` memakai contoh email asli yang sudah dianonimkan (sementara masih memakai contoh sintetis di `test/fixtures/`)

**Selesai bila:** `npm test` lulus.

### Fase 1 — Inti server ✅
- [x] Schema Drizzle dan migration pertama, plus seed kategori default
- [x] Better Auth: email OTP, terbatas pada `OWNER_EMAIL` (akun owner dibuat otomatis saat server start, sign-up dimatikan)
- [x] Service transaksi (CRUD, quick add, summary) dan event bus SSE
- [x] Route Hono beserta validasi zod. Ekspor tipe `AppType` untuk klien mobile.
- [x] `docker-compose.yml` untuk Postgres lokal (port hanya `127.0.0.1`)
- [x] Test integrasi API dengan PGlite (Postgres in-memory), termasuk alur login OTP
- [x] Smoke test di Postgres asli lewat `curl`: health, login OTP, quick add, summary

**Selesai bila:** semua endpoint bisa dicoba lewat `curl` di lokal.

### Fase 2 — Port channel WA & Gmail
- [x] Bot WA dipindah ke `channels/whatsapp`, memakai parser bersama dan service transaksi
- [x] Perintah `!help`, `!t`, `!m`, `!undo`
- [x] Anti-duplikat memakai ID pesan WA (`external_id`), bukan lagi "teks sama dalam 5 detik". Balasan bot sendiri tidak diproses ulang.
- [x] Reconnect WA tanpa batas percobaan (backoff maks. 60 detik)
- [x] Gmail poller dipindah ke `channels/gmail`. UID terakhir disimpan di `app_state` sehingga email yang masuk saat server mati tetap terproses. Verifikasi TLS aktif, mailbox dibuka read-only.
- [x] Notifikasi WA untuk transaksi dari email, dengan judul yang sesuai sumbernya (bukan selalu "QRIS"). Email Mandiri yang tidak terbaca juga dikabarkan.
- [x] `merchant_rules` dipakai di semua channel
- [ ] Uji langsung dengan akun WA (scan QR) dan Gmail asli

**Selesai bila:** pesan WA dan email Mandiri sama-sama tersimpan ke Postgres lokal.

### Fase 3 — Aplikasi mobile (MVP)
- [x] Buat proyek Expo SDK 58 (Android saja), Expo Router, tema terang/gelap. NativeWind diganti `StyleSheet` karena versi stabilnya belum pasti cocok dengan SDK 58.
- [x] Klien Better Auth dan alur login OTP (`Stack.Protected`)
- [x] Klien Hono RPC dengan hook TanStack Query; sesi kedaluwarsa (401) otomatis kembali ke login
- [x] Layar Beranda (catat cepat + pratinjau, ringkasan, grafik harian, per kategori, terbaru), Riwayat (per hari, pencarian), Tambah/Ubah transaksi, Pengaturan (kelola kategori, keluar)
- [x] Koneksi SSE yang memicu refresh data; ditutup saat aplikasi di background, refetch saat kembali
- [x] Lint (termasuk aturan React Hooks), typecheck, bundle Android (`expo export`), `expo-doctor` 20/20
- [ ] Uji di HP Android lewat Expo Go (semua library MVP ada di Expo Go; development build baru dibutuhkan di Fase 6)

Catatan: edit/hapus memakai ketuk → layar ubah (bukan swipe), dan form memakai modal Expo Router (bukan bottom sheet) agar tidak bergantung pada library tambahan.

**Selesai bila:** semua fitur dashboard web lama tersedia di HP.

### Fase 3b — Kantong (amplop virtual) ✅
- [x] Tabel `pockets` dan `pocket_entries` (isi saldo, pindahan masuk/keluar); kolom `pocket_id` di `categories` dan `transactions`
- [x] Saldo selalu dihitung: total isi/pindahan − total pengeluaran di kantong itu (boleh minus)
- [x] Pengeluaran otomatis masuk ke kantong milik kategorinya; bisa dipilih manual di form atau `$kantong` di WA/catat cepat
- [x] Isi saldo manual, pindah saldo antar kantong, batalkan isi/pindahan
- [x] WA: `!kantong`, `!isi <kantong> <nominal>`, `!pindah <dari> <ke> <nominal>`, sisa saldo + peringatan minus di setiap balasan
- [x] Aplikasi: tab Kantong (kartu + total saldo), detail kantong dengan riwayat per bulan, form kantong, pilihan kantong di form kategori & transaksi
- [ ] Uji di HP

### Fase 4 — Deploy & migrasi
- [ ] Server: unit systemd, file `.env`, folder `data/`
- [ ] Postgres via `docker compose` (`restart: unless-stopped`, volume persisten, port hanya `127.0.0.1`)
- [ ] Migration berjalan otomatis setiap server start (`connectDb`)
- [ ] Caddy: site block untuk subdomain API dengan HTTPS otomatis
- [ ] Backup harian `pg_dump` (format custom) beserta rotasinya, dan salinan disimpan di luar server
- [ ] Script `import-supabase.ts`: ekspor data lama dari Supabase lalu impor ke Postgres, dengan pemetaan `source` → `payment_method`/`channel` dan `created_at` → `occurred_at`
- [ ] **Peralihan:** matikan bot WA lama lebih dulu, baru scan QR untuk bot baru. Ini mencegah satu pesan diproses dua kali. Setelah itu jalankan impor terakhir dan matikan recorder lama.
- [ ] EAS Build menghasilkan APK, lalu pasang di HP

**Selesai bila:** sistem lama dimatikan dan aplikasi baru dipakai sehari-hari.

### Fase 5 — Kenyamanan (setelah MVP)
- [ ] Push notification untuk transaksi dari WA/email
- [ ] Tombol favorit untuk transaksi rutin
- [ ] Tanggal mundur (`kemarin`, `tgl N`) dan koreksi lewat reply
- [ ] Pengingat malam lewat WA atau push
- [ ] Ekspor CSV

### Fase 6 — Akses cepat Android
- [ ] Widget layar utama (`react-native-android-widget`)
- [ ] Quick Settings tile (config plugin)
- [ ] Input suara memakai speech-to-text bawaan HP, lalu diteruskan ke parser

---

## 10. Contoh konfigurasi deploy

```caddyfile
api.<domain> {
	encode gzip
	reverse_proxy localhost:3001
}
```

Contoh `.env` server:
```
HOST=127.0.0.1
PORT=3001
DATABASE_URL=postgres://catetin:<password>@127.0.0.1:5432/catetin
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://api.<domain>
OWNER_EMAIL=...
EMAIL=...              # Gmail untuk IMAP dan SMTP (OTP)
EMAIL_PASSWORD=...     # App password
MY_LID=...
MY_PHONE=...
WA_AUTH_DIR=./data/auth_session
```

---

## 11. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Sesi Baileys putus atau nomor diblokir | Backoff dan reconnect tanpa batas percobaan, kirim notifikasi push saat bot terputus, gunakan hanya untuk chat ke diri sendiri |
| Data Postgres hilang | Volume persisten, `pg_dump` harian dengan salinan di luar server, uji restore secara berkala |
| Postgres tidak bisa diakses | Container `restart: unless-stopped`, server mencoba ulang koneksi saat start, `/api/health` ikut mengecek DB |
| Port DB terekspos ke internet | Port hanya di-bind ke `127.0.0.1`, password kuat, tidak ada port forward |
| Server mati | systemd `Restart=always`. UID Gmail tersimpan di DB sehingga tidak ada email yang terlewat. |
| Format email Mandiri berubah | Test dengan contoh email asli. Email yang gagal di-parse dicatat di log dan dikabarkan lewat WA. |
| Selisih zona waktu | Semua waktu disimpan dalam UTC, dan semua perhitungan batas hari/bulan lewat `time.ts` dengan `Asia/Jakarta` |
| API terbuka ke publik | Semua route memerlukan sesi Better Auth, dan pendaftaran dibatasi ke `OWNER_EMAIL` |
