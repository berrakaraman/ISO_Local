#!/usr/bin/env bash
# Demo verisini silip yeniden yukler. YALNIZCA bu projenin (iso-kys) veritabanina dokunur;
# sunucudaki diger projelere, konteynerlere ve klasorlere dokunmaz.
#
#   bash /opt/iso-kys/sunucu/demo-sifirla.sh          -> KURU CALISMA: neyin silinip neyin korunacagini gosterir, hicbir sey degistirmez
#   bash /opt/iso-kys/sunucu/demo-sifirla.sh --evet   -> once yedek alir, sonra siler ve demo verisini yeniden yukler
#
# Korunanlar: kullanicilar (sifre, PIN, rol), firma kodu, unvani ve ayarlari.
# Yeni eklenen kisi (Said) icin sifre uretilir, ekrana yazilir ve ilk-sifreler.txt dosyasinin sonuna eklenir.
# Bir sey ters giderse alinan yedekten geri donulur (komut en sonda yazar).
set -euo pipefail

KLASOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$KLASOR"

adim() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
tamam() { printf '\033[0;32m    %s\033[0m\n' "$1"; }
dur() { printf '\n\033[1;31mHATA: %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = 0 ] || dur "root olarak calistirin."
[ -f docker-compose.yml ] && grep -q '^name: iso-kys' docker-compose.yml || dur "Bu betik /opt/iso-kys/sunucu klasorundeki docker-compose.yml ile calisir."
api="$(docker compose ps -q api 2>/dev/null || true)"
[ -n "$api" ] || dur "iso-kys api konteyneri calismiyor. Once:  cd $KLASOR && docker compose up -d"
[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$api")" = "healthy" ] || dur "API henuz hazir degil (healthy degil). Biraz bekleyip tekrar deneyin."
docker compose exec -T api test -f scripts/demo-sifirla.js || dur "API imajinda scripts/demo-sifirla.js yok. Once yeni kodla derleyin:  cd $KLASOR && docker compose up -d --build"

if [ "${1:-}" != "--evet" ]; then
  adim "KURU CALISMA (hicbir sey degismez)"
  docker compose exec -T api node scripts/demo-sifirla.js
  printf '\nUygulamak icin:  bash %s/demo-sifirla.sh --evet\n\n' "$KLASOR"
  exit 0
fi

ZAMAN="$(date +%Y%m%d_%H%M%S)"
YEDEK="demo_oncesi_${ZAMAN}.dump"

adim "1/3 Once kontrol (kuru calisma): bir engel varsa hicbir sey yapilmadan durur"
docker compose exec -T api node scripts/demo-sifirla.js > "/tmp/iso-kys-demo-kontrol.txt" 2>&1 || { cat /tmp/iso-kys-demo-kontrol.txt; dur "Kontrol gecmedi. Hicbir sey degismedi."; }
grep -q "KURU CALISMA" /tmp/iso-kys-demo-kontrol.txt || { cat /tmp/iso-kys-demo-kontrol.txt; dur "Kontrol tamamlanmadi. Hicbir sey degismedi."; }
rm -f /tmp/iso-kys-demo-kontrol.txt
tamam "Kontrol tamam."

adim "2/3 Veritabani yedegi aliniyor: $KLASOR/yedekler/$YEDEK"
docker compose exec -T yedek sh -c "pg_dump --format=custom --no-owner --file=/yedekler/$YEDEK && pg_restore --list /yedekler/$YEDEK >/dev/null" \
  || dur "Yedek alinamadi. Hicbir sey silinmedi."
[ -s "yedekler/$YEDEK" ] || dur "Yedek dosyasi bos. Hicbir sey silinmedi."
tamam "Yedek alindi ve okunabildigi denetlendi ($(du -h "yedekler/$YEDEK" | cut -f1))."

adim "3/3 Demo verisi siliniyor ve yeniden yukleniyor (1-2 dakika)"
LOG="demo-sifirla_${ZAMAN}.log"
set +e
docker compose exec -T api node scripts/demo-sifirla.js --evet 2>&1 | tee "$LOG"
SONUC=${PIPESTATUS[0]}
set -e
chmod 600 "$LOG"
if [ "$SONUC" != 0 ]; then
  printf '\n\033[1;31mHATA: demo yuklenemedi. Ekrandaki ciktiyi gonderin.\033[0m\n'
  printf 'Eski haline donmek icin (yalnizca gerekirse):\n'
  printf '  cd %s && docker compose exec -T yedek pg_restore --clean --if-exists --no-owner -d iso_db /yedekler/%s\n\n' "$KLASOR" "$YEDEK"
  exit 1
fi

if grep -q '^YENI_KISI' "$LOG"; then
  { echo ""; echo "# $(date '+%F %T') demo-sifirla ile eklenen kisi(ler):"; grep '^YENI_KISI' "$LOG"; } >> ilk-sifreler.txt
  chmod 600 ilk-sifreler.txt
  tamam "Yeni kisinin sifresi ayrica su dosyanin sonuna eklendi: $KLASOR/ilk-sifreler.txt"
fi
printf '\n\033[1;32mDemo verisi yenilendi.\033[0m  Yedek: %s/yedekler/%s\n' "$KLASOR" "$YEDEK"
printf 'Herkes tarayicida bir kez cikis yapip yeniden girmeli (eski oturumlar gecersiz).\n\n'
