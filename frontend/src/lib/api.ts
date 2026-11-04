// Backend ile konusan tek yer. Tum istekler /api uzerinden gider
// (Vite gelistirme sunucusu bunlari localhost:5001'e yonlendirir).
import { oturumKapat, oturumOku } from "./oturum";

export class ApiHatasi extends Error {
  durum: number;
  kod: string;
  detay?: unknown;
  constructor(durum: number, kod: string, mesaj: string, detay?: unknown) {
    super(mesaj);
    this.durum = durum;
    this.kod = kod;
    this.detay = detay;
  }
}

type Secenekler = {
  yontem?: "GET" | "POST" | "PATCH";
  govde?: unknown;
  token?: string | null; // verilmezse oturumdaki token kullanilir
  sinyal?: AbortSignal;
};

export async function api<T = any>(yol: string, s: Secenekler = {}): Promise<T> {
  const token = s.token !== undefined ? s.token : oturumOku()?.token;
  let cevap: Response;
  try {
    cevap = await fetch(`/api${yol}`, {
      method: s.yontem || (s.govde ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: s.govde !== undefined ? JSON.stringify(s.govde) : undefined,
      signal: s.sinyal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiHatasi(0, "AG_HATASI", "Sunucuya ulaşılamıyor. Backend çalışıyor mu?");
  }

  const veri = await cevap.json().catch(() => null);
  if (!cevap.ok) {
    const h = veri?.hata || {};
    // Oturumun suresi dolduysa cikis yap (giris sayfasina doner)
    if (cevap.status === 401 && token) oturumKapat();
    throw new ApiHatasi(cevap.status, h.kod || "HATA", h.mesaj || `Beklenmeyen hata (${cevap.status})`, h.detay);
  }
  return veri as T;
}

// Backend mesajlarinin kullaniciya gosterilecek Turkce karsiliklari
const MESAJLAR: Record<string, string> = {
  AG_HATASI: "Sunucuya ulaşılamıyor. Backend'in çalıştığından emin olun.",
  COK_DENEME: "Çok fazla hatalı deneme yapıldı. Lütfen 5 dakika sonra tekrar deneyin.",
  YETKI_YOK: "Bu işlem için yetkiniz yok.",
  SUNUCU_HATASI: "Sunucuda beklenmeyen bir hata oluştu.",
};

export function hataMesaji(e: unknown, varsayilan = "Bir hata oluştu."): string {
  if (e instanceof ApiHatasi) return MESAJLAR[e.kod] || e.message || varsayilan;
  return varsayilan;
}
