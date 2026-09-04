-- Migration 002 : ajout des colonnes servings, prep_time, cook_time, notes
-- Chaque ALTER TABLE est géré individuellement par le runner (try/catch)
-- pour rendre la migration idempotente : les erreurs "duplicate column name"
-- sont ignorées silencieusement, les autres sont relancées.

ALTER TABLE recipes ADD COLUMN servings  INTEGER NOT NULL DEFAULT 4;
ALTER TABLE recipes ADD COLUMN prep_time INTEGER;
ALTER TABLE recipes ADD COLUMN cook_time INTEGER;
ALTER TABLE recipes ADD COLUMN notes     TEXT;
