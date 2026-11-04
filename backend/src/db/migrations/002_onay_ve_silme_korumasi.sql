-- =====================================================================
-- 002 - Onay akisi ve silme korumasi
--
-- 1) onay: formlardaki "Sorumlu / Onay" akisi. Her kayit bir kisiye atanir;
--    durum Bekliyor / Askida / Onaylandi / Reddedildi. Kim, ne zaman, hangi notla
--    karar verdi saklanir. Her degisiklik degisiklik_izi'ne de yazilir.
-- 2) Hammadde lotunda iptal bilgisi: kim, ne zaman, hangi gerekceyle.
-- 3) Sevkiyattan cikarilan satir artik silinmez; "cikarildi" olarak isaretlenir.
-- 4) SILME KORUMASI: uygulama hicbir tablodan kayit silemez.
--    Kayitlar pasife alinir (aktif = false) ya da iptal edilir (durum = IPTAL).
--    Zorunlu bir durumda yalnizca veritabani yoneticisi terminalden silebilir:
--      SET iso.silme_izni = 'evet';  DELETE FROM ...;
--    (olay ve degisiklik_izi bu izinle de silinemez; onlar hic degismez.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Onay akisi
-- ---------------------------------------------------------------------
CREATE TABLE onay (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id         uuid NOT NULL REFERENCES firma(id),
  kayit_turu       text NOT NULL CHECK (kayit_turu IN
                     ('HAMMADDE','IS_EMRI','URETIM_LOT','KARANTINA','KALITE','SEVKIYAT','URETIM_OZETI')),
  kayit_no         text NOT NULL,              -- formdaki kaydin numarasi (lot no, is emri no, sevk no...)
  atanan           uuid NOT NULL REFERENCES kullanici(id),
  durum            text NOT NULL DEFAULT 'BEKLIYOR' CHECK (durum IN ('BEKLIYOR','ASKIDA','ONAYLANDI','REDDEDILDI')),
  karar_veren      uuid REFERENCES kullanici(id),
  karar_zamani     timestamptz,
  karar_notu       text,
  olusturan        uuid REFERENCES kullanici(id),
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, kayit_turu, kayit_no)
);
CREATE INDEX ON onay (firma_id, atanan, durum);

-- ---------------------------------------------------------------------
-- 2) Hammadde lotu iptal bilgisi
-- ---------------------------------------------------------------------
ALTER TABLE lot
  ADD COLUMN iptal_eden      uuid REFERENCES kullanici(id),
  ADD COLUMN iptal_zamani    timestamptz,
  ADD COLUMN iptal_gerekcesi text;

-- ---------------------------------------------------------------------
-- 3) Sevkiyat satirlari: silmek yerine "cikarildi" isareti
--    Asil tablo sevkiyat_satiri_kayit oldu. sevkiyat_satiri artik yalnizca
--    sevkiyatta HALEN duran satirlari gosteren bir gorunum (view); mevcut
--    sorgular aynen calismaya devam eder. Cikarilan satirlar kayitta kalir.
-- ---------------------------------------------------------------------
ALTER TABLE sevkiyat_satiri RENAME TO sevkiyat_satiri_kayit;
ALTER TABLE sevkiyat_satiri_kayit
  ADD COLUMN cikarma_zamani timestamptz,
  ADD COLUMN cikaran        uuid REFERENCES kullanici(id);
ALTER TABLE sevkiyat_satiri_kayit DROP CONSTRAINT IF EXISTS sevkiyat_satiri_sevkiyat_id_birim_id_key;
CREATE UNIQUE INDEX sevkiyat_satiri_tek_aktif ON sevkiyat_satiri_kayit (sevkiyat_id, birim_id) WHERE cikarma_zamani IS NULL;

CREATE VIEW sevkiyat_satiri AS
  SELECT id, firma_id, sevkiyat_id, birim_id, miktar, zaman
    FROM sevkiyat_satiri_kayit
   WHERE cikarma_zamani IS NULL;

-- ---------------------------------------------------------------------
-- 4) Silme korumasi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION silme_yasak() RETURNS trigger AS $$
BEGIN
  IF current_setting('iso.silme_izni', true) = 'evet' THEN
    IF TG_LEVEL = 'ROW' THEN RETURN OLD; END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION '% tablosundan kayit silinemez. Kayitlar pasife alinir ya da iptal edilir.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'firma','kullanici','makine','malzeme','tedarikci','musteri','urun','recete','karakteristik',
    'hata_kodu','depo_yeri','sayac','is_emri','lot','birim','birim_bagi','is_emri_baglama','olcum',
    'sevkiyat','sevkiyat_satiri_kayit','bloke','bloke_birim','etiket_baskisi','entegrasyon_kuyrugu','onay'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION silme_yasak()', t || '_silinemez', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION silme_yasak()', t || '_bosaltilamaz', t);
  END LOOP;
END $$;
