// Surec akis semalari (ISO 9001 4.4): kim, hangi adimi, hangi kosulda yapar; bir onay eksikse sistem neyi durdurur.
// Ekrandaki her "engel" backend'de bir hata kodudur; kodlar parantez icinde.
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, Lock } from "lucide-react";
import { PageHeader } from "@/components/iso/PageHeader";
import { Bolum } from "@/components/iso/FormParcalari";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/surec")({ component: Surec });

type Adim = { rol: string; ne: string; engel?: string; kayit?: string };
type Akis = { baslik: string; aciklama: string; adimlar: Adim[] };

const ROL_RENK: Record<string, string> = {
  Depo: "bg-[#e8f0fb] text-[#1d4f91]",
  Kalite: "bg-uygun-acik text-uygun",
  "Üretim şefi": "bg-dikkat-acik text-dikkat",
  Operatör: "bg-tas-100 text-tas-700",
  Bakım: "bg-sorun-acik text-unity-koyu",
  Yönetim: "bg-murekkep text-white",
  Sistem: "bg-white text-murekkep border border-murekkep/30",
};

const AKISLAR: Akis[] = [
  {
    baslik: "1. Ana akış: mal kabulden sevkiyata",
    aciklama: "Her adım bir öncekinin onayına bağlıdır. Onay yoksa sistem bir sonraki adıma geçirmez.",
    adimlar: [
      { rol: "Depo", ne: "Mal kabul: ambalajlar tartılır, her birine etiket basılır, giriş kontrolü kaliteye atanır.", engel: "Askıdaki tedarikçiden kabul yok (TEDARIKCI_ASKIDA)", kayit: "F-01" },
      { rol: "Kalite", ne: "Giriş kontrolü: kabul / karantina / ret. Mal kabulü yapan kişi kendi lotunu onaylayamaz.", engel: "Dört göz kuralı", kayit: "F-01" },
      { rol: "Üretim şefi", ne: "İş emri açar; ürün kartında reçete + ilk parça + metraj planı olmalı. Onaya kaliteye gönderir.", engel: "Eksik ürün kartı (URUN_KARTI_EKSIK)", kayit: "F-02" },
      { rol: "Kalite", ne: "İş emrini onaylar. Onaydan sonra miktar/makine değişirse onay sıfırlanır.", engel: "Onaysız iş emri başlatılamaz (ONAY_BEKLIYOR)" },
      { rol: "Depo", ne: "Depodan hatta çekiş (gerekirse ambalaj bölünür, yeni etiket).", engel: "Kabul edilmemiş malzeme çekilemez (ONAYSIZ_MALZEME)" },
      { rol: "Operatör", ne: "İşi başlatır, hammaddeleri makineye okutur.", engel: "Aynı makinede başka iş çalışıyorsa başlatılamaz (MAKINE_DOLU)" },
      { rol: "Kalite", ne: "İlk parça ölçümü (kalibrasyonu geçerli aletle). Uygunsa üretim başlar. İlk parça yalnızca işin başında istenir.", engel: "Kalibrasyon geçmiş aletle ölçüm yok (KALIBRASYON_GECMIS)" },
      { rol: "Operatör", ne: "Üretim; uygunsuz kısım karantinaya ayrılır. Periyodik proses ölçümü (varsayılan 120 dk).", engel: "Ölçüm gecikirse top kapanmaz (PROSES_OLCUM_GECIKTI)" },
      { rol: "Operatör", ne: "Topu bitirir → üretim lotu. Makinedeki hammadde hâlâ kabul durumunda olmalı.", engel: "Karantinaya alınan hammaddeyle top kapanmaz (HAMMADDE_ONAYSIZ)", kayit: "F-03" },
      { rol: "Kalite", ne: "Şahit numune topun kendisinden alınır (topun metrajından düşer).", engel: "Numunesiz kesim yok (NUMUNE_YOK)" },
      { rol: "Operatör", ne: "Metraj ölçümü + kesim. Ölçüm tolerans dışıysa top karantinaya gider; fire = top − parçalar.", engel: "Parçalar topu aşamaz (KESIM_FAZLA)" },
      { rol: "Kalite", ne: "Son kontrol: serbest / karantina / ret.", engel: "Bloke parça serbest bırakılamaz (BLOKE)", kayit: "F-05" },
      { rol: "Depo", ne: "Sevkiyat hazırlar, parçaları okutur; kaliteye onaya gönderir.", engel: "Serbest olmayan / bloke parça okutulamaz", kayit: "F-06" },
      { rol: "Kalite", ne: "Yükü onaylar. Onaydan sonra yük değişirse onay sıfırlanır.", engel: "Onaysız sevk yok (ONAY_BEKLIYOR)" },
      { rol: "Depo", ne: "İrsaliye no ile sevk eder. Soy ağacı: müşteri → parça → top → iş emri → hammadde lotu." },
    ],
  },
  {
    baslik: "2. Arıza senaryosu",
    aciklama: "Makine bozulduğunda iş durur; arıza giderilince kayıt elle girilir. Makineye sistemden müdahale edilmez.",
    adimlar: [
      { rol: "Operatör", ne: "İş emri penceresinde Duraklat (açıklama: \"tel koptu\", \"kayış koptu\"…). Yerleşim planında makine turuncu görünür." },
      { rol: "Operatör", ne: "Arıza sırasında ayrılan şüpheli ürünü Karantinaya ayır ile etiketler." },
      { rol: "Bakım", ne: "Arızayı giderir." },
      { rol: "Üretim şefi", ne: "KYS Kayıtları → Bakım / arıza: makine, tarih, arıza, yapılan işlem, kullanılan parça, duruş (dk) girer. Kayıt sonradan değiştirilemez." },
      { rol: "Operatör", ne: "Devam et: iş kaldığı yerden sürer, ilk parça yeniden istenmez." },
      { rol: "Yönetim", ne: "KPI: makine kullanılabilirliği arıza dakikalarıyla düşer; makine kartında son 7 gün görünür." },
    ],
  },
  {
    baslik: "3. Proses ölçümü tolerans dışı",
    aciklama: "Üretim sırasında bir ölçüm sınır dışıysa ürün sevk edilmeden yakalanır.",
    adimlar: [
      { rol: "Operatör", ne: "Periyodik proses ölçümünü girer; bir değer bile sınır dışı." },
      { rol: "Sistem", ne: "İş emri otomatik DURAKLATILDI; şüpheli aralık (son uygun ölçümden şimdiye) bildirilir." },
      { rol: "Operatör", ne: "Şüpheli kısmı karantinaya ayırır. Gerekirse kalite Geri Çağırma ekranından makine + saat aralığıyla etkilenen parçaları bloke eder." },
      { rol: "Operatör", ne: "Ayarı düzeltir, Devam et der, yeni proses ölçümü yapar.", engel: "Uygun proses ölçümü olmadan top kapanmaz (PROSES_UYGUN_DEGIL)" },
    ],
  },
  {
    baslik: "4. Müşteri şikâyeti, iade ve DÖF",
    aciklama: "Şikâyet ancak düzeltici faaliyet etkinliği doğrulandıktan sonra kapanır.",
    adimlar: [
      { rol: "Kalite", ne: "Şikâyet açar (müşteri, sevkiyat, lot). Sevkiyat/lot o müşteriye gitmiş olmalı.", engel: "BASKA_MUSTERI" },
      { rol: "Depo", ne: "Geri gelen parçaları okutur → parça karantinaya, olay: müşteri iadesi.", engel: "Sevk edilmemiş parça iade olamaz" },
      { rol: "Kalite", ne: "İade parçaya son kontrolde karar: serbest ya da ret (hurda). Lotun numunesi şikâyet açıkken imha edilemez.", engel: "NUMUNE_DELIL" },
      { rol: "Kalite", ne: "DÖF açar, sorumlu ve termin verir." },
      { rol: "Üretim şefi", ne: "Sorumlu: kök neden + faaliyet yazar, uygular, tamamlandı bildirir.", engel: "Kök nedensiz tamamlanamaz (KOK_NEDEN_YOK)" },
      { rol: "Kalite", ne: "Etkinliği doğrular (sorumlu kendi DÖF'ünü kapatamaz). Etkisizse uygulamaya geri döner.", engel: "Dört göz kuralı" },
      { rol: "Kalite", ne: "Şikâyeti kapatır.", engel: "DÖF açıkken (DOF_ACIK) ya da iade kararı verilmeden (IADE_KARARI_YOK) kapanmaz" },
    ],
  },
  {
    baslik: "5. Kalibrasyon uygun değil",
    aciklama: "Hatalı ölçüm aletiyle verilmiş kararlar geriye dönük bulunur.",
    adimlar: [
      { rol: "Kalite", ne: "Kalibrasyon sonucu: uygun değil (açıklama zorunlu)." },
      { rol: "Sistem", ne: "Alet kullanım dışı olur; son uygun kalibrasyondan beri bu aletle yapılan ölçümler ve iş emirleri listelenir." },
      { rol: "Kalite", ne: "Etkilenen üretimi Geri Çağırma ekranından bloke eder, gerekirse DÖF açar." },
      { rol: "Sistem", ne: "Bu aletle yeni ölçüm kabul edilmez.", engel: "ALET_KULLANIM_DISI" },
    ],
  },
];

function Surec() {
  return (
    <div>
      <PageHeader eyebrow="KYS" title="Süreç Akışları" description="Kim, hangi adımı yapar; bir onay eksikse sistem neyi durdurur. Parantez içindekiler sistemin verdiği hata kodlarıdır." />
      <div className="grid gap-6 p-8 xl:grid-cols-2">
        {AKISLAR.map((a) => (
          <Bolum key={a.baslik} baslik={a.baslik} className={a.adimlar.length > 10 ? "xl:row-span-2" : undefined}>
            <p className="mb-4 text-sm text-tas-500">{a.aciklama}</p>
            <ol className="space-y-1">
              {a.adimlar.map((x, i) => (
                <li key={i}>
                  <div className="flex gap-3">
                    <span className={cn("h-fit w-24 shrink-0 rounded-md px-2 py-1 text-center text-[11px] font-bold", ROL_RENK[x.rol])}>{x.rol}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="text-murekkep">
                        {x.ne} {x.kayit && <span className="ml-1 font-mono text-[11px] font-semibold text-unity">{x.kayit}</span>}
                      </div>
                      {x.engel && (
                        <div className="mt-0.5 flex items-start gap-1 text-[12px] text-unity-koyu">
                          <Lock className="mt-0.5 h-3 w-3 shrink-0" /> {x.engel}
                        </div>
                      )}
                    </div>
                  </div>
                  {i < a.adimlar.length - 1 && <ArrowDown className="my-0.5 ml-10 h-3.5 w-3.5 text-tas-300" />}
                </li>
              ))}
            </ol>
          </Bolum>
        ))}
      </div>
    </div>
  );
}
