import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Table2,
  Menu,
  ChevronLeft,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TABLES } from "@/lib/iso-data";
import { actions, useCurrentUser } from "@/lib/store";

export const Route = createFileRoute("/_panel")({ component: PanelLayout });

function PanelLayout() {
  const me = useCurrentUser();
  const nav = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (!me) nav({ to: "/" });
  }, [me, nav]);
  if (!me) return null;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside
        className={`sticky top-0 flex h-screen flex-col bg-[#0f172a] text-white shadow-xl transition-all duration-300 ease-in-out ${isOpen ? "w-64" : "w-20"}`}
      >
        {/* LOGO ALANI */}
        <div
          className={`flex items-center border-b border-slate-800 p-4 ${isOpen ? "justify-between gap-2" : "justify-center flex-col gap-4 py-6"}`}
        >
          <div
            className={`bg-white rounded flex items-center justify-center overflow-hidden transition-all ${isOpen ? "p-2 h-12 flex-1 mr-1" : "p-1.5 w-10 h-10 shrink-0"}`}
          >
            <img
              src="/Logoo.jpeg"
              alt="Unity Otomasyon"
              className="h-full w-full object-contain"
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronLeft className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto overflow-x-hidden">
          <Link
            to="/panel"
            className={`flex items-center rounded-lg py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-all ${isOpen ? "px-3 gap-3" : "justify-center px-0"}`}
            activeProps={{ className: "bg-slate-800 text-white font-bold" }}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            {isOpen && <span className="whitespace-nowrap">Görevlerim</span>}
          </Link>

          {isOpen && (
            <div className="pt-5 pb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Formlar
            </div>
          )}
          {!isOpen && (
            <div className="my-4 border-t border-slate-800 mx-2"></div>
          )}

          {TABLES.map((t) => (
            <Link
              key={t.slug}
              to={`/tablo/${t.slug}` as any}
              className={`flex items-center rounded-lg py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-all ${isOpen ? "px-3 gap-3" : "justify-center px-0 mt-2"}`}
              activeProps={{ className: "bg-slate-800 text-white font-bold" }}
            >
              <Table2 className="h-5 w-5 shrink-0 text-slate-500" />
              {isOpen && (
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="font-mono text-[11px] text-red-500 font-bold shrink-0">
                    {t.code}
                  </span>
                  <span className="whitespace-nowrap truncate">{t.title}</span>
                </div>
              )}
            </Link>
          ))}

          {isOpen && (
            <div className="pt-6 pb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Sistem Parametreleri
            </div>
          )}
          {!isOpen && (
            <div className="my-4 border-t border-slate-800 mx-2"></div>
          )}

          <Link
            to="/tablo/tanimlar"
            className={`flex items-center rounded-lg py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-all ${isOpen ? "px-3 gap-3" : "justify-center px-0 mt-2"}`}
            activeProps={{ className: "bg-slate-800 text-white font-bold" }}
          >
            <BookOpen className="h-5 w-5 shrink-0 text-red-400" />
            {isOpen && <span className="whitespace-nowrap">Tanımlar</span>}
          </Link>
        </nav>

        <div
          className={`border-t border-slate-800 p-4 flex items-center transition-all ${isOpen ? "justify-between" : "flex-col gap-4 justify-center py-6"}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-xs font-semibold">
              {me.name.charAt(0)}
            </div>
            {isOpen && (
              <div className="overflow-hidden">
                <div className="text-sm font-medium leading-none mb-1 whitespace-nowrap truncate">
                  {me.name.split(" ")[0]}
                </div>
                <div className="text-[10px] text-slate-500 leading-none whitespace-nowrap truncate">
                  {me.role}
                </div>
              </div>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
            onClick={() => {
              actions.logout();
              nav({ to: "/", replace: true });
            }}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
