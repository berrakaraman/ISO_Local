#!/bin/sh
# Gece yedegi (docker-compose.yml'deki "yedek" servisi calistirir).
# Her yarim saatte bir bakar: saat 03:00'u gectiyse ve bugunun yedegi yoksa alir.
mkdir -p /yedekler
while true; do
  GUN=$(date +%Y%m%d)
  DOSYA="/yedekler/iso_${GUN}.dump"
  if [ "$(date +%H)" -ge 3 ] && [ ! -f "$DOSYA" ]; then
    if pg_dump --format=custom --no-owner --file="$DOSYA.tmp" && pg_restore --list "$DOSYA.tmp" >/dev/null; then
      mv "$DOSYA.tmp" "$DOSYA"
      echo "$(date '+%F %T') yedek alindi: $DOSYA ($(du -h "$DOSYA" | cut -f1))"
    else
      rm -f "$DOSYA.tmp"
      echo "$(date '+%F %T') HATA: yedek alinamadi, 30 dk sonra tekrar denenecek"
    fi
    # Son 30 yedek kalsin
    ls -1t /yedekler/iso_*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f
  fi
  sleep 1800
done
