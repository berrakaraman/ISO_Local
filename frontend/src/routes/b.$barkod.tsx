// Etiketteki QR kodun actigi adres: /b/FG-2610-0001-01
// Telefon kamerasi bu adresi acar; urun hikayesi sayfasina yonlendiririz (giris yoksa once giris).
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/b/$barkod")({ component: QrYonlendir });

function QrYonlendir() {
  const { barkod } = Route.useParams();
  return <Navigate to="/izle/$barkod" params={{ barkod: barkod.toLocaleUpperCase("en") }} replace />;
}
