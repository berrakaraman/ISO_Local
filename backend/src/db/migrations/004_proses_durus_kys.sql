-- =====================================================================
-- 004 - Proses kontrolu, duruslar, makine ayari ve KYS modulleri
--
--  1) Malzeme kurutma kosullari (PA granul gibi nem ceken malzemeler)
--  2) Makine ayar kaydi (ilk calistirma + kurutma). Ayar kaydedilmeden ilk parca onayi verilemez.
--  3) Durus kayitlari: neden kodu, baslangic, bitis, sure. Ayni makinede tek acik durus.
--  4) Olcum aleti (kalibrasyon) ve kalibrasyon kayitlari. Olcume alet baglanabilir.
--  5) Bakim kayitlari (planli / ariza). Ariza bakimi durus acar, bakim kapaninca durus kapanir.
--  6) Egitim kayitlari
--  7) Tedarikci degerlendirme (puan -> tedarikci onay durumu)
--  8) Musteri sikayeti ve duzeltici faaliyet (DOF)
-- Hicbir tablodan kayit silinmez (002'deki silme korumasi bu tablolara da eklenir).
-- =====================================================================

-- 1) Kurutma kosullari
ALTER TABLE malzeme
  ADD COLUMN kurutma_gerekli     boolean NOT NULL DEFAULT false,
  ADD COLUMN kurutma_sicaklik_min numeric,   -- en az (°C)
  ADD COLUMN kurutma_sure_min     numeric,   -- en az (saat)
  ADD COLUMN kurutma_nem_max      numeric;   -- en fazla (%)

-- 2) Makine ayar kaydi
ALTER TABLE is_emri ADD COLUMN ayar_bekliyor boolean NOT NULL DEFAULT false;

CREATE TABLE makine_ayar (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id     uuid NOT NULL REFERENCES firma(id),
  is_emri_id   uuid NOT NULL REFERENCES is_emri(id),
  makine_id    uuid NOT NULL REFERENCES makine(id),
  parametreler jsonb NOT NULL,          -- [{ ad, deger, birim }]
  kurutma      jsonb,                   -- { sicaklik, sureSaat, nemYuzde, uygun }
  kaydeden     uuid REFERENCES kullanici(id),
  zaman        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON makine_ayar (is_emri_id);

-- 3) Duruslar
CREATE TABLE durus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  makine_id   uuid NOT NULL REFERENCES makine(id),
  is_emri_id  uuid REFERENCES is_emri(id),
  neden       text NOT NULL CHECK (neden IN
                ('ARIZA','AYAR_DEGISIMI','MALZEME_BEKLEME','KALITE','PLANLI_BAKIM','PERSONEL','MOLA','DIGER')),
  aciklama    text,
  baslangic   timestamptz NOT NULL DEFAULT now(),
  bitis       timestamptz,
  sure_dk     numeric,
  acan        uuid REFERENCES kullanici(id),
  kapatan     uuid REFERENCES kullanici(id),
  CHECK (bitis IS NULL OR bitis >= baslangic)
);
CREATE INDEX ON durus (firma_id, makine_id, baslangic DESC);
CREATE UNIQUE INDEX durus_tek_acik ON durus (makine_id) WHERE bitis IS NULL;

-- 4) Olcum aletleri ve kalibrasyon
CREATE TABLE olcum_aleti (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id           uuid NOT NULL REFERENCES firma(id),
  kod                text NOT NULL CHECK (kod ~ '^[A-Z0-9-]+$'),
  ad                 text NOT NULL,
  konum              text,
  periyot_ay         int NOT NULL CHECK (periyot_ay > 0),
  son_kalibrasyon    date,
  sonraki_kalibrasyon date,
  durum              text NOT NULL DEFAULT 'KULLANIMDA' CHECK (durum IN ('KULLANIMDA','KULLANIM_DISI')),
  aktif              boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

CREATE TABLE kalibrasyon (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  alet_id     uuid NOT NULL REFERENCES olcum_aleti(id),
  tarih       date NOT NULL,
  sonuc       text NOT NULL CHECK (sonuc IN ('UYGUN','UYGUN_DEGIL')),
  sertifika_no text,
  yapan       text,
  aciklama    text,
  kaydeden    uuid REFERENCES kullanici(id),
  zaman       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE olcum ADD COLUMN alet_id uuid REFERENCES olcum_aleti(id);

-- 5) Bakim
CREATE TABLE bakim (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  no          text NOT NULL,
  makine_id   uuid NOT NULL REFERENCES makine(id),
  tur         text NOT NULL CHECK (tur IN ('PLANLI','ARIZA')),
  plan_tarihi date,
  ariza       text,
  yapilan     text,
  durus_id    uuid REFERENCES durus(id),
  durum       text NOT NULL DEFAULT 'ACIK' CHECK (durum IN ('ACIK','KAPANDI')),
  acan        uuid REFERENCES kullanici(id),
  acilma_zamani timestamptz NOT NULL DEFAULT now(),
  kapatan     uuid REFERENCES kullanici(id),
  kapanma_zamani timestamptz,
  UNIQUE (firma_id, no)
);

-- 6) Egitim
CREATE TABLE egitim (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id     uuid NOT NULL REFERENCES firma(id),
  kullanici_id uuid NOT NULL REFERENCES kullanici(id),
  konu         text NOT NULL,
  tarih        date NOT NULL,
  egitmen      text,
  sure_saat    numeric CHECK (sure_saat IS NULL OR sure_saat > 0),
  sonuc        text NOT NULL CHECK (sonuc IN ('BASARILI','TEKRAR_GEREKLI')),
  gecerlilik_bitis date,
  kaydeden     uuid REFERENCES kullanici(id),
  zaman        timestamptz NOT NULL DEFAULT now(),
  CHECK (gecerlilik_bitis IS NULL OR gecerlilik_bitis >= tarih)
);

-- 7) Tedarikci degerlendirme
CREATE TABLE tedarikci_degerlendirme (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  tedarikci_id  uuid NOT NULL REFERENCES tedarikci(id),
  donem         text NOT NULL,                 -- ornek: 2026-Q3
  lot_sayisi    int NOT NULL,
  kabul_lot     int NOT NULL,
  kalite_puani  numeric NOT NULL CHECK (kalite_puani BETWEEN 0 AND 100),
  teslimat_puani numeric NOT NULL CHECK (teslimat_puani BETWEEN 0 AND 100),
  belge_puani   numeric NOT NULL CHECK (belge_puani BETWEEN 0 AND 100),
  toplam_puan   numeric NOT NULL,
  sonuc         text NOT NULL CHECK (sonuc IN ('ONAYLI','SARTLI','ASKIDA')),
  aciklama      text,
  kaydeden      uuid REFERENCES kullanici(id),
  zaman         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tedarikci_id, donem)
);

-- 8) Sikayet ve DOF
CREATE TABLE dof (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  no            text NOT NULL,
  kaynak        text NOT NULL CHECK (kaynak IN ('SIKAYET','IC_DENETIM','PROSES','TEDARIKCI','DIGER')),
  kaynak_no     text,
  problem       text NOT NULL,
  kok_neden     text,
  faaliyet      text,
  sorumlu       uuid NOT NULL REFERENCES kullanici(id),
  termin        date NOT NULL,
  durum         text NOT NULL DEFAULT 'ACIK' CHECK (durum IN ('ACIK','UYGULAMADA','DOGRULAMA_BEKLIYOR','KAPANDI')),
  etkinlik_notu text,
  olusturan     uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  tamamlama_zamani timestamptz,
  kapatan       uuid REFERENCES kullanici(id),
  kapanma_zamani timestamptz,
  UNIQUE (firma_id, no)
);

CREATE TABLE sikayet (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  no            text NOT NULL,
  musteri_id    uuid NOT NULL REFERENCES musteri(id),
  sevkiyat_id   uuid REFERENCES sevkiyat(id),
  lot_id        uuid REFERENCES lot(id),
  konu          text NOT NULL,
  aciklama      text,
  durum         text NOT NULL DEFAULT 'ACIK' CHECK (durum IN ('ACIK','INCELEMEDE','KAPANDI')),
  dof_id        uuid REFERENCES dof(id),
  kapanis_notu  text,
  olusturan     uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  kapatan       uuid REFERENCES kullanici(id),
  kapanma_zamani timestamptz,
  UNIQUE (firma_id, no)
);

-- Silme korumasi yeni tablolara da
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'makine_ayar','durus','olcum_aleti','kalibrasyon','bakim','egitim','tedarikci_degerlendirme','dof','sikayet'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION silme_yasak()', t || '_silinemez', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION silme_yasak()', t || '_bosaltilamaz', t);
  END LOOP;
END $$;

-- Kalibrasyon ve egitim kayitlari sonradan degistirilemez (yanlissa yeni kayit girilir)
CREATE TRIGGER kalibrasyon_degismez BEFORE UPDATE ON kalibrasyon FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
CREATE TRIGGER egitim_degismez BEFORE UPDATE ON egitim FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
CREATE TRIGGER makine_ayar_degismez BEFORE UPDATE ON makine_ayar FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
