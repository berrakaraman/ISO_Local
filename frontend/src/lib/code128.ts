// Code 128 barkodu SVG olarak cizer (B kod seti; rakam ciftleri icin C seti).
// Fabrikadaki el terminalleri ve termal yazicilar ayni standardi kullanir.
const DESENLER = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

// Metni Code 128 sembol degerlerine cevirir. Uzun rakam dizilerinde C setine gecer (daha kisa barkod).
function kodla(metin: string): number[] {
  const degerler: number[] = [];
  let set: "B" | "C" | null = null;
  let i = 0;
  while (i < metin.length) {
    const rakamlar = /^\d+/.exec(metin.slice(i))?.[0] ?? "";
    const cSetiKullan = rakamlar.length >= 4 && rakamlar.length % 2 === 0;
    if (cSetiKullan) {
      if (set === null) degerler.push(105);
      else if (set !== "C") degerler.push(99);
      set = "C";
      for (let k = 0; k < rakamlar.length; k += 2) degerler.push(Number(rakamlar.slice(k, k + 2)));
      i += rakamlar.length;
      continue;
    }
    if (set === null) degerler.push(104);
    else if (set !== "B") degerler.push(100);
    set = "B";
    const kod = metin.charCodeAt(i);
    if (kod < 32 || kod > 126) throw new Error("Code 128 B: desteklenmeyen karakter");
    degerler.push(kod - 32);
    i++;
  }
  const kontrol = degerler.reduce((t, d, k) => t + d * (k === 0 ? 1 : k), 0) % 103;
  return [...degerler, kontrol, 106];
}

// Cubuklarin [x, genislik] listesi (modul cinsinden) ve toplam genislik
export function code128(metin: string): { cubuklar: [number, number][]; genislik: number } {
  const cubuklar: [number, number][] = [];
  let x = 10; // sessiz bolge
  for (const d of kodla(metin)) {
    const desen = DESENLER[d];
    for (let k = 0; k < desen.length; k++) {
      const w = Number(desen[k]);
      if (k % 2 === 0) cubuklar.push([x, w]);
      x += w;
    }
  }
  return { cubuklar, genislik: x + 10 };
}
