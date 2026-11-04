// Tanimlar (secim listeleri) tek sorguyla: urunler, makineler, musteriler, hata kodlari, depo yerleri...
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Tanimlar = {
  urunler: { id: string; kod: string; ad: string; olcuBirimi: string; kesimBoyu: number | null }[];
  makineler: { id: string; kod: string; ad: string; tip: string }[];
  malzemeler: { id: string; kod: string; ad: string; olcuBirimi: string }[];
  musteriler: { id: string; unvan: string }[];
  tedarikciler: { id: string; unvan: string; onayDurumu: string }[];
  "hata-kodlari": { kod: string; aciklama: string }[];
  "depo-yerleri": { kod: string; ad: string | null; tip: string }[];
};

export const useTanimlar = () => useQuery({ queryKey: ["tanimlar"], queryFn: () => api<Tanimlar>("/tanimlar") });
