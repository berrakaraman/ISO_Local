#!/usr/bin/env bash
# Sunucu kurulumu ve guncelleme: tek komut.
#   bash /opt/iso-kys/sunucu/kur.sh
# Hangi klasorde calistirildigi onemli degildir. Tekrar calistirmak guvenlidir:
#   - swap zaten varsa dokunmaz
#   - .env zaten varsa korur (sifreler degismez)
#   - ornek veri zaten yuklendiyse tekrar yuklemez
#   - kodu GitHub'dan ceker ve konteynerleri yeniden derler (veri silinmez)
set -euo pipefail

KLASOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$KLASOR"

adim() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
tamam() { printf '\033[0;32m    %s\033[0m\n' "$1"; }
dur() { printf '\n\033[1;31mHATA: %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = 0 ] || dur "root olarak calistirin."
command -v docker >/dev/null || dur "docker bulunamadi."

adim "1/6 Swap (RAM dolarsa diger projeler etkilenmesin)"
if [ -n "$(swapon --show --noheadings)" ]; then
  tamam "Swap zaten var: $(swapon --show --noheadings | awk '{print $1, $3}')"
else
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
  sysctl -q -p /etc/sysctl.d/99-swap.conf
  tamam "2 GB swap eklendi."
fi

adim "2/6 Kodu GitHub'dan guncelle"
git -C "$KLASOR/.." pull --ff-only
tamam "Kod guncel: $(git -C "$KLASOR/.." log -1 --format='%h %s')"

adim "3/6 Ayar dosyasi (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^DB_SIFRE=.*/DB_SIFRE=$(openssl rand -hex 24)/; s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 48)/" .env
  sed -i "s/^SUNUCU_ADRESI=.*/SUNUCU_ADRESI=$(curl -4 -s https://ifconfig.me)/" .env
  chmod 600 .env
  tamam ".env olusturuldu."
else
  tamam ".env zaten var, korunuyor."
fi
deger() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
[ -n "$(deger DB_SIFRE)" ] || dur ".env icinde DB_SIFRE bos."
[ "$(deger JWT_SECRET | wc -c)" -gt 32 ] || dur ".env icinde JWT_SECRET bos ya da kisa."
ADRES="$(deger SUNUCU_ADRESI)"
{ [ -n "$ADRES" ] && [ "$ADRES" != "1.2.3.4" ]; } || dur ".env icinde SUNUCU_ADRESI dogru degil: '$ADRES'"
tamam "Adres: $ADRES"

adim "4/6 Konteynerleri derle ve baslat (ilk seferde birkac dakika surer)"
# Proje kokundeki docker-compose.yml yalnizca yerel gelistirme icindir; sunucuda yanlislikla calistirilirsa
# "iso_postgres" konteyneri ve "iso-kys_pgdata" diski olusur. --remove-orphans konteyneri temizler, disk asagida silinir.
docker compose up -d --build --remove-orphans
docker volume rm iso-kys_pgdata >/dev/null 2>&1 && tamam "Yanlis kurulumdan kalan bos disk (iso-kys_pgdata) silindi." || true

adim "5/6 Veritabani ve API'nin hazir olmasi bekleniyor"
for i in $(seq 1 60); do
  durum="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$(docker compose ps -q api)" 2>/dev/null || true)"
  [ "$durum" = "healthy" ] && break
  [ "$i" = 60 ] && { docker compose logs --tail 40 api; dur "API 5 dakikada hazir olmadi. Yukaridaki logu gonderin."; }
  sleep 5
done
tamam "API hazir."

adim "6/6 Ornek veri"
firma_sayisi="$(docker compose exec -T db psql -U iso -d iso_db -tAc 'SELECT count(*) FROM firma')"
if [ "$firma_sayisi" = "0" ]; then
  docker compose run --rm -T api node src/db/seed.js | tee ilk-sifreler.txt
  chmod 600 ilk-sifreler.txt
  tamam "Ornek veri yuklendi. Sifreler ayrica su dosyada: $KLASOR/ilk-sifreler.txt"
else
  tamam "Ornek veri zaten var, dokunulmadi."
  [ -f ilk-sifreler.txt ] && tamam "Ilk sifreleri gormek icin:  cat $KLASOR/ilk-sifreler.txt"
fi

printf '\n\033[1;32mKurulum tamam.\033[0m  Tarayicida acin:  https://%s\n\n' "$ADRES"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
