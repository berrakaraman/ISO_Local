-- =====================================================================
-- 001 - Cekirdek sema
-- Sartname bolum 10, 13, 15, 16. Her tabloda firma_id var (cok firmali yapi).
-- Fiziksel silme yok: tanimlarda "aktif", kayitlarda "durum = IPTAL".
-- olay ve degisiklik_izi tablolari yalnizca eklemeye aciktir (trigger ile).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Firma ve kullanicilar
-- ---------------------------------------------------------------------
CREATE TABLE firma (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod           text NOT NULL UNIQUE,
  unvan         text NOT NULL,
  saat_dilimi   text NOT NULL DEFAULT 'Europe/Istanbul',
  ayarlar       jsonb NOT NULL DEFAULT '{}'::jsonb,
  olusturma_zamani timestamptz NOT NULL DEFAULT now()
);

-- Web kullanicilari ve kiosk personeli ayni tabloda.
-- Kiosk personelinin sifresi olmayabilir; sicil_no + PIN ile girer.
CREATE TABLE kullanici (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  kullanici_adi text,
  ad_soyad      text NOT NULL,
  sicil_no      text,
  sifre_ozeti   text,
  pin_ozeti     text,
  roller        text[] NOT NULL DEFAULT '{}',
  aktif         boolean NOT NULL DEFAULT true,
  son_giris     timestamptz,
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, kullanici_adi),
  UNIQUE (firma_id, sicil_no)
);

-- ---------------------------------------------------------------------
-- Tanimlar (firma ayarlari)
-- ---------------------------------------------------------------------
CREATE TABLE makine (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  kod       text NOT NULL CHECK (kod ~ '^[A-Z0-9-]+$'),
  ad        text NOT NULL,
  tip       text NOT NULL CHECK (tip IN ('ORGU','EKSTRUZYON','METRAJ','MASURA','DIGER')),
  plan_x    numeric,
  plan_y    numeric,
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

CREATE TABLE malzeme (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  kod       text NOT NULL,
  ad        text NOT NULL,
  olcu_birimi text NOT NULL DEFAULT 'kg',
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

CREATE TABLE tedarikci (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  unvan     text NOT NULL,
  onay_durumu text NOT NULL DEFAULT 'ONAYLI' CHECK (onay_durumu IN ('ONAYLI','SARTLI','ASKIDA')),
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, unvan)
);

CREATE TABLE musteri (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  unvan     text NOT NULL,
  crm_ref   text,
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, unvan)
);

CREATE TABLE urun (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  kod         text NOT NULL,
  ad          text NOT NULL,
  olcu_birimi text NOT NULL DEFAULT 'm',
  kesim_boyu  numeric,              -- varsayilan kesim boyu (m)
  numune_boyu numeric DEFAULT 1,    -- sahit numune boyu (m)
  aktif       boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

-- Recete: urunun metresinde hangi hammaddeden kac gram var (bolum 11)
CREATE TABLE recete (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  urun_id     uuid NOT NULL REFERENCES urun(id),
  malzeme_id  uuid NOT NULL REFERENCES malzeme(id),
  gram_metre  numeric NOT NULL CHECK (gram_metre > 0),
  UNIQUE (urun_id, malzeme_id)
);

-- Kontrol plani karakteristikleri (bolum 9.1)
CREATE TABLE karakteristik (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id    uuid NOT NULL REFERENCES firma(id),
  urun_id     uuid NOT NULL REFERENCES urun(id),
  asama       text NOT NULL CHECK (asama IN ('ILK_PARCA','PROSES','METRAJ','SON_KONTROL')),
  ad          text NOT NULL,
  nominal     numeric,
  alt_sinir   numeric,
  ust_sinir   numeric,
  olcu_birimi text,
  sira        int NOT NULL DEFAULT 0,
  aktif       boolean NOT NULL DEFAULT true
);

CREATE TABLE hata_kodu (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  kod       text NOT NULL,
  aciklama  text NOT NULL,
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

CREATE TABLE depo_yeri (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id  uuid NOT NULL REFERENCES firma(id),
  kod       text NOT NULL CHECK (kod ~ '^[A-Z0-9-]+$'),
  ad        text,
  tip       text NOT NULL DEFAULT 'RAF' CHECK (tip IN ('RAF','KARANTINA','NUMUNE','SEVK')),
  aktif     boolean NOT NULL DEFAULT true,
  UNIQUE (firma_id, kod)
);

-- Numara uretimi icin sayaclar (bolum 10.4). Anahtar ornek: 'FG-2610'
CREATE TABLE sayac (
  firma_id  uuid NOT NULL REFERENCES firma(id),
  anahtar   text NOT NULL,
  son_deger int  NOT NULL DEFAULT 0,
  PRIMARY KEY (firma_id, anahtar)
);

-- ---------------------------------------------------------------------
-- Uretim
-- ---------------------------------------------------------------------
CREATE TABLE is_emri (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id        uuid NOT NULL REFERENCES firma(id),
  no              text NOT NULL,
  urun_id         uuid NOT NULL REFERENCES urun(id),
  makine_id       uuid NOT NULL REFERENCES makine(id),
  hedef_miktar    numeric NOT NULL CHECK (hedef_miktar > 0),
  planlanan_tarih date,
  oncelik         int NOT NULL DEFAULT 3,
  musteri_id      uuid REFERENCES musteri(id),
  siparis_no      text,
  durum           text NOT NULL DEFAULT 'PLANLANDI' CHECK (durum IN
                    ('PLANLANDI','ILK_PARCA_BEKLIYOR','URETIMDE','DURAKLATILDI',
                     'TAMAMLANDI','TAMAMLANDI_FARK','IPTAL')),
  baslangic       timestamptz,
  bitis           timestamptz,
  denge           jsonb,
  aciklama        text,
  olusturan       uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, no)
);
CREATE INDEX ON is_emri (firma_id, makine_id, durum);

-- Lot (parti): hammadde lotu (RM) ve bitmis urun lotu (FG)
CREATE TABLE lot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  no            text NOT NULL,
  tip           text NOT NULL CHECK (tip IN ('RM','FG')),
  malzeme_id    uuid REFERENCES malzeme(id),
  urun_id       uuid REFERENCES urun(id),
  tedarikci_id  uuid REFERENCES tedarikci(id),
  tedarikci_lot text,
  coa_var       boolean,
  is_emri_id    uuid REFERENCES is_emri(id),
  durum         text NOT NULL,
  olusturan     uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, no)
);

-- Birim: etiket yapistirilan her fiziksel parca (bolum 10.2)
CREATE TABLE birim (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id        uuid NOT NULL REFERENCES firma(id),
  barkod          text NOT NULL CHECK (barkod ~ '^[A-Z0-9-]+$'),
  tip             text NOT NULL CHECK (tip IN ('RM','WIP','FG_LOT','FG','KR','NM')),
  lot_id          uuid REFERENCES lot(id),
  malzeme_id      uuid REFERENCES malzeme(id),
  urun_id         uuid REFERENCES urun(id),
  is_emri_id      uuid REFERENCES is_emri(id),
  makine_id       uuid REFERENCES makine(id),
  ilk_miktar      numeric NOT NULL CHECK (ilk_miktar >= 0),
  miktar          numeric NOT NULL CHECK (miktar >= 0),
  olcu_birimi     text NOT NULL,
  durum           text NOT NULL,
  bloke           boolean NOT NULL DEFAULT false,
  yer             text,                 -- 'DEPO:YR-D5-R02', 'HAT:OR03', 'KARANTINA', 'SEVK:SV-...'
  kaynak_birim_id uuid REFERENCES birim(id),
  sira            int,                  -- alt lot / ambalaj sira no
  ek              jsonb NOT NULL DEFAULT '{}'::jsonb,
  olusturan       uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  guncelleme_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, barkod)
);
CREATE INDEX ON birim (firma_id, tip, durum);
CREATE INDEX ON birim (lot_id);
CREATE INDEX ON birim (is_emri_id);

-- Birimler arasi baglar = soy agacinin dallari (bolum 13.3)
CREATE TABLE birim_bagi (
  id          bigserial PRIMARY KEY,
  firma_id    uuid NOT NULL REFERENCES firma(id),
  kaynak_id   uuid NOT NULL REFERENCES birim(id),
  hedef_id    uuid NOT NULL REFERENCES birim(id),
  tip         text NOT NULL CHECK (tip IN
                ('BOLUNDU','SARILDI','TUKETILDI','KESILDI','AYRILDI','YENIDEN_ETIKET','NUMUNE')),
  miktar      numeric,
  zaman       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kaynak_id, hedef_id, tip)
);
CREATE INDEX ON birim_bagi (kaynak_id);
CREATE INDEX ON birim_bagi (hedef_id);

-- Hangi ambalaj hangi zaman araliginda hangi is emrine bagliydi (bolum 7.1)
CREATE TABLE is_emri_baglama (
  id              bigserial PRIMARY KEY,
  firma_id        uuid NOT NULL REFERENCES firma(id),
  is_emri_id      uuid NOT NULL REFERENCES is_emri(id),
  birim_id        uuid NOT NULL REFERENCES birim(id),
  baglama_miktari numeric NOT NULL,
  baglama_zamani  timestamptz NOT NULL DEFAULT now(),
  cikarma_zamani  timestamptz,
  tuketilen       numeric,
  kullanici_id    uuid REFERENCES kullanici(id)
);
CREATE INDEX ON is_emri_baglama (is_emri_id);
CREATE UNIQUE INDEX baglama_tek_aktif ON is_emri_baglama (birim_id) WHERE cikarma_zamani IS NULL;

-- Olcumler (ilk parca, proses, metraj, son kontrol)
CREATE TABLE olcum (
  id               bigserial PRIMARY KEY,
  firma_id         uuid NOT NULL REFERENCES firma(id),
  is_emri_id       uuid REFERENCES is_emri(id),
  birim_id         uuid REFERENCES birim(id),
  karakteristik_id uuid REFERENCES karakteristik(id),
  asama            text NOT NULL,
  deger            numeric,
  sonuc            text NOT NULL CHECK (sonuc IN ('UYGUN','UYGUN_DEGIL')),
  deneme_no        int,
  kullanici_id     uuid REFERENCES kullanici(id),
  zaman            timestamptz NOT NULL DEFAULT now()
);

-- Sevkiyat
CREATE TABLE sevkiyat (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id     uuid NOT NULL REFERENCES firma(id),
  no           text NOT NULL,
  musteri_id   uuid NOT NULL REFERENCES musteri(id),
  urun_id      uuid REFERENCES urun(id),
  siparis_no   text,
  irsaliye_no  text,
  durum        text NOT NULL DEFAULT 'HAZIRLANIYOR' CHECK (durum IN ('HAZIRLANIYOR','SEVK_EDILDI','IPTAL')),
  olusturan    uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  onay_zamani  timestamptz,
  UNIQUE (firma_id, no)
);
CREATE TABLE sevkiyat_satiri (
  id           bigserial PRIMARY KEY,
  firma_id     uuid NOT NULL REFERENCES firma(id),
  sevkiyat_id  uuid NOT NULL REFERENCES sevkiyat(id),
  birim_id     uuid NOT NULL REFERENCES birim(id),
  miktar       numeric NOT NULL,
  zaman        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sevkiyat_id, birim_id)
);

-- Bloke (bolum 12)
CREATE TABLE bloke (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid NOT NULL REFERENCES firma(id),
  neden         text NOT NULL,
  acan          uuid REFERENCES kullanici(id),
  acilma_zamani timestamptz NOT NULL DEFAULT now(),
  kapatan       uuid REFERENCES kullanici(id),
  kapanma_zamani timestamptz
);
CREATE TABLE bloke_birim (
  bloke_id  uuid NOT NULL REFERENCES bloke(id),
  birim_id  uuid NOT NULL REFERENCES birim(id),
  PRIMARY KEY (bloke_id, birim_id)
);

-- Etiket baskilari (yeniden baskilarin izi)
CREATE TABLE etiket_baskisi (
  id           bigserial PRIMARY KEY,
  firma_id     uuid NOT NULL REFERENCES firma(id),
  birim_id     uuid NOT NULL REFERENCES birim(id),
  kopya_no     int NOT NULL,
  neden        text,
  kullanici_id uuid REFERENCES kullanici(id),
  zaman        timestamptz NOT NULL DEFAULT now()
);

-- Entegrasyon kuyrugu (CRM vb. - bolum 17)
CREATE TABLE entegrasyon_kuyrugu (
  id         bigserial PRIMARY KEY,
  firma_id   uuid NOT NULL REFERENCES firma(id),
  hedef      text NOT NULL,
  olay_tipi  text NOT NULL,
  veri       jsonb NOT NULL,
  durum      text NOT NULL DEFAULT 'BEKLIYOR' CHECK (durum IN ('BEKLIYOR','GONDERILDI','HATA')),
  deneme     int NOT NULL DEFAULT 0,
  son_hata   text,
  zaman      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Olay gunlugu ve degisiklik izi (bolum 13.1 ve 16.1) - YALNIZCA EKLEME
-- ---------------------------------------------------------------------
CREATE TABLE olay (
  id             bigserial PRIMARY KEY,
  firma_id       uuid NOT NULL REFERENCES firma(id),
  zaman          timestamptz NOT NULL DEFAULT now(),
  tip            text NOT NULL,
  birim_id       uuid REFERENCES birim(id),
  karsi_birim_id uuid REFERENCES birim(id),
  is_emri_id     uuid REFERENCES is_emri(id),
  miktar         numeric,
  olcu_birimi    text,
  kullanici_id   uuid REFERENCES kullanici(id),
  cihaz          text,
  aciklama       text,
  veri           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON olay (firma_id, zaman DESC);
CREATE INDEX ON olay (birim_id);
CREATE INDEX ON olay (karsi_birim_id);
CREATE INDEX ON olay (is_emri_id);

CREATE TABLE degisiklik_izi (
  id            bigserial PRIMARY KEY,
  firma_id      uuid NOT NULL REFERENCES firma(id),
  tablo         text NOT NULL,
  kayit_id      text NOT NULL,
  alan          text NOT NULL,
  eski_deger    text,
  yeni_deger    text,
  islem         text NOT NULL CHECK (islem IN ('EKLEME','GUNCELLEME','DURUM','IPTAL')),
  kullanici_id  uuid REFERENCES kullanici(id),
  cihaz         text,
  zaman         timestamptz NOT NULL DEFAULT now(),
  gerekce       text,
  onceki_ozet   text,
  ozet          text NOT NULL
);
CREATE INDEX ON degisiklik_izi (firma_id, tablo, kayit_id);

CREATE OR REPLACE FUNCTION yalnizca_ekleme() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% tablosu yalnizca eklemeye aciktir (% yasak)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER olay_degismez BEFORE UPDATE OR DELETE ON olay
  FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
CREATE TRIGGER iz_degismez BEFORE UPDATE OR DELETE ON degisiklik_izi
  FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
CREATE TRIGGER olay_truncate BEFORE TRUNCATE ON olay
  FOR EACH STATEMENT EXECUTE FUNCTION yalnizca_ekleme();
CREATE TRIGGER iz_truncate BEFORE TRUNCATE ON degisiklik_izi
  FOR EACH STATEMENT EXECUTE FUNCTION yalnizca_ekleme();
