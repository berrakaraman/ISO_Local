// Unity marka parcalari: logo ve logodaki egik paralel seritler.
import { cn } from "@/lib/utils";

export function UnityLogo({ koyuZemin = false, className }: { koyuZemin?: boolean; className?: string }) {
  return (
    <img
      src={koyuZemin ? "/unity-logo-koyu.png" : "/unity-logo.png"}
      alt="Unity Automation Technology"
      className={cn("h-10 w-auto select-none", className)}
      draggable={false}
    />
  );
}

// Logonun altindaki ve ustundeki gibi, ayni egimde paralel kirmizi seritler.
// kalinliklar: her seridin yuksekligi (px), bosluk: seritler arasi (px)
export function Seritler({
  className,
  kalinliklar = [10, 5],
  bosluk = 5,
  renk = "bg-unity",
}: {
  className?: string;
  kalinliklar?: number[];
  bosluk?: number;
  renk?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none flex flex-col", className)} style={{ gap: bosluk }}>
      {kalinliklar.map((k, i) => (
        <div key={i} className={cn("egik w-full", renk)} style={{ height: k }} />
      ))}
    </div>
  );
}
