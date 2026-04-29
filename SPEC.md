# Pointage Chantier — Spécifications

## Objectif

Outil de gestion pour la direction. Suivi du pointage des salariés sur les chantiers pour la **facturation** et la **paie**. Pas d'accès salarié, pas de géolocalisation, pas de mode déconnecté.

## Contexte

- ~20 salariés
- ~8 chantiers simultanés

## Stack

Node.js + Express + better-sqlite3 + HTML/JS vanilla + Tailwind CSS (CDN)
Même architecture que ouvrages-db, cashtracker, sport-clips.

## Horaires par défaut

| Jour | Horaires | Effectif |
|---|---|---|
| Lundi – Jeudi | 8h – 17h | 8h |
| Vendredi | 8h – 16h | 7h |
| **Total semaine** | | **39h** |

Samedi/Dimanche : aucun pointage auto-généré (ajout manuel possible).

## Fonctionnalités

### Gestion de base
- CRUD salariés (nom, prénom, poste, taux horaire, coefficient)
- CRUD chantiers (nom, adresse, client, n° chantier, date début/fin)

### Affectations par période
- Créer une affectation : `Salarié → Chantier, du X au Y`
- Le système génère automatiquement les pointages quotidiens (horaires par défaut ci-dessus)
- Possibilité de surcharger/supprimer un pointage individuel (maladie, congés, changement chantier)
- Le pointage individuel prime sur l'auto-génération (pas de doublon)
- Bouton "Dupliquer la semaine dernière" pour cloner les affectations
- Bouton "Clôturer le chantier" pour fermer automatiquement les affectations actives

### Alertes automatiques
- **Double affectation** : alerte si un salarié est affecté à 2 chantiers sur un même jour
- **Oubli de pointage** : alerte si un salarié affecté n'a pas de pointage à J+1
- **Absence inexpliquée** : alerte si pas de pointage et pas de motif renseigné (maladie, congé)

### Dashboard du jour
- Vue tableau : colonnes = chantiers, lignes = salariés
- Bouton entrée/sortie avec horodatage automatique
- Correction manuelle des horaires
- Vue rapide : qui est où maintenant ?
- Alertes visuelles dans le dashboard (bandeau ou badge rouge)
- Couleurs par chantier

### Rapports / Exports
- **Par chantier** : total heures × salarié (base facturation client)
- **Par salarié** : total heures normales / supplémentaires (base paie)
- Export Excel / CSV
- Vue hebdomadaire et mensuelle

## Structure de la base

```sql
salaries (
  id, nom, prenom, poste, tarif_horaire
)

chantiers (
  id, nom, client, adresse, date_debut, date_fin
)

affectations (
  id, salarie_id, chantier_id, date_debut, date_fin, horaires
)

pointages (
  id, salarie_id, chantier_id, date, heure_arrivee, heure_depart, type (auto/manuel), commentaire
)
```

## Architecture

```
pointage/
├── server.js          # Express + API REST
├── db.js              # SQLite (better-sqlite3)
├── package.json
└── public/
    ├── index.html     # Dashboard du jour
    ├── chantiers.html # Liste chantiers
    ├── salaires.html  # Rapports / export
    └── app.css        # Tailwind CSS
```

## Phasage

1. **Phase 1** : CRUD salariés + CRUD chantiers + pointage basique (entrée/sortie) + affectations
2. **Phase 2** : Rapports (chantier / salarié) + exports Excel/CSV
3. **Phase 3** : Vue hebdomadaire, alertes, suivi heures sup, duplications
