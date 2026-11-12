// Surec akislari (ISO 9001 4.4): her senaryoda kim, hangi ekranda, hangi dugmeye basar, ne yapar ve sistem neyi durdurur.
// Yeni personel kendi rolunu secip yalnizca kendi adimlarini one cikarabilir. Her adimdaki ekran adina tiklayinca o ekran acilir.
// Demo verisi yukluyse her senaryonun altinda "demoda gormek icin" baglantisi vardir (firma ayarlarindaki demo.ornekler).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ExternalLink, Lock, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/iso/PageHeader";
import { cn } from "@/lib/utils";
import { useOturum } from "@/lib/oturum";
import { useTanimlar } from "@/lib/tanimlar";

export const Route = createFileRoute("/_panel/surec")({ component: Surec });

type RolAd = "Depo" | "Operatör" | "Üretim şefi" | "Kalite" | "Yönetim" | "Sistem" | "Bakım";
type Adim = {
  rol: RolAd;
  ekran?: string; // menudeki ekran adi
  yol?: string; // ekranin adresi
  dugme?: string; // basilacak dugme
  ne: string; // ne yapar, sade cumle
  durdurur?: string; // sistem neyi engeller ve neden
  kod?: string; // sistemin hata kodu (destek icin)
};
type Akis = { id: string; baslik: string; ozet: string; neZaman: string; demo?: string; demoAciklama?: string; adimlar: Adim[] };

const ROL_RENK: Record<RolAd, string> = {
  Depo: "bg-[#e8f0fb] text-[#1d4f91]",
  Kalite: "bg-uygun-acik text-uygun",
  "Üretim şefi": "bg-dikkat-acik text-dikkat",
  Operatör: "bg-tas-100 text-tas-700",
  Bakım: "bg-sorun-acik text-unity-koyu",
  Yönetim: "bg-murekkep text-white",
  Sistem: "bg-white text-murekkep border border-murekkep/30",
};
const ROL_FILTRE: { ad: string; roller: RolAd[] }[] = [
  { ad: "Herkes", roller: [] },
  { ad: "Depo", roller: ["Depo"] },
  { ad: "Operatör", roller: ["Operatör"] },
  { ad: "Üretim şefi", roller: ["Üretim şefi", "Bakım"] },
  { ad: "Kalite", roller: ["Kalite"] },
  { ad: "Yönetim", roller: ["Yönetim"] },
];
const OTURUM_ROL: Record<string, string> = { DEPO: "Depo", OPERATOR: "Operatör", SEF: "Üretim şefi", KALITE: "Kalite", YONETIM: "Yönetim" };

const AKISLAR: Akis[] = [
  {
    id: "anaAkis",
    baslik: "1. Ana akış: malzemenin gelişinden müşteriye gidişine",
    ozet: "Her adım bir öncekinin onayını bekler. Onay gelmeden sistem sonraki adıma izin vermez; böylece onaysız malzeme kullanılmaz, kontrol edilmemiş ürün müşteriye gitmez.",
    neZaman: "Her üretimde",
    demo: "anaAkis",
    demoAciklama: "Sorunsuz bir işin bütün hikâyesi",
    adimlar: [
      { rol: "Depo", ekran: "Hammadde Giriş (F-01)", yol: "/tablo/hammadde", dugme: "Yeni Kayıt", ne: "Gelen malzemeyi, tedarikçiyi, tedarikçinin parti numarasını ve her ambalajın kilosunu girer. Her ambalaja ayrı etiket çıkar; etiketleri ambalajlara yapıştırır.", durdurur: "Askıya alınmış tedarikçiden mal kabul edilemez.", kod: "TEDARIKCI_ASKIDA" },
      { rol: "Kalite", ekran: "Genel Bakış → bana atanan onaylar", yol: "/panel", ne: "Malzemeyi kontrol eder: kabul, karantina ya da ret.", durdurur: "Malı kabul eden depocu kendi kaydını onaylayamaz (dört göz kuralı)." },
      { rol: "Üretim şefi", ekran: "Üretim Emri (F-02)", yol: "/tablo/uretim-emri", dugme: "Yeni Kayıt", ne: "Hangi makinede, hangi üründen, kaç metre üretileceğini girer ve onaylayacak kaliteciyi seçer. Sistem reçeteden ne kadar hammadde gerektiğini hemen hesaplar.", durdurur: "Ürünün reçetesi ve kontrol planı tanımlı değilse iş emri açılamaz.", kod: "URUN_KARTI_EKSIK" },
      { rol: "Kalite", ekran: "Genel Bakış → bana atanan onaylar", yol: "/panel", ne: "İş emrini onaylar.", durdurur: "Onaylanmamış iş emri başlatılamaz. Onaydan sonra miktar ya da makine değişirse onay sıfırlanır.", kod: "ONAY_BEKLIYOR" },
      { rol: "Depo", ekran: "Depo İşlemleri → Depodan çekiş", yol: "/depo", ne: "Bobini depodan alıp hatta götürür ve hangi iş için çektiğini okutur. Bobinin bir kısmı alınırsa sistem bobini böler, alınan kısma yeni etiket çıkar.", durdurur: "Kalitenin kabul etmediği malzeme depodan çekilemez.", kod: "ONAYSIZ_MALZEME" },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emrini aç", yol: "/tablo/uretim-emri", dugme: "Başlat, sonra Hammadde okut", ne: "İşi başlatır, makineye taktığı bobinleri okutur.", durdurur: "Makinede başka bir iş çalışıyorsa ikinci iş başlatılamaz.", kod: "MAKINE_DOLU" },
      { rol: "Kalite", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "İlk parça kontrolü", ne: "Makineden çıkan ilk ürünü kontrol planındaki değerlerle ölçer. Uygunsa seri üretim başlar; değilse ayar düzeltilip tekrar ölçülür. İlk parça sadece işin başında istenir.", durdurur: "Kalibrasyonu geçmiş aletle ölçüm girilemez.", kod: "KALIBRASYON_GECMIS" },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Proses ölçümü / Karantinaya ayır", ne: "Üretim sürerken en geç 120 dakikada bir ölçüm girer. Sorunlu kısım çıkarsa keser, hata kodunu ve metresini yazıp karantina etiketi yapıştırır.", durdurur: "Ölçüm 120 dakikayı geçtiyse top kapatılamaz.", kod: "PROSES_OLCUM_GECIKTI" },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Topu bitir", ne: "Biten topun metresini yazar; sistem topa lot numarası verir ve etiketini çıkarır.", durdurur: "Makinedeki hammadde sonradan karantinaya alındıysa top kapatılamaz.", kod: "HAMMADDE_ONAYSIZ" },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "İşi bitir", ne: "Artan malzemeyi tartıp yazar, depoya geri gönderir. Sistem harcanan hammaddeyi reçeteyle karşılaştırır: fark %3'ü geçerse şeften açıklama ister." },
      { rol: "Kalite", ekran: "Üretim Lot (F-03)", yol: "/tablo/uretim-lot", dugme: "Numune al", ne: "Topun kendisinden şahit numune alır ve numune dolabına koyar. Yıllar sonra şikâyet gelirse bu numuneye bakılır.", durdurur: "Numune alınmadan top kesilemez.", kod: "NUMUNE_YOK" },
      { rol: "Operatör", ekran: "Üretim Lot (F-03)", yol: "/tablo/uretim-lot", dugme: "Kes ve etiket bas", ne: "Topu müşterinin istediği boylarda keser (örneğin 100'er metre). Her parça aynı lotun -01, -02 diye numaralanan bir parçası olur.", durdurur: "Parçaların toplamı topu aşamaz; ölçüm sınır dışıysa top kesilmez, karantinaya gider.", kod: "KESIM_FAZLA" },
      { rol: "Kalite", ekran: "Kalite Kontrol (F-05)", yol: "/tablo/kalite-kontrol", dugme: "Son kontrol", ne: "Parçaları müşteriye gitmeden son kez kontrol eder: serbest, karantina ya da ret.", durdurur: "Bloke edilmiş parça serbest bırakılamaz.", kod: "BLOKE" },
      { rol: "Depo", ekran: "Sevkiyat (F-06)", yol: "/tablo/sevkiyat", dugme: "Yeni sevkiyat", ne: "Müşteriyi seçer, gönderilecek parçaları tek tek okutur ve kaliteye onaya gönderir.", durdurur: "Serbest bırakılmamış, karantinadaki ya da bloke parça okutulamaz." },
      { rol: "Kalite", ekran: "Genel Bakış → bana atanan onaylar", yol: "/panel", ne: "Yükü onaylar.", durdurur: "Onaydan sonra yüke parça eklenirse onay sıfırlanır.", kod: "ONAY_BEKLIYOR" },
      { rol: "Depo", ekran: "Sevkiyat (F-06)", yol: "/tablo/sevkiyat", dugme: "Sevk et", ne: "İrsaliye numarasını yazıp sevk eder. Artık Ürün Hikâyesi'nde bu parçanın hangi müşteriye gittiği görünür." },
    ],
  },
  {
    id: "hammaddeRet",
    baslik: "2. Hammadde uygun çıkmazsa",
    ozet: "Uygun olmayan malzeme üretime hiç giremez; tedarikçinin puanı da otomatik düşer.",
    neZaman: "Mal kabulde kalite sorun bulduğunda",
    demo: "hammaddeRet",
    demoAciklama: "Reddedilen bir PET partisi",
    adimlar: [
      { rol: "Depo", ekran: "Hammadde Giriş (F-01)", yol: "/tablo/hammadde", dugme: "Yeni Kayıt", ne: "Malzemeyi normal şekilde kabul eder ve kaliteye onaya gönderir." },
      { rol: "Kalite", ekran: "Hammadde Giriş (F-01)", yol: "/tablo/hammadde", ne: "Ölçer; sertifikayla uyuşmuyorsa ret ya da karantina der ve nedenini yazar." },
      { rol: "Sistem", ne: "Bu partinin bütün ambalajları kilitlenir.", durdurur: "Reddedilen ya da karantinadaki malzeme depodan çekilemez, makineye okutulamaz.", kod: "ONAYSIZ_MALZEME" },
      { rol: "Kalite", ekran: "KYS Kayıtları → Tedarikçi", yol: "/kys", ne: "Dönem sonunda tedarikçiyi değerlendirir. Kalite puanını elle girmez: sistem o dönemde gelen partilerden kaçının ilk seferde kabul edildiğine bakarak hesaplar. 60 puanın altı askıya alınır." },
    ],
  },
  {
    id: "ariza",
    baslik: "3. Makine arızalanırsa",
    ozet: "Sistem makineyi yönetmez; iş emri duraklatılır, arıza giderilince kayıt elle girilir.",
    neZaman: "Üretim sırasında makine durduğunda",
    demo: "ariza",
    demoAciklama: "Arıza kayıtları ve makine kartı",
    adimlar: [
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Duraklat", ne: "İşi duraklatır, nedenini yazar (örneğin \"tahrik kayışı koptu\"). Makineler ekranında makine turuncu görünür." },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Karantinaya ayır", ne: "Arıza sırasında çıkan şüpheli ürünü keser, karantina etiketi yapıştırır." },
      { rol: "Bakım", ne: "Arızayı giderir." },
      { rol: "Üretim şefi", ekran: "KYS Kayıtları → Bakım / arıza", yol: "/kys", ne: "Makineyi, tarihi, arızayı, yapılan işi, kullanılan parçayı ve makinenin kaç dakika durduğunu girer. Kayıt sonradan değiştirilemez." },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Devam et", ne: "İş kaldığı yerden sürer; ilk parça yeniden istenmez." },
      { rol: "Yönetim", ekran: "Performans (KPI)", yol: "/kpi", ne: "Makine kullanılabilirliği arıza dakikaları kadar düşer. Makine kartında son 7 günün bakım ve arızaları görünür." },
    ],
  },
  {
    id: "proses",
    baslik: "4. Üretim sırasında ölçü kaçarsa",
    ozet: "Sınır dışı bir ölçüm girildiği anda iş durur; hatalı ayarla üretime devam edilemez.",
    neZaman: "Proses ölçümü sınır dışı çıktığında",
    demo: "proses",
    demoAciklama: "Ölçü kaçtığı için kendiliğinden duran iş",
    adimlar: [
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Proses ölçümü", ne: "Ölçümü girer; bir değer sınır dışı (örneğin dış çap 10,5 mm, sınır 10,3)." },
      { rol: "Sistem", ne: "İş emri kendiliğinden duraklatılır. Son uygun ölçümden bu yana üretilenler şüpheli olarak bildirilir." },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Karantinaya ayır", ne: "Şüpheli kısmı keser ve karantinaya ayırır." },
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Devam et, sonra Proses ölçümü", ne: "Ayarı düzeltir, işi sürdürür ve yeni bir ölçüm yapar.", durdurur: "Uygun bir ölçüm girilmeden top kapatılamaz.", kod: "PROSES_UYGUN_DEGIL" },
    ],
  },
  {
    id: "karantina",
    baslik: "5. Karantinaya ayrılan ürün için karar",
    ozet: "Karantinadaki ürün kalitenin kararını bekler. Karar verilmeden kullanılamaz, sevk edilemez.",
    neZaman: "Üretimde ya da son kontrolde ürün ayrıldığında",
    demo: "karantina",
    demoAciklama: "Üç farklı karar ve bir bekleyen",
    adimlar: [
      { rol: "Operatör", ekran: "Üretim Emri (F-02) → iş emri", yol: "/tablo/uretim-emri", dugme: "Karantinaya ayır", ne: "Sorunlu kısmı keser, hata kodunu ve metresini yazar, karantina etiketini yapıştırır." },
      { rol: "Depo", ekran: "Depo İşlemleri → Rafa yerleştir", yol: "/depo", ne: "Karantina etiketli ürünü karantina alanına koyar.", durdurur: "Karar bekleyen ürün normal rafa konamaz." },
      { rol: "Kalite", ekran: "Karantina / Red (F-04)", yol: "/tablo/karantina-red", dugme: "Karar ver", ne: "Dört karardan birini verir: olumlu (tekrar ölçüldü, sorun yok; ürün yeni numara alır), yeniden işleme, şartlı kabul (müşteri onayıyla; not zorunlu) ya da hurda (not zorunlu)." },
      { rol: "Kalite", ekran: "Karantina / Red (F-04) → alttaki tablo", yol: "/tablo/karantina-red", dugme: "Serbest / Reddet", ne: "Son kontrolde ya da müşteri iadesinde karantinaya alınan bitmiş parçalar alttaki tabloda durur; bunlar için karar serbest ya da ret." },
    ],
  },
  {
    id: "iade",
    baslik: "6. Müşteri şikâyeti, iade ve düzeltici faaliyet (DÖF)",
    ozet: "Şikâyet, sorunun kök nedeni bulunup giderildiği ve bunun işe yaradığı doğrulandıktan sonra kapanır.",
    neZaman: "Müşteri bir sorun bildirdiğinde",
    demo: "iade",
    demoAciklama: "Müşteriye gidip iade edilen makara",
    adimlar: [
      { rol: "Kalite", ekran: "KYS Kayıtları → Şikâyet", yol: "/kys", ne: "Şikâyeti açar: müşteri, sevkiyat ve lot seçilir. Ürün Hikâyesi'nden parçanın hammaddesine, makinesine, operatörüne kadar bakılır.", durdurur: "Seçilen sevkiyat o müşteriye gitmemişse şikâyet açılamaz.", kod: "BASKA_MUSTERI" },
      { rol: "Depo", ekran: "KYS Kayıtları → Şikâyet → iade", yol: "/kys", ne: "Geri gelen parçaları okutur; parçalar kendiliğinden karantinaya düşer.", durdurur: "Sevk edilmemiş parça iade alınamaz." },
      { rol: "Kalite", ekran: "Karantina / Red (F-04) → alttaki tablo", yol: "/tablo/karantina-red", ne: "İade parçaya karar verir: serbest ya da ret (hurda).", durdurur: "Şikâyet açıkken o lotun şahit numunesi imha edilemez; delil olarak saklanır.", kod: "NUMUNE_DELIL" },
      { rol: "Kalite", ekran: "KYS Kayıtları → Şikâyet", yol: "/kys", dugme: "DÖF aç", ne: "Sorumlu kişiyi ve bitiş tarihini seçer." },
      { rol: "Üretim şefi", ekran: "KYS Kayıtları → DÖF", yol: "/kys", ne: "Kök nedeni ve yapılacak faaliyeti yazar, uygular ve \"tamamladım\" der.", durdurur: "Kök neden yazılmadan tamamlanamaz.", kod: "KOK_NEDEN_YOK" },
      { rol: "Kalite", ekran: "KYS Kayıtları → DÖF", yol: "/kys", ne: "Faaliyetin işe yarayıp yaramadığını doğrular. İşe yaramadıysa DÖF uygulamaya geri döner.", durdurur: "DÖF'ün sorumlusu kendi DÖF'ünü doğrulayamaz (dört göz kuralı)." },
      { rol: "Kalite", ekran: "KYS Kayıtları → Şikâyet", yol: "/kys", dugme: "Kapat", ne: "Şikâyeti kapatır. Haklı değilse gerekçe yazılarak kapatılır.", durdurur: "DÖF kapanmadan ya da iade parçalara karar verilmeden haklı şikâyet kapanmaz.", kod: "DOF_ACIK" },
    ],
  },
  {
    id: "geriCagirma",
    baslik: "7. Bir parti sonradan sorunlu çıkarsa (geri çağırma)",
    ozet: "Bütün haftanın üretimini değil, sadece o partiden yapılan parçaları bulur ve durdurur.",
    neZaman: "Tedarikçi uyarısı ya da tekrarlayan şikâyet geldiğinde",
    demo: "geriCagirma",
    demoAciklama: "Şüpheli çıkan bir Teknofil partisi",
    adimlar: [
      { rol: "Kalite", ekran: "Geri Çağırma", yol: "/geri-cagirma", dugme: "Etkilenenleri bul", ne: "Hammadde partisini ya da makine + saat aralığını girer. Sistem o partiden yapılan bütün parçaları listeler: hangileri depoda, hangileri hangi müşteriye gitmiş." },
      { rol: "Kalite", ekran: "Geri Çağırma", yol: "/geri-cagirma", dugme: "Bloke et", ne: "Depodaki parçaları bloke eder, nedenini yazar. Müşteriye gitmiş olanlar için müşteriler aranır." },
      { rol: "Sistem", ne: "Bloke parçalar Ürün Hikâyesi'nde ve depoda turuncu \"BLOKE\" etiketiyle görünür.", durdurur: "Bloke parça sevkiyata okutulamaz, serbest bırakılamaz.", kod: "BLOKE" },
      { rol: "Kalite", ekran: "Hammadde Giriş (F-01)", yol: "/tablo/hammadde", ne: "Partinin depoda kalan ambalajlarını karantinaya alır; artık üretime çekilemezler." },
      { rol: "Kalite", ekran: "Geri Çağırma", yol: "/geri-cagirma", ne: "İnceleme bitince blokeyi gerekçesini yazarak kaldırır ya da parçaları hurdaya ayırır." },
    ],
  },
  {
    id: "kalibrasyon",
    baslik: "8. Ölçüm aletinin kalibrasyonu bozuk çıkarsa",
    ozet: "Bozuk aletle verilmiş kararlar geriye dönük bulunur; o aletle yeni ölçüm girilemez.",
    neZaman: "Kalibrasyon sonucu uygun değil geldiğinde",
    demo: "kalibrasyon",
    demoAciklama: "Kullanım dışı kalan şerit metre",
    adimlar: [
      { rol: "Kalite", ekran: "KYS Kayıtları → Kalibrasyon", yol: "/kys", ne: "Kalibrasyon sonucunu \"uygun değil\" diye girer, açıklamasını yazar." },
      { rol: "Sistem", ne: "Alet kullanım dışı olur. Son uygun kalibrasyondan bu yana bu aletle yapılmış ölçümler ve ilgili iş emirleri listelenir." },
      { rol: "Kalite", ekran: "Geri Çağırma", yol: "/geri-cagirma", ne: "Gerekirse etkilenen üretimi bloke eder ve DÖF açar." },
      { rol: "Sistem", ne: "Bu aletle yeni ölçüm girilmeye çalışılırsa reddedilir.", kod: "ALET_KULLANIM_DISI" },
    ],
  },
];

function Surec() {
  const o = useOturum();
  const t = useTanimlar();
  const ornekler: Record<string, string> = ((t.data as any)?.firma?.ayarlar?.demo?.ornekler as Record<string, string>) || {};
  const benimRol = o?.kullanici.roller.map((r) => OTURUM_ROL[r]).find(Boolean) || "Herkes";
  const [filtre, setFiltre] = useState<string>("Herkes");
  const [acik, setAcik] = useState<string>("anaAkis");
  const secili = ROL_FILTRE.find((x) => x.ad === filtre) || ROL_FILTRE[0];

  return (
    <div>
      <PageHeader
        eyebrow="KYS"
        title="Süreç Akışları"
        description="Her senaryoda kim, hangi ekranda, hangi düğmeye basar ve sistem neyi neden durdurur. Yeni başlayan biri kendi rolünü seçip yalnızca kendi adımlarını öne çıkarabilir."
      />
      <div className="space-y-5 p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-tas-500">Adımları öne çıkar:</span>
          {ROL_FILTRE.map((x) => (
            <button
              key={x.ad}
              onClick={() => setFiltre(x.ad)}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-semibold ring-1 transition",
                filtre === x.ad ? "bg-murekkep text-white ring-murekkep" : "bg-white text-tas-600 ring-tas-200 hover:ring-tas-400",
              )}
            >
              {x.ad}
              {x.ad === benimRol && x.ad !== "Herkes" && <span className="ml-1 text-[10px] font-normal opacity-70">(sizin rolünüz)</span>}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <nav className="space-y-1.5 lg:sticky lg:top-4 lg:self-start">
            {AKISLAR.map((a) => (
              <button
                key={a.id}
                onClick={() => setAcik(a.id)}
                className={cn(
                  "w-full rounded-xl px-4 py-3 text-left ring-1 transition",
                  acik === a.id ? "bg-white ring-unity" : "bg-white/60 ring-tas-200 hover:ring-tas-400",
                )}
              >
                <div className="text-sm font-semibold text-murekkep">{a.baslik}</div>
                <div className="mt-0.5 text-[11px] text-tas-500">{a.neZaman}</div>
              </button>
            ))}
          </nav>

          {AKISLAR.filter((a) => a.id === acik).map((a) => (
            <section key={a.id} className="rounded-2xl border border-tas-200 bg-white p-6">
              <h2 className="font-display text-2xl font-bold text-murekkep">{a.baslik}</h2>
              <p className="mt-1 text-[15px] text-tas-600">{a.ozet}</p>
              {a.demo && ornekler[a.demo] && (
                <Link
                  to={(ornekler[a.demo].startsWith("/") ? ornekler[a.demo] : `/izle/${ornekler[a.demo]}`) as any}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-unity-acik px-3 py-2 text-sm font-semibold text-unity-koyu hover:bg-unity/15"
                >
                  <PlayCircle className="h-4 w-4" /> Demoda görmek için: {a.demoAciklama}
                  {!ornekler[a.demo].startsWith("/") && <span className="font-mono text-xs">({ornekler[a.demo]})</span>}
                </Link>
              )}

              <ol className="mt-6">
                {a.adimlar.map((x, i) => {
                  const soluk = secili.roller.length > 0 && !secili.roller.includes(x.rol);
                  return (
                    <li key={i} className={cn("transition-opacity", soluk && "opacity-35")}>
                      <div className="flex gap-4">
                        <div className="flex w-28 shrink-0 flex-col items-center">
                          <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-murekkep text-xs font-bold text-white">{i + 1}</span>
                          <span className={cn("w-full rounded-md px-2 py-1 text-center text-[11px] font-bold", ROL_RENK[x.rol])}>{x.rol}</span>
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl bg-tas-50 px-4 py-3 ring-1 ring-tas-100">
                          {(x.ekran || x.dugme) && (
                            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                              {x.ekran &&
                                (x.yol ? (
                                  <Link to={x.yol as any} className="inline-flex items-center gap-1 font-semibold text-unity hover:underline">
                                    {x.ekran} <ExternalLink className="h-3 w-3" />
                                  </Link>
                                ) : (
                                  <span className="font-semibold text-tas-600">{x.ekran}</span>
                                ))}
                              {x.dugme && (
                                <span className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-murekkep ring-1 ring-tas-200">düğme: {x.dugme}</span>
                              )}
                            </div>
                          )}
                          <div className="text-[14px] leading-relaxed text-murekkep">{x.ne}</div>
                          {x.durdurur && (
                            <div className="mt-1.5 flex items-start gap-1.5 text-[13px] text-unity-koyu">
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Sistem durdurur: {x.durdurur}
                                {x.kod && <span className="ml-1.5 font-mono text-[10px] text-tas-400">{x.kod}</span>}
                              </span>
                            </div>
                          )}
                          {!x.durdurur && x.kod && <div className="mt-1 font-mono text-[10px] text-tas-400">{x.kod}</div>}
                        </div>
                      </div>
                      {i < a.adimlar.length - 1 && (
                        <div className="flex w-28 justify-center py-1">
                          <ArrowDown className="h-4 w-4 text-tas-300" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
