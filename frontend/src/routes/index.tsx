import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, useCurrentUser } from "@/lib/store";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: LoginPage });

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();
  const me = useCurrentUser();

  useEffect(() => {
    if (me) nav({ to: "/panel", replace: true });
  }, [me, nav]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const success = actions.login(username, password);
    if (success) {
      toast.success("Giriş başarılı, yönlendiriliyor...");
      nav({ to: "/panel", replace: true });
    } else {
      toast.error("Hatalı kullanıcı adı veya şifre!");
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-slate-50 font-sans">
      {/* SOL TARAF - KOYU GRID KURUMSAL ALAN */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0b1329] text-white p-12 flex-col justify-between relative overflow-hidden">
        {/* Arka plan grid deseni */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative z-10 flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl w-fit border border-white/10">
          <div className="bg-white px-3 py-1.5 rounded h-10 flex items-center justify-center">
            <img
              src="/Logoo.jpeg"
              alt="Unity Otomasyon"
              className="h-full object-contain"
            />
          </div>
          <div>
            <div className="text-xs font-bold tracking-wider text-slate-300">
              LotTrace QMS
            </div>
            <div className="text-[10px] text-slate-400">
              ISO 9001 Üretim İzlenebilirlik
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg my-auto">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight mb-6 text-white">
            Hammaddeden sevkiyata, her lotun izi tek yerde.
          </h1>
          <p className="text-slate-400 text-base leading-relaxed mb-8">
            Üretim emirleri, kalite kontrolleri ve karantina kararları — atanan
            sorumluların onayıyla kayıt altında.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="text-xs font-medium bg-slate-800/80 border border-slate-700/80 px-3.5 py-2 rounded-lg text-slate-300">
              F-01 Hammadde
            </span>
            <span className="text-xs font-medium bg-slate-800/80 border border-slate-700/80 px-3.5 py-2 rounded-lg text-slate-300">
              F-03 Üretim Lot
            </span>
            <span className="text-xs font-medium bg-slate-800/80 border border-slate-700/80 px-3.5 py-2 rounded-lg text-slate-300">
              F-06 Sevkiyat
            </span>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-red-500" />
          <span>
            Tüm onay ve red işlemleri kim/ne zaman bilgisiyle saklanır.
          </span>
        </div>
      </div>

      {/* SAĞ TARAF - GİRİŞ FORMU */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="lg:hidden bg-slate-900 p-4 rounded-xl mb-6 flex items-center justify-center border border-slate-800">
              <img
                src="/Logoo.jpeg"
                alt="Unity Otomasyon"
                className="h-10 object-contain bg-white px-2 rounded"
              />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Sisteme giriş
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Kullanıcı adınız ve şifrenizle devam edin.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Kullanıcı adı
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Örn: berra"
                required
                className="h-11 bg-slate-50 border-slate-200 focus-visible:ring-red-500 text-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Şifre
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                required
                className="h-11 bg-slate-50 border-slate-200 focus-visible:ring-red-500 text-slate-800"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-[#0b1329] hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              Giriş yap <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Demo Hesaplar Kartı */}
          <div className="pt-6 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 mb-3">
              Demo hesaplar (şifre: 1234)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                onClick={() => {
                  setUsername("berra");
                  setPassword("1234");
                }}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-red-500 hover:bg-red-50/30 cursor-pointer transition-all"
              >
                <div className="font-bold text-slate-700">berra</div>
                <div className="text-[10px] text-slate-400">
                  Kalite Sorumlusu
                </div>
              </div>
              <div
                onClick={() => {
                  setUsername("ahmet");
                  setPassword("1234");
                }}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-red-500 hover:bg-red-50/30 cursor-pointer transition-all"
              >
                <div className="font-bold text-slate-700">ahmet</div>
                <div className="text-[10px] text-slate-400">Operatör</div>
              </div>
              <div
                onClick={() => {
                  setUsername("mehmet");
                  setPassword("1234");
                }}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-red-500 hover:bg-red-50/30 cursor-pointer transition-all"
              >
                <div className="font-bold text-slate-700">mehmet</div>
                <div className="text-[10px] text-slate-400">
                  Üretim Sorumlusu
                </div>
              </div>
              <div
                onClick={() => {
                  setUsername("ayse");
                  setPassword("1234");
                }}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-red-500 hover:bg-red-50/30 cursor-pointer transition-all"
              >
                <div className="font-bold text-slate-700">ayse</div>
                <div className="text-[10px] text-slate-400">Depo Sorumlusu</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
