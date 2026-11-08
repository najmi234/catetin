# Deploy Catetin ke server produksi

Target: STB Armbian (Ubuntu 24.04, aarch64) di rumah, dibuka ke internet lewat **Cloudflare Tunnel** di `https://catetin.shrimpie.qzz.io`. Tidak perlu IP publik, port forwarding, atau Caddy — HTTPS ditangani Cloudflare.

```
HP ──HTTPS──► Cloudflare ◄── cloudflared (STB) ──► http://localhost:3001 (Catetin)
                                                    └► Postgres di Docker (127.0.0.1:5432)
```

Semua perintah di bawah dijalankan **di STB**, kecuali disebut lain.

## 1. Cloudflare Tunnel

Di dashboard Cloudflare (Zero Trust → Networks → Tunnels), pada tunnel milik STB:

- Connector berstatus **Healthy**.
- Published application route: `catetin.shrimpie.qzz.io` → **`http://localhost:3001`** (HTTP, bukan HTTPS; Access tidak diaktifkan).

Untuk proyek lain, tambahkan route baru dengan subdomain satu tingkat (`<proyek>.shrimpie.qzz.io`) ke port masing-masing.

## 2. Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # v24.x
```

Pastikan user bisa memakai Docker tanpa `sudo`:

```bash
docker ps || { sudo usermod -aG docker $USER; echo "Logout lalu login lagi"; }
```

## 3. Ambil kode

```bash
sudo mkdir -p /opt/catetin && sudo chown $USER: /opt/catetin
git clone <url-repo-privat> /opt/catetin
cd /opt/catetin
# Hanya dependensi server — aplikasi mobile tidak dipasang di STB
npm ci -w @catetin/server -w @catetin/shared --include-workspace-root
```

Tanpa repo Git, salin dari laptop: `rsync -av --exclude node_modules --exclude .env --exclude expanse-recorder --exclude expense-dashboard ~/catetin/ najmi@stbnajmi:/opt/catetin/`

## 4. Database

```bash
cd /opt/catetin
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env    # dibaca docker compose
docker compose up -d --wait
grep POSTGRES_PASSWORD .env                                 # dipakai di langkah 5
```

Container otomatis menyala lagi setelah STB restart. Port database hanya di `127.0.0.1`.

## 5. Konfigurasi server

```bash
cp apps/server/.env.example apps/server/.env
nano apps/server/.env
```

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
DATABASE_URL=postgres://catetin:<POSTGRES_PASSWORD>@127.0.0.1:5432/catetin
BETTER_AUTH_SECRET=<hasil: openssl rand -base64 48>
BETTER_AUTH_URL=https://catetin.shrimpie.qzz.io
TRUSTED_ORIGINS=catetin://
OWNER_EMAIL=<email login kamu>
OWNER_NAME=<nama kamu>
EMAIL=<akun Gmail: pengirim kode login & sumber email Mandiri>
EMAIL_PASSWORD=<app password Gmail>
GMAIL_ENABLED=true
WA_ENABLED=true
MY_LID=<LID WhatsApp kamu>      # atau MY_PHONE=628xxxx
```

- Di produksi `EMAIL`/`EMAIL_PASSWORD` **wajib**: kode login dikirim lewat email.
- App password Gmail: Google Account → Security → 2-Step Verification → App passwords.
- `HOST=127.0.0.1` cukup: cloudflared berjalan di STB yang sama.

## 6. Jalankan pertama kali (scan QR WhatsApp)

Matikan dulu bot WhatsApp lama jika masih jalan, agar pesan tidak dibalas dua kali.

```bash
cd /opt/catetin
npm start -w @catetin/server
```

- Tunggu `API listening on http://127.0.0.1:3001`.
- Di terminal lain (atau dari laptop): `curl https://catetin.shrimpie.qzz.io/api/health` → `{"status":"ok",...}`.
- Scan QR yang muncul: WhatsApp → Perangkat tertaut → Tautkan perangkat.
- Setelah log `connected`, kirim `!help` ke chat dirimu sendiri.
- Tekan `Ctrl+C`. Sesi WhatsApp tersimpan di `apps/server/data/auth_session`.

## 7. Jalankan sebagai service

```bash
sudo cp deploy/catetin.service /etc/systemd/system/catetin.service
sudo sed -i "s/^User=USER/User=$USER/" /etc/systemd/system/catetin.service
sudo systemctl daemon-reload
sudo systemctl enable --now catetin
journalctl -u catetin -f        # lihat log, Ctrl+C untuk keluar
```

Setelah ini Catetin menyala sendiri setiap STB dinyalakan.

## 8. Backup harian

Penyimpanan STB (eMMC/SD) bisa rusak mendadak — **backup ke luar STB wajib**.

```bash
sudo mkdir -p /var/backups/catetin && sudo chown $USER: /var/backups/catetin
/opt/catetin/deploy/backup.sh               # tes sekali
crontab -e
# tambahkan:
30 2 * * * /opt/catetin/deploy/backup.sh >> $HOME/catetin-backup.log 2>&1
```

Salin hasilnya ke luar STB secara berkala, misalnya dari laptop:

```bash
rsync -av najmi@stbnajmi:/var/backups/catetin/ ~/backup-catetin/
```

## 9. APK Android

Di laptop (URL produksi sudah diatur di `apps/mobile/eas.json`):

```bash
cd apps/mobile
npx eas-cli@latest login            # akun Expo (gratis)
npx eas-cli@latest build --profile preview --platform android
```

Buka link hasil build di HP, unduh dan pasang APK-nya.

## Update kode

```bash
cd /opt/catetin
git pull
npm ci -w @catetin/server -w @catetin/shared --include-workspace-root
sudo systemctl restart catetin    # migration database berjalan otomatis saat start
```

## Masalah umum

| Gejala                                      | Cek                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Service gagal start                         | `journalctl -u catetin -n 50` — biasanya isi `.env`                                                    |
| `https://catetin.shrimpie.qzz.io` error 502 | Catetin belum jalan (`systemctl status catetin`) atau Service URL tunnel bukan `http://localhost:3001` |
| Error 1033 / tunnel tidak tersambung        | `systemctl status cloudflared` di STB                                                                  |
| Kode login tidak masuk                      | `EMAIL`/`EMAIL_PASSWORD` benar? Cek folder spam                                                        |
| WhatsApp minta scan ulang                   | Hentikan service, hapus `apps/server/data/auth_session`, ulangi langkah 6                              |
