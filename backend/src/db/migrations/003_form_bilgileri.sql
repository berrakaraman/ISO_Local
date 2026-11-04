-- =====================================================================
-- 003 - Formlarda "kim yapti" bilgileri
--   is_emri  : iptal eden / zaman / gerekce
--   sevkiyat : sevki onaylayan (F-06 "Onaylayan"), iptal eden / zaman / gerekce
-- =====================================================================
ALTER TABLE is_emri
  ADD COLUMN iptal_eden      uuid REFERENCES kullanici(id),
  ADD COLUMN iptal_zamani    timestamptz,
  ADD COLUMN iptal_gerekcesi text;

ALTER TABLE sevkiyat
  ADD COLUMN onaylayan       uuid REFERENCES kullanici(id),
  ADD COLUMN iptal_eden      uuid REFERENCES kullanici(id),
  ADD COLUMN iptal_zamani    timestamptz,
  ADD COLUMN iptal_gerekcesi text;
