import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as panelLayout } from "./routes/_panel";
import { Route as panelDashboard } from "./routes/_panel.panel";
import { Route as pYonetim } from "./routes/_panel.yonetim-paneli";
import { Route as pHammadde } from "./routes/_panel.hammadde";
import { Route as pUretimEmri } from "./routes/_panel.uretim-emri";
import { Route as pUretimLot } from "./routes/_panel.uretim-lot";
import { Route as pKarantina } from "./routes/_panel.karantina-red";
import { Route as pKalite } from "./routes/_panel.kalite-kontrol";
import { Route as pSevkiyat } from "./routes/_panel.sevkiyat";
import { Route as pTanimlar } from "./routes/_panel.tanimlar";

const IndexRoute = indexRoute.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRoute,
} as any);
const PanelRoute = panelLayout.update({
  id: "/_panel",
  getParentRoute: () => rootRoute,
} as any);
const PanelPanelRoute = panelDashboard.update({
  path: "/panel",
  getParentRoute: () => PanelRoute,
} as any);

const children = [
  PanelPanelRoute,
  pYonetim.update({
    path: "/tablo/yonetim-paneli",
    getParentRoute: () => PanelRoute,
  } as any),
  pHammadde.update({
    path: "/tablo/hammadde",
    getParentRoute: () => PanelRoute,
  } as any),
  pUretimEmri.update({
    path: "/tablo/uretim-emri",
    getParentRoute: () => PanelRoute,
  } as any),
  pUretimLot.update({
    path: "/tablo/uretim-lot",
    getParentRoute: () => PanelRoute,
  } as any),
  pKarantina.update({
    path: "/tablo/karantina-red",
    getParentRoute: () => PanelRoute,
  } as any),
  pKalite.update({
    path: "/tablo/kalite-kontrol",
    getParentRoute: () => PanelRoute,
  } as any),
  pSevkiyat.update({
    path: "/tablo/sevkiyat",
    getParentRoute: () => PanelRoute,
  } as any),
  pTanimlar.update({
    path: "/tablo/tanimlar",
    getParentRoute: () => PanelRoute,
  } as any),
];

const PanelRouteWithChildren = PanelRoute._addFileChildren(children);
export const routeTree = rootRoute._addFileChildren([
  IndexRoute,
  PanelRouteWithChildren,
]) as any;

// TypeScript 'never' hatalarını kökünden çözen sihirli tip tanımı:
declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    [key: string]: any;
  }
}
