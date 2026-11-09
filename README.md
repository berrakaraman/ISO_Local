# ISO_Local — Uçtan uca üretim izlenebilirliği ve ISO 9001 KYS

Hammadde kabulünden müşteriye sevkiyata kadar her fiziksel parçanın barkodla izlendiği, her adımın bir öncekinin onayına bağlı olduğu fabrika takip sistemi.

- **backend/** — Node.js + Express + PostgreSQL API. Kurulum, kurallar ve tüm uçlar: [backend/KURULUM.md](backend/KURULUM.md)
- **frontend/** — React + Vite arayüzü (`npm install && npm run dev`, http://localhost:5173)
- **docs/** — [Sistem çökerse ne yapılır](docs/SISTEM_COKERSE.md), [KVKK aydınlatma metni şablonu](docs/KVKK_AYDINLATMA.md)

## Hızlı başlangıç

```bash
docker compose up -d                 # PostgreSQL
cd backend && npm install && cp .env.example .env   # .env içinde JWT_SECRET'i değiştirin
npm run db:reset && npm run dev      # şema + örnek veri, API :5001
# ikinci terminal
cd backend && npm run test:akis      # 408 kontrol: akış, engeller ve hesaplar
cd frontend && npm install && npm run dev
```

Sunucuya kurulum (Docker, HTTPS, gece yedeği): [sunucu/SUNUCU_KURULUM.md](sunucu/SUNUCU_KURULUM.md)

## Ekranlar

Menü role göre değişir: operatör iş emri, lot ve karantinayı; depo hammadde, depo işlemleri ve sevkiyatı; kalite onayları ve kalite sistemini; yönetim ve denetçi her şeyi görür.


| Menü | Ne yapılır |
| --- | --- |
| Genel Bakış | Özet sayılar, bana atanan onaylar, son olaylar |
| Ürün Hikâyesi | Barkod okut → soy ağacı (hammadde → iş emri → top → parça → müşteri) ve zaman çizelgesi |
| Makineler | Yerleşim planı: her makinede o an çalışan iş emri ve ürün (üretimde / ilk parça bekliyor / duraklatıldı / boş); makine kartı (bakım / arıza kayıtları, 7 gün kullanılabilirlik) |
| Performans (KPI) | İlk parça ilk seferde, fire, karantina, zamanında tamamlama, müşteri iadesi ppm, makine kullanılabilirliği — formül, pay ve payda ile |
| Formlar (YP, F-01…F-06) | Üretim özeti, hammadde giriş, üretim emri, üretim lot, karantina/red, kalite kontrol, sevkiyat |
| Depo İşlemleri | Depodan çekiş, hattan iade, rafa yerleştirme, yeniden kesim, doğrudan hurda, etiket yeniden basma |
| Geri Çağırma | Makine + zaman aralığı ya da hammadde lotundan etkilenen parçaları bul, bloke et, müşterileri gör |
| KYS Kayıtları | Şikâyet ve iade, DÖF, kalibrasyon, bakım / arıza kaydı, eğitim, tedarikçi değerlendirme, numune arşivi |
| Süreç Akışları | Rol bazlı akış şemaları ve her adımda sistemin neyi durdurduğu |
| Tanımlar | Makine, hammadde, ürün, reçete, kontrol planı, hata kodu, depo yeri, kullanıcılar, firma ayarları (kurallar, toleranslar, vardiyalar, KPI hedefleri) |

## Temel kurallar

- **Hiçbir kayıt silinmez.** Tanımlar pasife alınır, kayıtlar iptal edilir; olay günlüğü ve değişiklik izi veritabanı seviyesinde yalnızca eklemeye açıktır ve özet zinciriyle korunur.
- **Bir adım onaylanmadan sonraki başlamaz** (ayrıntılı tablo KURULUM.md'de): onaysız hammadde makineye takılamaz, onaysız iş emri başlamaz, ilk parça onayı olmadan üretim yok, proses ölçümü tolerans dışıysa iş emri durur, numunesiz kesim yok, onaysız sevkiyat çıkmaz, DÖF kapanmadan şikâyet kapanmaz.
- **Dört göz:** kimse kendi girdiği kaydı onaylayamaz; DÖF sorumlusu kendi faaliyetinin etkinliğini doğrulayamaz.
- **Her miktar hesapla denetlenir:** her üretim lotunda `giriş = dağılım` dengesi, her iş emrinde reçeteye göre malzeme dengesi, her hammadde lotunda bakiye kartı.

## Henüz yapılmayanlar (bilerek ertelendi)

Barkod okuyucu ve etiket yazıcı entegrasyonu (şimdilik ekrana yazarak / önizleme), makine başı kiosk ekranları, CRM bağlantısı (sevkiyatlar `entegrasyon_kuyrugu` tablosunda bekliyor), QR etiket adresi geçici.

## Yedekleme

`cd backend && npm run yedekle` — günlük çalıştırın (zamanlanmış görev) ve `backend/yedekler/` klasörünü harici diske kopyalayın. Geri yükleme ve sistem çökerse yapılacaklar: [docs/SISTEM_COKERSE.md](docs/SISTEM_COKERSE.md).
