# Sunucuya kurulum

Sistem sunucuda dört Docker konteyneri olarak çalışır. Hepsi `/opt/iso-kys` klasöründedir, adları `iso-kys-` ile başlar ve kendi ağlarındadır. Sunucudaki diğer projelere (Grafanalar, iiot, `fabrika_global`) dokunmaz.

| Konteyner | Görevi | Bellek sınırı | Dışarı açık mı |
| --- | --- | --- | --- |
| `iso-kys-db-1` | PostgreSQL 16 veritabanı | 512 MB | Hayır |
| `iso-kys-api-1` | Backend. Açılışta yalnızca yeni tablo değişikliklerini uygular, veri silmez | 384 MB | Hayır |
| `iso-kys-web-1` | Ekranlar + HTTPS (Caddy). `/api` isteklerini backend'e iletir | 128 MB | 80 ve 443 |
| `iso-kys-yedek-1` | Her gece 03:00'ten sonra veritabanı yedeği alır, son 30'u tutar | 128 MB | Hayır |

Her konteynerin logu en fazla 30 MB tutulur, disk dolmaz.

**HTTPS ücretsizdir.** Sertifikayı Let's Encrypt verir. Alan adı olmadan doğrudan IP adresine de verir. Bu sertifika 6 gün geçerlidir ve Caddy onu birkaç günde bir kendiliğinden yeniler. Elle yapılacak bir şey yok.

> Sunucuda **asla** `npm run db:reset` ya da `docker compose down -v` çalıştırma. İkisi de bütün veriyi siler (`db:reset` sunucuda zaten kodla engelli).

---

## A. Bilgisayarında (bir kez)

1. Yamayı uygula ve ekranların sunucuda derlenebildiğini dene:
   ```
   cd ~/Projeler/ISO
   git apply ~/Downloads/iso_sunucu.patch
   cd frontend && npm run build
   ```
   Sonunda `✓ built in …` görmelisin. Hata verirse ekranı bana gönder; sunucuda da aynı hata çıkar.
2. GitHub'a gönder:
   ```
   cd ~/Projeler/ISO
   git add -A && git commit -m "Sunucu kurulumu" && git push
   ```

## B. Sunucuda ön kontrol (hiçbir şeyi değiştirmez)

```
uname -m
ss -tlnp | grep -E ':(80|443) ' || echo "80 ve 443 bos"
ufw status verbose
iptables -S INPUT | head -20
```

Çıktıyı bana gönder. Ayrıca Hetzner panelinde kontrol et: **Hetzner Console → Servers → bu sunucu → Firewalls** sekmesi.
- **Firewall bağlı değilse:** şimdilik bir şey yapma. Yeni bir firewall oluşturup bağlarsan, içinde açık bırakmadığın her port kapanır; Grafanalar ve iiot sunucuları o an erişilemez olur.
- **Firewall bağlıysa:** gelen (Inbound) kurallara şunları ekle: TCP 80, TCP 443, UDP 443.

`ufw` kapalıysa (`Status: inactive`) öyle kalsın. Şimdi açmak SSH'ı ve diğer projeleri kesebilir.

## C. Swap (bir kez, RAM dolarsa konteynerler ölmesin diye)

```
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl -p /etc/sysctl.d/99-swap.conf
free -h
```

`free -h` çıktısında `Swap: 2.0Gi` görmelisin. `swappiness=10`, swap'ın yalnızca RAM gerçekten dolunca kullanılmasını sağlar.

## D. Kodu indir

Depo herkese açıksa:
```
git clone https://github.com/berrakaraman/ISO_Local.git /opt/iso-kys
```

Depo gizliyse kullanıcı adı ve şifre sorar. O zaman sunucuya yalnızca okuma izni olan bir anahtar ver:
```
ssh-keygen -t ed25519 -f /root/.ssh/iso_kys_github -N "" -C "iso-kys sunucu"
cat /root/.ssh/iso_kys_github.pub
```
Çıkan satırı kopyala. GitHub'da depo → **Settings → Deploy keys → Add deploy key** sayfasına yapıştır; "Allow write access" kutusu **boş** kalsın. Sonra:
```
cat >> /root/.ssh/config <<'EOF'
Host github-iso-kys
  HostName github.com
  User git
  IdentityFile /root/.ssh/iso_kys_github
  IdentitiesOnly yes
EOF
git clone git@github-iso-kys:berrakaraman/ISO_Local.git /opt/iso-kys
```

## E. Ayarlar

```
cd /opt/iso-kys/sunucu
cp .env.example .env
sed -i "s/^DB_SIFRE=.*/DB_SIFRE=$(openssl rand -hex 24)/; s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 48)/" .env
chmod 600 .env
nano .env
```

`nano` içinde `SUNUCU_ADRESI=1.2.3.4` satırına sunucunun IP'sini yaz. İstersen firma kodunu ve unvanını da değiştir. Kaydetmek için `Ctrl+O`, Enter, çıkmak için `Ctrl+X`.

## F. Başlat

```
cd /opt/iso-kys/sunucu
docker compose up -d --build
docker compose ps
```

İlk derleme birkaç dakika sürer. Sonunda dört konteynerin hepsi `Up` olmalı; `db` ve `api` `(healthy)` göstermeli.

## G. Örnek veriyi yükle (yalnızca ilk kurulumda, bir kez)

```
docker compose run --rm api node src/db/seed.js
```

Sunucuda örnek hesapların şifreleri **rastgele üretilir** ve **yalnızca bu bir kez** ekrana yazılır. Hemen bir yere kaydet. Yerelde kullandığın `Berra.1234` gibi şifreler sunucuda çalışmaz; internete açık sistemde herkesin bildiği şifre olmasın diye. Komutu ikinci kez çalıştırırsan "firma zaten var" deyip hiçbir şey yapmaz.

## H. Dene

1. Tarayıcıda `https://SUNUCU-IP` adresini aç. Kilit simgesi görünmeli, giriş ekranı gelmeli.
2. Sertifika alınamadıysa sayfa açılmaz. Logu bana gönder:
   ```
   docker compose logs web | grep -iE "certificate|error" | tail -20
   ```
3. Bellek kullanımı:
   ```
   docker stats --no-stream $(docker compose ps -q)
   ```

---

## Günlük işler

| Ne | Komut (`/opt/iso-kys/sunucu` içinde) |
| --- | --- |
| Yeni sürümü kur | `git -C /opt/iso-kys pull && docker compose up -d --build` |
| Durum | `docker compose ps` |
| Backend logu | `docker compose logs --tail 100 api` |
| Yeniden başlat | `docker compose restart` |
| Durdur (veri kalır) | `docker compose down` |
| Yedekleri gör | `ls -lh yedekler` |
| Hemen yedek al | `docker compose exec yedek sh -c 'pg_dump -Fc -f /yedekler/elle_$(date +%Y%m%d_%H%M).dump'` |
| Yedeği Mac'e indir (Mac'te çalıştır) | `scp root@SUNUCU-IP:/opt/iso-kys/sunucu/yedekler/iso_*.dump ~/Projeler/` |

Yedekler sunucu diskinde durur. Ayda bir Mac'e indir: sunucu tamamen giderse yedek de gider.

## Başka sunucuya taşıma

1. Eski sunucuda yedek al ve indir (yukarıdaki tablo).
2. Yeni sunucuda D ve E adımlarını yap.
3. Önce yalnızca veritabanını başlatıp yedeği geri yükle, sonra hepsini başlat:
   ```
   cd /opt/iso-kys/sunucu
   docker compose up -d db
   docker compose exec -T db pg_restore --no-owner -U iso -d iso_db < /yol/iso_YYYYAAGG.dump
   docker compose up -d --build
   ```
   G adımını (örnek veri) bu durumda **yapma**; veri yedekten geldi.

## Alan adı alınca

`.env` içinde `SUNUCU_ADRESI=kys.firmaniz.com` yap ve alan adının DNS kaydını sunucunun IP'sine yönlendir. Sonra:
```
docker compose up -d
```
Caddy yeni adrese kendisi sertifika alır.
