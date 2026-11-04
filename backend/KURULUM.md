# Backend kurulumu (Adım 1)

Bu klasör, şartnamedeki backend'in tamamıdır: veritabanı şeması, giriş, tanımlar, mal kabul, iş emri ve kiosk akışı, karantina, kesim, kalite, sevkiyat, bloke, soy ağacı, hammadde bakiye kartı, panel ve değişiklik izi.

## 0. Eski dosyaları temizle (bir kez)

Projenin kök klasöründe (ISO) terminali aç:

```bash
# Eski backend dosyaları artık kullanılmıyor
rm backend/src/routes/excelRoutes.js
rm -rf backend/src/controllers backend/src/models

# node_modules ve .env git'ten çıkarılır (diskten silinmez)
git rm -r --cached backend/node_modules frontend/node_modules backend/.env
```

Sonra bu paketteki dosyaları aynı yerlere kopyala. Kökteki `.gitignore` ve `docker-compose.yml` dosyaları da değişti.

## 1. Veritabanını başlat

Docker Desktop açık olmalı.

```bash
# Eski veritabanı farklı kullanıcıyla kurulmuştu; eski container ve verisi silinir
docker compose down -v

docker compose up -d
docker compose ps        # iso_postgres "healthy" görünmeli
```

## 2. Backend'i kur ve çalıştır

```bash
cd backend
npm install
cp .env.example .env
```

`.env` dosyasını aç. `JWT_SECRET` satırına uzun ve rastgele bir metin yaz. Üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sonra:

```bash
npm run db:migrate   # tabloları kurar
npm run db:seed      # örnek firma, kullanıcılar, makineler, ürünler
npm run dev          # API: http://localhost:5001/api/saglik
```

## 3. Her şeyin çalıştığını test et

API açıkken **ikinci bir terminalde**:

```bash
cd backend
npm run db:reset     # veritabanını sıfırlar ve örnek veriyi yeniden yükler
npm run test:akis
```

Ekranın sonunda `Sonuc: 82 basarili, 0 basarisiz` görmelisin. Bu test, mal kabulden sevkiyata kadar bütün akışı ve engellenmesi gereken durumları (onaysız malzeme, bloke parça, ilk parça onayı olmadan üretim vb.) dener.

## Örnek hesaplar (yalnızca yerel)

| Kullanıcı | Şifre | Kiosk | Rol |
| --- | --- | --- | --- |
| admin | Admin.1234 | | ADMIN, YONETIM |
| kalite | Kalite.1234 | sicil 1001, PIN 1111 | KALITE |
| sef | Sef.1234 | sicil 1002, PIN 2222 | SEF |
| depo | Depo.1234 | sicil 1003, PIN 3333 | DEPO |
| (yok) | | sicil 1215, PIN 1234 (kart: PR-1215) | OPERATOR |
| denetci | Denetci.1234 | | DENETCI (salt okunur) |

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | API'yi başlatır, dosya değişince kendini yeniden başlatır |
| `npm run db:migrate` | Yeni migration dosyalarını uygular |
| `npm run db:seed` | Örnek veriyi yükler (firma zaten varsa atlar) |
| `npm run db:reset` | **Tüm veriyi siler**, şemayı ve örnek veriyi baştan kurar |
| `npm run test:akis` | Uçtan uca akış testi |

## Klasör yapısı

```
backend/
  src/
    server.js            sunucuyu başlatır
    app.js               tüm uçlar burada bağlanır
    config/              .env okuma, veritabanı bağlantısı
    db/                  migration'lar, seed
    middleware/          oturum, rol kontrolü, hata yakalama
    lib/                 sabitler, doğrulama, barkod çözümleme
    services/            numara üretimi, olay günlüğü, etiket (ZPL), izlenebilirlik
    routes/              API uçları
  scripts/akis-testi.js
```

## API uçları

Tüm istekler `Authorization: Bearer <token>` başlığı ister (giriş ve sağlık hariç). Cevaplar camelCase JSON'dur. Hatalar her zaman `{ "hata": { "kod", "mesaj" } }` biçimindedir. `kod` alanı, frontend'in hatayı tanıması içindir (örnek: `ONAYSIZ_MALZEME`, `BLOKE`).

| Uç | Ne yapar | Rol |
| --- | --- | --- |
| `POST /api/auth/giris` | Kullanıcı adı + şifre ile giriş | herkes |
| `POST /api/auth/kiosk` | Kart barkodu (PR-1215) ya da sicil + PIN ile kiosk girişi (10 dk) | herkes |
| `GET /api/auth/ben` | Oturumdaki kullanıcı | |
| `GET /api/tanimlar` | Tüm seçim listeleri tek seferde | |
| `GET/POST/PATCH /api/tanimlar/:tur` | makineler, malzemeler, tedarikciler, musteriler, urunler, receteler, karakteristikler, hata-kodlari, depo-yerleri. Silme yok, `aktif:false` | ADMIN |
| `GET/POST/PATCH /api/tanimlar/kullanicilar` | Kullanıcı ve PIN yönetimi | ADMIN |
| `POST /api/hammadde/kabul` | Mal kabul, ambalaj etiketleri | DEPO, KALITE |
| `POST /api/hammadde/lotlar/:no/kontrol` | Giriş kontrolü: KABUL / KARANTINA / RET | KALITE |
| `POST /api/hammadde/cekis` | Depodan makineye; kısmi çekişte ambalaj bölünür | DEPO, OPERATOR, SEF |
| `POST /api/hammadde/iade` | Hattan depoya | DEPO, OPERATOR, SEF |
| `GET /api/hammadde/lotlar` · `/lotlar/:no` · `/lotlar/:no/bakiye` | Lot listesi, detay, bakiye kartı | |
| `POST /api/is-emirleri` · `GET /api/is-emirleri?makine=&durum=` · `GET /:no` | İş emri aç, listele, kiosk detayı | SEF |
| `POST /api/is-emirleri/:no/baslat` · `bagla` · `cikar` · `ilk-parca` · `karantina` · `top-bitir` · `duraklat` · `bitir` · `fark-aciklamasi` · `iptal` · `PATCH /:no` | Kiosk akışı | OPERATOR, SEF, KALITE |
| `POST /api/lotlar/:barkod/kesim` · `/numune` · `/birim/:barkod/bol` | Kesim, şahit numune, yeniden kesim | |
| `GET /api/kalite/bekleyenler` | İlk parça, karantina, son kontrol, hammadde kontrol bekleyenler | |
| `POST /api/kalite/karantina/:barkod/karar` | OLUMLU / YENIDEN_ISLEME / HURDA / SARTLI_KABUL | KALITE |
| `POST /api/kalite/son-kontrol` | Parça ya da lot: SERBEST / KARANTINA / RET | KALITE |
| `GET /api/kalite/etkilenenler?makine=&baslangic=&bitis=` | Zaman aralığındaki etkilenen birimler | |
| `POST /api/kalite/bloke` · `/bloke/:id/kaldir` · `GET /blokeler` · `POST /hurda` | Bloke ve hurda | KALITE |
| `POST /api/sevkiyat` · `GET` · `/:no/okut` · `/:no/cikar` · `/:no/onayla` | Sevkiyat ve CRM kuyruğu | DEPO, SEF |
| `GET /api/barkod/:barkod` | Okutulan şey ne? (birim, lot, iş emri, sevkiyat) | |
| `GET /api/izlenebilirlik/:barkod?yon=geri\|ileri\|ikisi` | Soy ağacı: düğümler + bağlar | |
| `GET /api/izlenebilirlik/:barkod/olaylar` | Zaman çizelgesi | |
| `GET/POST /api/birimler/:barkod/etiket` · `POST /yerlestir` | Etiket önizleme ve yeniden baskı, rafa yerleştirme | |
| `GET /api/panel/ozet` · `makineler` · `olaylar` · `saatlik` | Genel Bakış ekranı | |
| `GET /api/panel/degisiklik-izi` · `iz-dogrula` | Değişiklik izi ve zincir doğrulaması | KALITE, DENETCI, YONETIM |

## Güvenlik notları

- `olay` ve `degisiklik_izi` tabloları veritabanı seviyesinde yalnızca eklemeye açıktır. UPDATE, DELETE ve TRUNCATE trigger ile engellenir.
- Değişiklik izi satırları bir özet zinciriyle bağlıdır. `GET /api/panel/iz-dogrula` zincirin bozulup bozulmadığını kontrol eder.
- Her sorgu oturumdaki firmayla sınırlıdır. Bir firmanın kullanıcısı başka firmanın barkodunu göremez.
- Örnek şifreler yalnızca yereldir. Sunucuya kurulumda seed çalıştırılmaz, kullanıcılar ADMIN ekranından açılır.
