# Sistem çökerse ne yapılır (iş sürekliliği talimatı)

Amaç: sistem çalışmadığı sürede üretim **kayıtsız** devam etmesin, sistem dönünce hiçbir hareket kaybolmasın.

## 1. Durumu anla (ilk 10 dakika)

| Belirti | Olası neden | Kontrol |
| --- | --- | --- |
| Ekran "Sunucuya ulaşılamıyor" | API kapalı | Sunucuda `cd backend && npm run dev` çalışıyor mu? `http://localhost:5001/api/saglik` açılıyor mu? |
| `/api/saglik` → `veritabani: baglanamadi` | PostgreSQL kapalı | `docker compose ps` → `iso_postgres` healthy mi? Değilse `docker compose up -d` |
| Giriş yapılıyor ama her işlem hata veriyor | Disk dolu / veritabanı bozuk | `docker compose logs postgres --tail 50` |
| Tek bir bilgisayarda açılmıyor | Ağ / tarayıcı | Başka bilgisayardan deneyin |

Sorumlu: sistem yöneticisi (ADMIN). Yoksa kalite sorumlusu bilgi işleme haber verir.

## 2. Sistem yokken üretim (kâğıt form)

Sistem dönene kadar **kâğıt formlar** kullanılır (form kodları ekrandakilerle aynı: F-01 … F-06). Kurallar değişmez:

- **Mal kabul (F-01):** gelen malzeme "KONTROL BEKLİYOR" kâğıt etiketiyle ayrı yerde tutulur, kalite imzası olmadan hatta verilmez.
- **İş emri (F-02):** yalnızca sistem çökmeden önce onaylanmış iş emirleri sürdürülür. Yeni iş emri açılmaz; zorunluysa üretim şefi + kalite kâğıda imza atar.
- **Hat:** her bobin / çuval için barkod numarası, takılma ve çıkarma saati, kalan miktar elle yazılır. İlk parça ve proses ölçümleri kâğıda, alet kodu ile.
- **Top / karantina:** her topun metrajı, saati ve makinesi yazılır; karantina parçalarına elle "KARANTİNA" etiketi.
- **Sevkiyat:** sistem dönene kadar **sevkiyat yapılmaz** (izlenebilirlik zinciri kopmasın). Zorunlu sevkiyat yalnızca yönetim onayıyla, parça barkodları tek tek yazılarak.
- **Duruş:** sistem kapalı kalma süresi her makinede "Diğer — sistem kapalı" duruşu olarak not edilir.

## 3. Geri yükleme gerekiyorsa

Veritabanı bozulduysa en son sağlam yedekten dönülür:

```bash
cd backend
ls -lt yedekler/                       # en son yedek
# API'yi durdurun (Ctrl+C), sonra:
npm run geri-yukle -- yedekler/iso_YYYYAAGG_SSDDSS.dump --evet
npm run dev
```

`geri-yukle` önce mevcut durumun yedeğini alır (geri dönüş için), yedeği tek işlemde yükler (yarıda kalırsa hiçbir şey değişmez) ve kayıt sayılarını yazar.

Sonra **Genel Bakış → değişiklik izi doğrulaması** (`GET /api/panel/iz-dogrula`) çalıştırılır; `saglam: true` görülmelidir.

## 4. Sistem dönünce: kâğıttan sisteme aktarım

1. Kâğıt kayıtlar **olduğu sırayla** girilir: mal kabul → giriş kontrolü → çekiş → bağlama → ilk parça → karantina → top bitirme → kesim → son kontrol → sevkiyat.
2. Her girişin açıklamasına `KAGIT: <form no>, gerçek saat <SS:DD>` yazılır (sistem kayıt saatini değiştirmez; gerçek saat açıklamada kalır).
3. Aktarımı yapan kişi ile kontrol eden kişi farklı olmalıdır (dört göz).
4. Her iş emri için miktar dengesi ve her lot için lot dengesi kontrol edilir; fark varsa DÖF açılır.
5. Kâğıt formlar taranıp arşivlenir (saklama süresi: kalite kayıtlarıyla aynı).

## 5. Önleyici önlemler

- `npm run yedekle` her gün en az bir kez (vardiya sonu) zamanlanmış görevle çalışır; yedek klasörü haftada bir harici diske / ağ sürücüsüne kopyalanır.
- Ayda bir yedekten **deneme geri yüklemesi** yapılır (test bilgisayarında) ve sonuç kaydedilir.
- Sunucu bilgisayarı kesintisiz güç kaynağına (UPS) bağlıdır.
- Disk doluluğu ayda bir kontrol edilir.

| Kontrol | Sıklık | Sorumlu | Kayıt |
| --- | --- | --- | --- |
| Yedek alındı mı | Günlük | Sistem yöneticisi | `backend/yedekler/` listesi |
| Harici kopya | Haftalık | Sistem yöneticisi | Kopya tarihi |
| Deneme geri yükleme | Aylık | Sistem yöneticisi + kalite | Sonuç ve süre |
| İz zinciri doğrulama | Aylık / denetim öncesi | Kalite | `iz-dogrula` sonucu |
