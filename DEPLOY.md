# Deploy Catetin ke server produksi

Asumsi: server Linux (Ubuntu/Debian) yang bisa diakses lewat SSH, punya domain, dan port 80/443 terbuka. Ganti `api.example.com` dengan subdomainmu dan `USER` dengan user Linux di server.

## 1. DNS

Buat record **A** `api.example.com` → IP publik server. Cek dari laptop:

```bash
dig +short api.example.com   # harus menampilkan IP server
```

## 2. Siapkan server

```bash
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # v24.x

# Docker (lewati jika sudah ada)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # lalu logout & login lagi

# Caddy (lewati jika sudah ada)
sudo apt-get install -y caddy
```

## 3. Ambil kode

Dari laptop, push repo ke Git (GitHub/GitLab privat), lalu di server:

```bash
sudo mkdir -p /opt/catetin && sudo chown $USER: /opt/catetin
git clone <url-repo> /opt/catetin
cd /opt/catetin
# Hanya dependensi server — aplikasi mobile tidak perlu dipasang di server
npm ci -w @catetin/server -w @catetin/shared --include-workspace-root
```

## 4. Database

```bash
cd /opt/catetin
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env    # dibaca docker compose
docker compose up -d --wait
```

Port database hanya terbuka di `127.0.0.1`, tidak bisa diakses dari internet.

## 5. Konfigurasi server

```bash
cp apps/server/.env.example apps/server/.env
nano apps/server/.env
```

Isi minimal untuk produksi:

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
DATABASE_URL=postgres://catetin:<POSTGRES_PASSWORD dari langkah 4>@127.0.0.1:5432/catetin
BETTER_AUTH_SECRET=<hasil: openssl rand -base64 48>
BETTER_AUTH_URL=https://api.example.com
TRUSTED_ORIGINS=catetin://
OWNER_EMAIL=<email login kamu>
OWNER_NAME=<nama kamu>
EMAIL=<akun Gmail pengirim kode login & sumber email Mandiri>
EMAIL_PASSWORD=<app password Gmail>
GMAIL_ENABLED=true
WA_ENABLED=true
MY_LID=<LID WhatsApp kamu>      # atau MY_PHONE=628xxxx
```

Di produksi `EMAIL`/`EMAIL_PASSWORD` **wajib**: kode login dikirim lewat email.
App password Gmail: Google Account → Security → 2-Step Verification → App passwords.

## 6. Jalankan pertama kali (scan QR WhatsApp)

Matikan dulu bot WhatsApp lama jika masih jalan, agar pesan tidak dibalas dua kali.

```bash
cd /opt/catetin
npm start -w @catetin/server
```

- Tunggu `API listening on http://127.0.0.1:3001`.
- Scan QR yang muncul: WhatsApp → Perangkat tertaut → Tautkan perangkat.
- Setelah log `connected`, kirim `!help` ke chat dirimu sendiri untuk mengetes.
- Tekan `Ctrl+C`. Sesi WhatsApp tersimpan di `apps/server/data/auth_session`.

## 7. Jalankan sebagai service

```bash
sudo cp deploy/catetin.service /etc/systemd/system/catetin.service
sudo sed -i "s/^User=USER/User=$USER/" /etc/systemd/system/catetin.service
sudo systemctl daemon-reload
sudo systemctl enable --now catetin
journalctl -u catetin -f        # lihat log, Ctrl+C untuk keluar
```

## 8. HTTPS dengan Caddy

Tambahkan isi `deploy/Caddyfile` (ganti `api.example.com`) ke `/etc/caddy/Caddyfile`, lalu:

```bash
sudo systemctl reload caddy
curl https://api.example.com/api/health    # {"status":"ok",...}
```

## 9. Backup harian

```bash
sudo mkdir -p /var/backups/catetin && sudo chown $USER: /var/backups/catetin
/opt/catetin/deploy/backup.sh               # tes sekali
crontab -e
# tambahkan:
30 2 * * * /opt/catetin/deploy/backup.sh >> $HOME/catetin-backup.log 2>&1
```

Sebaiknya salin `/var/backups/catetin` secara berkala ke luar server (laptop, Google Drive, dsb).

## 10. APK Android

Di laptop:

1. Ganti `EXPO_PUBLIC_API_URL` di `apps/mobile/eas.json` menjadi `https://api.example.com`.
2. Build:
   ```bash
   cd apps/mobile
   npx eas-cli@latest login            # akun Expo (gratis)
   npx eas-cli@latest build --profile preview --platform android
   ```
3. Buka link hasil build di HP, unduh dan pasang APK-nya.

## Update kode

```bash
cd /opt/catetin
git pull
npm ci -w @catetin/server -w @catetin/shared --include-workspace-root
sudo systemctl restart catetin    # migration database berjalan otomatis saat start
```

## Masalah umum

| Gejala                    | Cek                                                                       |
| ------------------------- | ------------------------------------------------------------------------- |
| Service gagal start       | `journalctl -u catetin -n 50` — biasanya isi `.env`                       |
| `curl https://...` gagal  | DNS sudah mengarah? Port 80/443 terbuka? `journalctl -u caddy -n 50`      |
| Kode login tidak masuk    | `EMAIL`/`EMAIL_PASSWORD` benar? Cek folder spam                           |
| WhatsApp minta scan ulang | Hentikan service, hapus `apps/server/data/auth_session`, ulangi langkah 6 |
