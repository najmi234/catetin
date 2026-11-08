# Catetin

Pencatat pengeluaran pribadi: aplikasi Android, bot WhatsApp, dan pencatatan otomatis dari email Livin' by Mandiri. Rencana lengkap ada di [PLAN.md](PLAN.md).

```
apps/mobile      Aplikasi Android (Expo)
apps/server      API + bot WhatsApp + Gmail poller (Node, Hono, Drizzle)
packages/shared  Parser nominal & pesan, util tanggal WIB, skema zod
```

## Menjalankan di lokal

Butuh Node 24 (`nvm use`) dan Docker.

```bash
npm install
docker compose up -d                       # PostgreSQL di 127.0.0.1:5432

cp apps/server/.env.example apps/server/.env   # isi BETTER_AUTH_SECRET dan OWNER_EMAIL
npm run dev -w @catetin/server             # API di http://localhost:3001
```

Tanpa `EMAIL`/`EMAIL_PASSWORD`, kode login dicetak di log server.

### Aplikasi di HP

1. Pasang **Expo Go** dari Play Store. HP dan laptop harus di Wi-Fi yang sama.
2. Di `apps/server/.env`, set `HOST=0.0.0.0` lalu restart server.
3. `cp apps/mobile/.env.example apps/mobile/.env` dan isi `EXPO_PUBLIC_API_URL` dengan IP laptop, mis. `http://192.168.1.10:3001`.
4. `npm start -w @catetin/mobile`, lalu scan QR-nya dengan Expo Go.

### Bot WhatsApp & email Mandiri

Set `WA_ENABLED=true` (isi `MY_LID` atau `MY_PHONE`) dan/atau `GMAIL_ENABLED=true` di `apps/server/.env`. QR WhatsApp muncul di log server saat pertama kali jalan. Matikan bot WhatsApp lama lebih dulu agar pesan tidak dibalas dua kali.

## Perintah

```bash
npm run check        # format, lint, typecheck, test — semua paket
npm test             # test saja
npm run db:generate -w @catetin/server   # buat migration setelah mengubah src/db/schema.ts
```
