const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "pointage.db");
const db = new Database(DB_PATH);

// --- Schéma ---
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prenom TEXT,
  poste TEXT,
  tarif_horaire REAL,
  coefficient TEXT,
  actif INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chantiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  client TEXT,
  adresse TEXT,
  num_chantier TEXT,
  date_debut TEXT,
  date_fin TEXT,
  actif INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS affectations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salarie_id INTEGER NOT NULL,
  chantier_id INTEGER NOT NULL,
  date_debut TEXT NOT NULL,
  date_fin TEXT NOT NULL,
  horaires TEXT DEFAULT 'auto',
  FOREIGN KEY (salarie_id) REFERENCES salaries(id),
  FOREIGN KEY (chantier_id) REFERENCES chantiers(id)
);

CREATE TABLE IF NOT EXISTS pointages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salarie_id INTEGER NOT NULL,
  chantier_id INTEGER,
  date TEXT NOT NULL,
  heure_arrivee TEXT,
  heure_depart TEXT,
  type TEXT DEFAULT 'auto',
  commentaire TEXT,
  motif_absence TEXT,
  FOREIGN KEY (salarie_id) REFERENCES salaries(id),
  FOREIGN KEY (chantier_id) REFERENCES chantiers(id)
);

CREATE TABLE IF NOT EXISTS materiaux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chantier_id INTEGER NOT NULL,
  mois TEXT NOT NULL,
  description TEXT,
  montant_ht REAL NOT NULL,
  fournisseur TEXT,
  FOREIGN KEY (chantier_id) REFERENCES chantiers(id)
);
`);

// Migration silencieuse pour ajouter la colonne prix_vente_horaire si elle n'existe pas
try {
  db.exec(`ALTER TABLE chantiers ADD COLUMN prix_vente_horaire REAL`);
} catch (_) { /* colonne déjà présente */ }

// Migration : supprimer la contrainte UNIQUE(salarie_id, date) si elle existe
const pointagesSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pointages'").get();
if (pointagesSchema && pointagesSchema.sql && pointagesSchema.sql.toUpperCase().includes("UNIQUE")) {
  console.log("Migration pointages: suppression de la contrainte UNIQUE...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pointages_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salarie_id INTEGER NOT NULL,
      chantier_id INTEGER,
      date TEXT NOT NULL,
      heure_arrivee TEXT,
      heure_depart TEXT,
      type TEXT DEFAULT 'auto',
      commentaire TEXT,
      motif_absence TEXT,
      FOREIGN KEY (salarie_id) REFERENCES salaries(id),
      FOREIGN KEY (chantier_id) REFERENCES chantiers(id)
    );
    INSERT INTO pointages_v2 SELECT * FROM pointages;
    DROP TABLE pointages;
    ALTER TABLE pointages_v2 RENAME TO pointages;
  `);
  console.log("Migration OK");
}

// --- Prepared statements ---
// Salariés
const getAllSalaries = db.prepare("SELECT * FROM salaries WHERE actif = 1 ORDER BY nom, prenom");
const getAllSalariesAll = db.prepare("SELECT * FROM salaries ORDER BY nom, prenom");
const getSalarie = db.prepare("SELECT * FROM salaries WHERE id = ?");
const createSalarie = db.prepare(
  "INSERT INTO salaries (nom, prenom, poste, tarif_horaire, coefficient) VALUES (?, ?, ?, ?, ?)"
);
const updateSalarie = db.prepare(
  "UPDATE salaries SET nom = ?, prenom = ?, poste = ?, tarif_horaire = ?, coefficient = ? WHERE id = ?"
);
const toggleSalarieActif = db.prepare("UPDATE salaries SET actif = ? WHERE id = ?");

// Chantiers
const getAllChantiers = db.prepare("SELECT * FROM chantiers WHERE actif = 1 ORDER BY nom");
const getAllChantiersAll = db.prepare("SELECT * FROM chantiers ORDER BY nom");
const getChantier = db.prepare("SELECT * FROM chantiers WHERE id = ?");
const createChantier = db.prepare(
  "INSERT INTO chantiers (nom, client, adresse, num_chantier, date_debut, date_fin, prix_vente_horaire) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const updateChantier = db.prepare(
  "UPDATE chantiers SET nom = ?, client = ?, adresse = ?, num_chantier = ?, date_debut = ?, date_fin = ?, prix_vente_horaire = ? WHERE id = ?"
);
const toggleChantierActif = db.prepare("UPDATE chantiers SET actif = ? WHERE id = ?");

// Affectations
const getAffectations = db.prepare("SELECT a.*, s.nom, s.prenom, c.nom as chantier_nom FROM affectations a JOIN salaries s ON a.salarie_id = s.id JOIN chantiers c ON a.chantier_id = c.id ORDER BY a.date_debut DESC");
const getAffectationsForRange = db.prepare(
  "SELECT a.*, s.nom, s.prenom, c.nom as chantier_nom FROM affectations a JOIN salaries s ON a.salarie_id = s.id JOIN chantiers c ON a.chantier_id = c.id WHERE a.date_debut <= ? AND a.date_fin >= ? ORDER BY s.nom"
);
const createAffectation = db.prepare(
  "INSERT INTO affectations (salarie_id, chantier_id, date_debut, date_fin, horaires) VALUES (?, ?, ?, ?, ?)"
);
const deleteAffectation = db.prepare("DELETE FROM affectations WHERE id = ?");

// Pointages
const getPointagesByDate = db.prepare("SELECT p.*, s.nom, s.prenom, c.nom as chantier_nom FROM pointages p JOIN salaries s ON p.salarie_id = s.id LEFT JOIN chantiers c ON p.chantier_id = c.id WHERE p.date = ? ORDER BY s.nom");
const getPointagesByRange = db.prepare(
  "SELECT p.*, s.nom, s.prenom, c.nom as chantier_nom FROM pointages p JOIN salaries s ON p.salarie_id = s.id LEFT JOIN chantiers c ON p.chantier_id = c.id WHERE p.date BETWEEN ? AND ? ORDER BY p.date, s.nom"
);
const getPointageForSalarieDate = db.prepare("SELECT * FROM pointages WHERE salarie_id = ? AND date = ?");
const createPointage = db.prepare(
  "INSERT INTO pointages (salarie_id, chantier_id, date, heure_arrivee, heure_depart, type, commentaire, motif_absence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const updatePointage = db.prepare(
  "UPDATE pointages SET chantier_id = ?, heure_arrivee = ?, heure_depart = ?, commentaire = ?, motif_absence = ? WHERE id = ?"
);
const deletePointage = db.prepare("DELETE FROM pointages WHERE id = ?");

// Matériaux chantier
const getMateriauxByChantier = db.prepare("SELECT * FROM materiaux WHERE chantier_id = ? ORDER BY mois DESC");
const createMateriel = db.prepare("INSERT INTO materiaux (chantier_id, mois, description, montant_ht, fournisseur) VALUES (?, ?, ?, ?, ?)");
const deleteMateriel = db.prepare("DELETE FROM materiaux WHERE id = ?");

// Mise à jour prix de vente chantier
const setPrixVente = db.prepare("UPDATE chantiers SET prix_vente_horaire = ? WHERE id = ?");

module.exports = {
  db,
  getAllSalaries,
  getAllSalariesAll,
  getSalarie,
  createSalarie,
  updateSalarie,
  toggleSalarieActif,
  getAllChantiers,
  getAllChantiersAll,
  getChantier,
  createChantier,
  updateChantier,
  toggleChantierActif,
  getAffectations,
  getAffectationsForRange,
  createAffectation,
  deleteAfectation: deleteAffectation,
  getPointagesByDate,
  getPointagesByRange,
  createPointage,
  updatePointage,
  deletePointage,
  getMateriauxByChantier,
  createMateriel,
  deleteMateriel,
  setPrixVente,
};
