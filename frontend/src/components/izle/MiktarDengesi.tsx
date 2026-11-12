// Miktar dengesi: sayilarin hepsi backend'in tek hesabindan gelir (GET /izlenebilirlik/:barkod/ozet, services/hikaye.js).
// Ekran hesap yapmaz; boylece akis diyagrami, ozet ve bu sekme ayni sayiyi gosterir.
//   1) Bu top ne oldu: giris (top + makine basinda ayrilan karantina) = dagilim, renkli cubuk
//   2) Parca parca: her makaranin basina gelenler ve su anki hali
//   3) Bu topu ureten is emri: hangi bobinden ne kadar kullanildi, receteye gore ne cikmaliydi
//   4) Hammadde partisinin tamami: bobin bobin (partinin diger islere giden kismi da gorunur, ayri baslikla)
import { CheckCircle2, CornerDownRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { durumAdi, sayi, tr } from "@/lib/sozluk";

type Dilim = { ad: string; deger: number; renk: string; aciklama?: string };

function Cubuk({ dilimler, toplam, birim }: { dilimler: Dilim[]; toplam: number; birim: string }) {
  const gorunen = dilimler.filter((d) => d.deger > 0.0001);
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg bg-tas-100">
        {gorunen.map((d) => (
          <div
            key={d.ad}
            className={cn("h-full border-r-2 border-white last:border-r-0", d.renk)}
            style={{ width: `${Math.max(0.8, (d.deger / (toplam || 1)) * 100)}%` }}
            title={`${d.ad}: ${sayi(d.deger)} ${birim}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {gorunen.map((d) => (
          <li key={d.ad} className="flex items-start gap-2.5 text-sm">
            <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-sm", d.renk)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-tas-600">{d.ad}</span>
                <span className="sayi whitespace-nowrap font-semibold text-murekkep">
                  {sayi(d.deger)} {birim}
                </span>
              </span>
              {d.aciklama && <span className="block text-[11px] leading-snug text-tas-400">{d.aciklama}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kart({ ust, baslik, alt, children }: { ust: string; baslik: string; alt?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-tas-200 bg-white p-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-unity">{ust}</div>
      <h3 className="mt-0.5 font-mono text-xl font-bold text-murekkep">{baslik}</h3>
      {alt && <p className="mt-0.5 text-sm text-tas-500">{alt}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Kontrol({ tutuyor, metin }: { tutuyor: boolean; metin: string }) {
  return (
    <div className={cn("mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs", tutuyor ? "bg-uygun-acik text-uygun" : "bg-unity-acik text-unity-koyu")}>
      {tutuyor ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
      {metin}
    </div>
  );
}

function Barkod({ b, onBarkod }: { b: string; onBarkod?: (b: string) => void }) {
  return (
    <button onClick={() => onBarkod?.(b)} className="font-mono text-xs font-semibold text-murekkep hover:text-unity">
      {b}
    </button>
  );
}

// 1-3: uretim lotu (top)
export function UretimLotuOzeti({ u, onBarkod }: { u: any; onBarkod?: (b: string) => void }) {
  const d = u.denge;
  const g = d.dagilim;
  const b = u.birim || "m";
  const hurdaAciklama = [
    d.kesimFiresi ? `${sayi(d.kesimFiresi)} kesim firesi` : "",
    d.ret ? `${sayi(d.ret)} reddedilen makara` : "",
    d.topHurda ? `${sayi(d.topHurda)} top hurdası` : "",
    d.karantinaHurda ? `${sayi(d.karantinaHurda)} karantinadan hurdaya` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const dilimler: Dilim[] = [
    { ad: "Müşteriye gitti", deger: d.sevkEdilen, renk: "bg-violet-600" },
    { ad: "Depoda, kullanılabilir", deger: d.stokta, renk: "bg-uygun" },
    { ad: "Sevkiyata ayrıldı (henüz gönderilmedi)", deger: d.sevkeAyrilan || 0, renk: "bg-violet-300" },
    { ad: "Depoda ama bloke (sevk edilemez)", deger: d.blokeMiktar, renk: "bg-dikkat" },
    { ad: "Son kontrol bekliyor", deger: g.kaliteBekleyen, renk: "bg-sky-600" },
    { ad: "Karantinada (kalite kararı bekliyor)", deger: g.parcaKarantinada + g.karantinaBekleyen, renk: "bg-amber-300" },
    { ad: "Şahit numune (arşivde)", deger: g.numune, renk: "bg-tas-400" },
    { ad: "Henüz kesilmedi", deger: g.kesilmemis, renk: "bg-murekkep" },
    { ad: "Hurda", deger: g.hurda, renk: "bg-unity", aciklama: hurdaAciklama },
  ];
  const ie = u.isEmri;
  const ied = ie?.denge;
  const yapraklar = u.parcalar as any[];
  // Kok parcalar: topun kesiminden cikanlar. Karantinadan (KR) gelen parcalar kendi karantina satirinin altinda gosterilir.
  const krBarkodlari = new Set((u.karantina as any[]).map((k) => k.barkod));
  const kok = yapraklar.filter((p) => !p.kaynak || (!krBarkodlari.has(p.kaynak) && !yapraklar.some((y) => y.barkod === p.kaynak)));
  const cocuklari = (x: string) => yapraklar.filter((p) => p.kaynak === x);

  return (
    <div className="space-y-5">
      <Kart
        ust="Bu top · ne oldu?"
        baslik={u.topBarkod}
        alt={`${tr(u.urun)} · ${sayi(d.topMetraji)} ${b} top${d.karantina ? ` + top bitmeden makine başında ayrılan ${sayi(d.karantina)} ${b} karantina = ${sayi(d.toplam)} ${b}` : ""}`}
      >
        <Cubuk dilimler={dilimler} toplam={d.dagilimToplam || d.toplam} birim={b} />
        <Kontrol
          tutuyor={d.tutuyor}
          metin={
            d.tutuyor
              ? `Denge tutuyor: giren ${sayi(d.toplam)} ${b}${d.olcumFazlasi ? ` (+ kesimde ${sayi(d.olcumFazlasi)} ${b} ölçüm farkı)` : ""} = yukarıdaki dağılımın toplamı ${sayi(d.dagilimToplam)} ${b}`
              : `Denge tutmuyor: ${sayi(d.fark)} ${b} fark var`
          }
        />
      </Kart>

      <Kart ust="Parça parça · her makaranın başına gelenler" baslik={`${kok.length + u.karantina.length + u.numune.length} kayıt`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-tas-200 text-left text-[11px] uppercase tracking-wider text-tas-400">
                <th className="py-2 pr-3 font-semibold">Barkod</th>
                <th className="py-2 pr-3 text-right font-semibold">Metre</th>
                <th className="py-2 pr-3 font-semibold">Şu an</th>
                <th className="py-2 font-semibold">Başına gelenler</th>
              </tr>
            </thead>
            <tbody>
              {kok.map((p) => (
                <ParcaSatirlari key={p.barkod} p={p} cocuklari={cocuklari} b={b} onBarkod={onBarkod} />
              ))}
              {u.karantina.map((k: any) => (
                <KarantinaSatiri key={k.barkod} k={k} b={b} onBarkod={onBarkod}>
                  {cocuklari(k.barkod).map((c) => (
                    <ParcaSatirlari key={c.barkod} p={c} cocuklari={cocuklari} b={b} onBarkod={onBarkod} girinti={1} />
                  ))}
                </KarantinaSatiri>
              ))}
              {u.numune.map((n: any) => (
                <tr key={n.barkod} className="border-b border-tas-100 last:border-0">
                  <td className="py-2.5 pr-3">
                    <Barkod b={n.barkod} onBarkod={onBarkod} />
                  </td>
                  <td className="sayi py-2.5 pr-3 text-right">
                    {sayi(n.metre)} {b}
                  </td>
                  <td className="py-2.5 pr-3 text-tas-600">Şahit numune, arşivde{n.yer ? ` (${n.yer})` : ""}</td>
                  <td className="py-2.5 text-xs text-tas-500">Topun kendisinden alındı, topun metresinden düştü</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kart>

      {ie && (
        <Kart
          ust="Bu topu üreten iş emri"
          baslik={ie.no}
          alt={`${ie.makine}${ie.operatorler ? ` · ${tr(ie.operatorler)}` : ""}${ie.musteri ? ` · ${tr(ie.musteri)}` : ""} · hedef ${sayi(ie.hedef)} ${b} · ${durumAdi(ie.durum)}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-tas-200 text-left text-[11px] uppercase tracking-wider text-tas-400">
                  <th className="py-2 pr-3 font-semibold">Makineye takılan bobin</th>
                  <th className="py-2 pr-3 font-semibold">Tedarikçi partisi</th>
                  <th className="py-2 pr-3 text-right font-semibold">Takılan</th>
                  <th className="py-2 pr-3 text-right font-semibold">Depoya dönen</th>
                  <th className="py-2 text-right font-semibold">Bu işte kullanılan</th>
                </tr>
              </thead>
              <tbody>
                {ie.bobinler.map((x: any) => (
                  <tr key={x.barkod} className="border-b border-tas-100 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Barkod b={x.barkod} onBarkod={onBarkod} />
                      <span className="ml-2 text-[11px] text-tas-400">{x.malzeme}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-tas-600">
                      {tr(x.tedarikci)} · {x.tedarikciLot || "-"}
                    </td>
                    <td className="sayi py-2.5 pr-3 text-right">
                      {sayi(x.takilan)} {x.birim}
                    </td>
                    <td className="sayi py-2.5 pr-3 text-right">{x.iade === null ? "—" : `${sayi(x.iade)} ${x.birim}`}</td>
                    <td className="sayi py-2.5 text-right font-semibold">{x.kullanilan === null ? "makinede" : `${sayi(x.kullanilan)} ${x.birim}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ied ? (
            <div className="mt-4 space-y-1 rounded-lg bg-tas-50 px-4 py-3 text-sm text-tas-600 ring-1 ring-tas-100">
              {(ied.kalemler || []).map((k: any) => (
                <div key={k.malzeme}>
                  {k.malzeme}: {sayi(k.tuketilenKg, 3)} kg kullanıldı ÷ reçetede {k.gramMetre} g/m = <b className="text-murekkep">{sayi(k.beklenenMetraj)} {b} çıkmalıydı</b>
                </div>
              ))}
              <div>
                Çıkan: {ie.ciktilar.map((x: any) => `${x.barkod} ${sayi(x.metre)} ${b}${x.tip === "KR" ? " (karantina)" : ""}`).join(" + ")} ={" "}
                <b className="text-murekkep">
                  {sayi(ied.uretilenToplam)} {b}
                </b>
              </div>
              <div className={cn("font-semibold", ied.toleransAsildi ? "text-unity" : "text-uygun")}>
                Fark: {sayi(ied.fark)} {b} (%{sayi(ied.farkYuzde)}) · tolerans %{sayi(ied.toleransYuzde)}
                {ied.toleransAsildi ? " · tolerans aşıldı, şef açıklaması gerekti" : " · tolerans içinde"}
              </div>
              {ied.farkAciklamasi && <div className="text-tas-500">Şefin açıklaması: “{tr(ied.farkAciklamasi)}”</div>}
            </div>
          ) : (
            <p className="mt-4 text-sm text-tas-400">İş emri bitmediği için malzeme dengesi henüz hesaplanmadı.</p>
          )}
        </Kart>
      )}
    </div>
  );
}

function KarantinaSatiri({ k, b, onBarkod, children }: { k: any; b: string; onBarkod?: (b: string) => void; children?: React.ReactNode }) {
  return (
    <>
      <tr className="border-b border-tas-100 bg-amber-50/40 last:border-0">
        <td className="py-2.5 pr-3">
          <Barkod b={k.barkod} onBarkod={onBarkod} />
          <div className="text-[11px] text-tas-400">
            makine başında ayrıldı · {k.hataKodu} {tr(k.neden)}
          </div>
        </td>
        <td className="sayi py-2.5 pr-3 text-right">
          {sayi(k.metre)} {b}
        </td>
        <td className="py-2.5 pr-3 text-tas-600">{k.simdi || durumAdi(k.durum)}</td>
        <td className="py-2.5 text-xs text-tas-500">{k.ozet || "—"}</td>
      </tr>
      {children}
    </>
  );
}

function ParcaSatirlari({ p, cocuklari, b, onBarkod, girinti = 0 }: { p: any; cocuklari: (x: string) => any[]; b: string; onBarkod?: (b: string) => void; girinti?: number }) {
  const alt = cocuklari(p.barkod);
  return (
    <>
      <tr className={cn("border-b border-tas-100 last:border-0", p.durum === "BOLUNDU" && "text-tas-400")}>
        <td className="py-2.5 pr-3" style={{ paddingLeft: girinti * 18 }}>
          <span className="flex items-center gap-1">
            {girinti > 0 && <CornerDownRight className="h-3 w-3 text-tas-400" />}
            <Barkod b={p.barkod} onBarkod={onBarkod} />
            {p.bloke && <span className="rounded bg-dikkat px-1 text-[9px] font-bold text-white">BLOKE</span>}
          </span>
        </td>
        <td className="sayi py-2.5 pr-3 text-right">
          {sayi(p.metre)} {b}
        </td>
        <td className="py-2.5 pr-3 text-tas-600">{p.simdi || durumAdi(p.durum)}</td>
        <td className="py-2.5 text-xs text-tas-500">{p.ozet || "—"}</td>
      </tr>
      {alt.map((c) => (
        <ParcaSatirlari key={c.barkod} p={c} cocuklari={cocuklari} b={b} onBarkod={onBarkod} girinti={girinti + 1} />
      ))}
    </>
  );
}

// 4: hammadde partisi, bobin bobin
export function HammaddePartisi({ h, kaynakOlarak, onBarkod }: { h: any; kaynakOlarak?: boolean; onBarkod?: (b: string) => void }) {
  const br = h.birim || "kg";
  return (
    <Kart
      ust={kaynakOlarak ? "Hammadde partisinin tamamı · bu topa giden kısmı yukarıdaki iş emri tablosunda" : "Hammadde partisi · bobin bobin ne oldu?"}
      baslik={h.lotNo}
      alt={`${h.malzeme} · ${tr(h.tedarikci) || "-"} (parti ${h.tedarikciLot || "-"}) · ${durumAdi(h.durum)}`}
    >
      <div className="mb-4 space-y-1 text-sm text-tas-600">
        {h.cumleler.map((c: string) => (
          <p key={c}>{c}</p>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-tas-200 text-left text-[11px] uppercase tracking-wider text-tas-400">
              <th className="py-2 pr-3 font-semibold">Ambalaj</th>
              <th className="py-2 pr-3 text-right font-semibold">Geldi</th>
              <th className="py-2 pr-3 font-semibold">Hangi işte kullanıldı</th>
              <th className="py-2 pr-3 text-right font-semibold">Kullanılan</th>
              <th className="py-2 pr-3 text-right font-semibold">Hurda</th>
              <th className="py-2 pr-3 text-right font-semibold">Kalan</th>
              <th className="py-2 font-semibold">Şu an</th>
            </tr>
          </thead>
          <tbody>
            {h.bobinler.map((x: any) => (
              <tr key={x.barkod} className="border-b border-tas-100 last:border-0">
                <td className="py-2.5 pr-3" style={{ paddingLeft: x.kaynak ? 18 : 0 }}>
                  <span className="flex items-center gap-1">
                    {x.kaynak && <CornerDownRight className="h-3 w-3 text-tas-400" />}
                    <Barkod b={x.barkod} onBarkod={onBarkod} />
                  </span>
                  {x.kaynak && <div className="text-[11px] text-tas-400">{x.kaynak} ambalajından ayrıldı</div>}
                  {x.ayrilan.length > 0 && (
                    <div className="text-[11px] text-tas-400">{x.ayrilan.map((y: any) => `${sayi(y.miktar)} ${br} → ${y.barkod}`).join(", ")}</div>
                  )}
                </td>
                <td className="sayi py-2.5 pr-3 text-right">
                  {sayi(x.ilk)} {br}
                </td>
                <td className="py-2.5 pr-3 text-xs text-tas-600">
                  {x.isler.length ? x.isler.map((y: any) => `${y.isEmriNo} (${y.makine})`).join(", ") : "—"}
                </td>
                <td className="sayi py-2.5 pr-3 text-right">{x.kullanilan ? `${sayi(x.kullanilan)} ${br}` : "—"}</td>
                <td className="sayi py-2.5 pr-3 text-right">{x.hurda ? `${sayi(x.hurda)} ${br}` : "—"}</td>
                <td className="sayi py-2.5 pr-3 text-right">{x.kalan ? `${sayi(x.kalan)} ${br}` : "—"}</td>
                <td className="py-2.5 text-xs text-tas-600">{x.simdi || durumAdi(x.durum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Kontrol
        tutuyor={h.tutuyor}
        metin={
          h.tutuyor
            ? `Denge tutuyor: gelen ${sayi(h.giris)} ${br} = kullanılan ${sayi(h.kullanilan)} + kalan ${sayi(h.kalan)}${h.hurda ? ` + hurda ${sayi(h.hurda)}` : ""} ${br}`
            : "Denge tutmuyor: kayıtları kontrol edin"
        }
      />
    </Kart>
  );
}

// Sayfanin ustundeki duz cumleli ozet
export function HikayeOzeti({ ozet, onBarkod }: { ozet: any; onBarkod?: (b: string) => void }) {
  if (!ozet) return null;
  const u = ozet.uretimLotlari?.[0];
  const h = !u ? ozet.hammaddeLotlari?.[0] : null;
  const odak = ozet.odak;
  const parcaMi = odak && ["FG", "KR", "RM"].includes(odak.tip);
  const cumleler: string[] = u ? u.cumleler : h ? h.cumleler : [];
  if (!cumleler.length && !parcaMi) return null;
  return (
    <section className="rounded-2xl border border-tas-200 bg-white p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-unity">Kısaca ne oldu?</div>
      {parcaMi && odak.ozet && (
        <div className="mt-2 rounded-lg bg-tas-50 px-4 py-3 ring-1 ring-tas-100">
          <div className="text-sm text-tas-500">
            <button onClick={() => onBarkod?.(odak.barkod)} className="font-mono font-semibold text-murekkep">
              {odak.barkod}
            </button>{" "}
            ({sayi(odak.metre)} {odak.birim}) sırasıyla:
          </div>
          <div className="mt-1 text-[15px] font-semibold text-murekkep">{odak.ozet}</div>
          {odak.simdi && <div className="mt-1 text-sm text-tas-600">Şu an: {odak.simdi}</div>}
        </div>
      )}
      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-tas-700">
        {cumleler.map((c) => (
          <li key={c} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-unity" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
