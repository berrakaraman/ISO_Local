-- =====================================================================
-- 005 - Sadelestirme (9 Kasim 2026 karari)
--  - Makine ayar kaydi ve PA kurutma kaldirildi (makineye sistemden hukmedilmez).
--  - Dakika dakika durus takibi kaldirildi. Ariza / bakim, muhendisin kagit formundaki gibi
--    TEK SEFERLIK elle girilen kayittir: makine, tarih, tur, ne yapildi, kullanilan parca, durus (dk).
--    Makine kullanilabilirligi KPI'i bu dakikalardan hesaplanir.
-- =====================================================================

DROP TABLE IF EXISTS bakim;
DROP TABLE IF EXISTS durus;
DROP TABLE IF EXISTS makine_ayar;
ALTER TABLE is_emri DROP COLUMN IF EXISTS ayar_bekliyor;
ALTER TABLE malzeme
  DROP COLUMN IF EXISTS kurutma_gerekli,
  DROP COLUMN IF EXISTS kurutma_sicaklik_min,
  DROP COLUMN IF EXISTS kurutma_sure_min,
  DROP COLUMN IF EXISTS kurutma_nem_max;

CREATE TABLE bakim (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id         uuid NOT NULL REFERENCES firma(id),
  no               text NOT NULL,
  makine_id        uuid NOT NULL REFERENCES makine(id),
  tur              text NOT NULL CHECK (tur IN ('PLANLI','ARIZA')),
  tarih            date NOT NULL,
  ariza            text,                       -- arizanin tanimi (ariza kaydinda zorunlu)
  yapilan          text NOT NULL,
  kullanilan_parca text,
  durus_dk         numeric NOT NULL CHECK (durus_dk >= 0 AND durus_dk <= 10080),
  kaydeden         uuid REFERENCES kullanici(id),
  zaman            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, no)
);
CREATE INDEX ON bakim (firma_id, makine_id, tarih DESC);

-- Silinemez, sonradan degistirilemez (yanlissa yeni kayit girilir)
CREATE TRIGGER bakim_silinemez BEFORE DELETE ON bakim FOR EACH ROW EXECUTE FUNCTION silme_yasak();
CREATE TRIGGER bakim_bosaltilamaz BEFORE TRUNCATE ON bakim FOR EACH STATEMENT EXECUTE FUNCTION silme_yasak();
CREATE TRIGGER bakim_degismez BEFORE UPDATE ON bakim FOR EACH ROW EXECUTE FUNCTION yalnizca_ekleme();
