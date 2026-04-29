const express = require("express");
const path = require("path");
const {
  db,
  getAllSalaries,
  getSalarie,
  createSalarie,
  updateSalarie,
  toggleSalarieActif,
  getAllChantiers,
  getChantier,
  createChantier,
  updateChantier,
  toggleChantierActif,
  getAffectations,
  getAffectationsForRange,
  createAffectation,
  deleteAfectation,
  getPointagesByDate,
  getPointagesByRange,
  getPointageForSalarieDate,
  createPointage,
  updatePointage,
  deletePointage,
  getMateriauxByChantier,
  createMateriel,
  deleteMateriel,
  setPrixVente,
} = require("./db");

const app = express();
const PORT = 3041;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// SALARIES
// ============================================================

app.get("/api/salaries", (req, res) => {
  const data = getAllSalaries.all();
  res.json(data);
});

app.post("/api/salaries", (req, res) => {
  const { nom, prenom, poste, tarif_horaire, coefficient } = req.body;
  const result = createSalarie.run(nom || "", prenom || "", poste || "", tarif_horaire || 0, coefficient || "");
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/salaries/:id", (req, res) => {
  const { nom, prenom, poste, tarif_horaire, coefficient } = req.body;
  updateSalarie.run(nom, prenom, poste, tarif_horaire, coefficient, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/salaries/:id", (req, res) => {
  toggleSalarieActif.run(0, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// CHANTIERS
// ============================================================

app.get("/api/chantiers", (req, res) => {
  const data = getAllChantiers.all();
  res.json(data);
});

app.post("/api/chantiers", (req, res) => {
  const { nom, client, adresse, num_chantier, date_debut, date_fin, prix_vente_horaire } = req.body;
  const result = createChantier.run(nom || "", client || "", adresse || "", num_chantier || "", date_debut || null, date_fin || null);
  if (prix_vente_horaire) setPrixVente.run(prix_vente_horaire, result.lastInsertRowid);
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/chantiers/:id", (req, res) => {
  const { nom, client, adresse, num_chantier, date_debut, date_fin, prix_vente_horaire } = req.body;
  updateChantier.run(nom, client, adresse, num_chantier, date_debut, date_fin, req.params.id);
  if (prix_vente_horaire !== undefined) setPrixVente.run(prix_vente_horaire, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/chantiers/:id", (req, res) => {
  toggleChantierActif.run(0, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// AFFECTATIONS
// ============================================================

app.get("/api/affectations", (req, res) => {
  const data = getAffectations.all();
  res.json(data);
});

app.get("/api/affectations/range", (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.json([]);
  const data = getAffectationsForRange.all(to, from);
  res.json(data);
});

app.post("/api/affectations", (req, res) => {
  const { salarie_id, chantier_id, date_debut, date_fin, horaires } = req.body;
  const result = createAffectation.run(salarie_id, chantier_id, date_debut, date_fin, horaires || "auto");
  res.json({ id: result.lastInsertRowid });
});

app.delete("/api/affectations/:id", (req, res) => {
  deleteAfectation.run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// POINTAGES
// ============================================================

app.get("/api/pointages", (req, res) => {
  const { date } = req.query;
  if (date) {
    const data = getPointagesByDate.all(date);
    return res.json(data);
  }
  const { from, to } = req.query;
  if (from && to) {
    const data = getPointagesByRange.all(from, to);
    return res.json(data);
  }
  res.json([]);
});

app.post("/api/pointages", (req, res) => {
  const { salarie_id, chantier_id, date, heure_arrivee, heure_depart, type, commentaire, motif_absence } = req.body;
  const existing = getPointageForSalarieDate.get(salarie_id, date);
  if (existing) {
    updatePointage.run(chantier_id, heure_arrivee, heure_depart, commentaire, motif_absence, existing.id);
    return res.json({ id: existing.id, updated: true });
  }
  const result = createPointage.run(salarie_id, chantier_id, date, heure_arrivee || null, heure_depart || null, type || "manuel", commentaire || "", motif_absence || null);
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/pointages/:id", (req, res) => {
  const { chantier_id, heure_arrivee, heure_depart, commentaire, motif_absence } = req.body;
  updatePointage.run(chantier_id, heure_arrivee, heure_depart, commentaire, motif_absence, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/pointages/:id", (req, res) => {
  deletePointage.run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// GENERATE POINTAGES FROM AFFECTATIONS
// ============================================================

app.post("/api/generate", (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: "from and to dates required" });

  const existing = getPointagesByRange.all(from, to);
  let created = 0;
  const affectations = getAffectationsForRange.all(to, from);

  const transaction = db.transaction(() => {
    const start = new Date(from);
    const end = new Date(to);
    const current = new Date(start);

    while (current <= end) {
      const day = current.getDay();
      const dayNum = current.getDate();
      if (day >= 1 && day <= 5) {
        const isFriday = day === 5;
        const heureArr = "08:00";
        const heureDep = isFriday ? "16:00" : "17:00";
        const dateStr = current.toISOString().split("T")[0];

        for (const aff of affectations) {
          const alreadyExists = existing.find(p => p.salarie_id === aff.salarie_id && p.date === dateStr);
          if (alreadyExists) continue;
          if (dateStr < aff.date_debut || dateStr > aff.date_fin) continue;
          db.prepare(`INSERT OR IGNORE INTO pointages (salarie_id, chantier_id, date, heure_arrivee, heure_depart, type) VALUES (?, ?, ?, ?, ?, 'auto')`).run(aff.salarie_id, aff.chantier_id, dateStr, heureArr, heureDep);
          created++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
  });

  try {
    transaction();
    res.json({ created, message: `${created} pointages générés` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ALERTES
// ============================================================

app.get("/api/alertes", (req, res) => {
  const { date } = req.query;
  if (!date) return res.json([]);

  const alertes = [];
  const pointages = getPointagesByDate.all(date);
  const salarieCount = {};
  for (const p of pointages) {
    if (!salarieCount[p.salarie_id]) salarieCount[p.salarie_id] = { nom: p.nom, prenom: p.prenom, chantiers: [] };
    salarieCount[p.salarie_id].chantiers.push(p.chantier_nom);
  }
  for (const [sid, info] of Object.entries(salarieCount)) {
    if (info.chantiers.length > 1) {
      alertes.push({ type: "double_affectation", message: `${info.nom} ${info.prenom} affecté(e) à ${info.chantiers.join(" et ")} le ${date}`, salarie_id: parseInt(sid) });
    }
  }

  const affectationsForDate = getAffectationsForRange.all(date, date);
  const pointageSalarieIds = new Set(pointages.map(p => p.salarie_id));
  for (const aff of affectationsForDate) {
    if (!pointageSalarieIds.has(aff.salarie_id)) {
      alertes.push({ type: "oubli_pointage", message: `${aff.nom} ${aff.prenom} devrait pointer sur ${aff.chantier_nom} le ${date}`, salarie_id: aff.salarie_id, chantier_id: aff.chantier_id });
    }
  }

  res.json(alertes);
});

// ============================================================
// RAPPORTS
// ============================================================

app.get("/api/rapports/chantier", (req, res) => {
  const { chantier_id, from, to } = req.query;
  if (!chantier_id || !from || !to) return res.json([]);
  const rows = db.prepare(`
    SELECT s.id, s.nom, s.prenom,
      COUNT(DISTINCT p.date) as nb_jours,
      SUM(CASE WHEN p.heure_arrivee AND p.heure_depart THEN
        (CAST(substr(p.heure_depart,1,2) AS REAL) * 60 + CAST(substr(p.heure_depart,4,2) AS REAL)
        - CAST(substr(p.heure_arrivee,1,2) AS REAL) * 60 - CAST(substr(p.heure_arrivee,4,2) AS REAL))
      ELSE 0 END / 60.0) as total_heures
    FROM pointages p
    JOIN salaries s ON p.salarie_id = s.id
    WHERE p.chantier_id = ? AND p.date BETWEEN ? AND ?
    GROUP BY p.salarie_id
  `).all(chantier_id, from, to);
  res.json(rows);
});

app.get("/api/rapports/salarie", (req, res) => {
  const { salarie_id, from, to } = req.query;
  if (!salarie_id || !from || !to) return res.json([]);
  const rows = db.prepare(`
    SELECT c.id, c.nom, c.client,
      COUNT(DISTINCT p.date) as nb_jours,
      SUM(CASE WHEN p.heure_arrivee AND p.heure_depart THEN
        (CAST(substr(p.heure_depart,1,2) AS REAL) * 60 + CAST(substr(p.heure_depart,4,2) AS REAL)
        - CAST(substr(p.heure_arrivee,1,2) AS REAL) * 60 - CAST(substr(p.heure_arrivee,4,2) AS REAL))
      ELSE 0 END / 60.0) as total_heures
    FROM pointages p
    JOIN chantiers c ON p.chantier_id = c.id
    WHERE p.salarie_id = ? AND p.date BETWEEN ? AND ?
    GROUP BY p.chantier_id
  `).all(salarie_id, from, to);
  res.json(rows);
});

// ============================================================
// MATERIAUX / FINANCES
// ============================================================

app.get("/api/materiaux/:chantier_id", (req, res) => {
  const data = getMateriauxByChantier.all(req.params.chantier_id);
  res.json(data);
});

app.post("/api/materiaux", (req, res) => {
  const { chantier_id, mois, description, montant_ht, fournisseur } = req.body;
  const result = createMateriel.run(chantier_id, mois, description || "", montant_ht, fournisseur || "");
  res.json({ id: result.lastInsertRowid });
});

app.delete("/api/materiaux/:id", (req, res) => {
  deleteMateriel.run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/financier", (req, res) => {
  const { chantier_id, mois } = req.query;
  if (!chantier_id || !mois) return res.json({});

  // mois format: "2026-04"
  const monthStart = mois + "-01";
  const monthEnd = mois + "-31";

  const chantier = db.prepare("SELECT * FROM chantiers WHERE id = ?").get(chantier_id);

  // Total heures sur le mois
  const heures = db.prepare(`
    SELECT
      SUM(CASE WHEN heure_arrivee AND heure_depart THEN
        (CAST(substr(heure_depart,1,2) AS REAL)*60 + CAST(substr(heure_depart,4,2) AS REAL)
        - CAST(substr(heure_arrivee,1,2) AS REAL)*60 - CAST(substr(heure_arrivee,4,2) AS REAL))
      ELSE 0 END / 60.0) as total_heures
    FROM pointages WHERE chantier_id = ? AND date BETWEEN ? AND ?
  `).get(chantier_id, monthStart, monthEnd);

  // Coût matière ouvrière
  const mo = db.prepare(`
    SELECT SUM(
      CASE WHEN p.heure_arrivee AND p.heure_depart THEN
        (CAST(substr(p.heure_depart,1,2) AS REAL)*60 + CAST(substr(p.heure_depart,4,2) AS REAL)
        - CAST(substr(p.heure_arrivee,1,2) AS REAL)*60 - CAST(substr(p.heure_arrivee,4,2) AS REAL))
      ELSE 0 END / 60.0 * s.tarif_horaire
    ) as cout_mo
    FROM pointages p
    JOIN salaries s ON p.salarie_id = s.id
    WHERE p.chantier_id = ? AND p.date BETWEEN ? AND ?
  `).get(chantier_id, monthStart, monthEnd);

  // Coûts matériaux
  const mats = db.prepare(
    "SELECT SUM(montant_ht) as cout_mats FROM materiaux WHERE chantier_id = ? AND mois = ?"
  ).get(chantier_id, mois);

  const totalHeures = heures.total_heures || 0;
  const coutMO = mo.cout_mo || 0;
  const coutMats = mats.cout_mats || 0;
  const prixVente = chantier.prix_vente_horaire || 0;
  const recette = totalHeures * prixVente;
  const marge = recette - coutMO - coutMats;

  res.json({
    chantier: chantier.nom,
    mois,
    total_heures: totalHeures.toFixed(1),
    prix_vente_horaire: prixVente,
    recette: recette.toFixed(2),
    cout_mo: coutMO.toFixed(2),
    cout_materiaux: coutMats.toFixed(2),
    marge: marge.toFixed(2),
  });
});

// ============================================================

app.listen(PORT, () => {
  console.log(`Pointage Chantier - http://localhost:${PORT}`);
});
