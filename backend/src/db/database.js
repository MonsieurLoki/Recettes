/**
 * db/database.js
 * Connexion SQLite et initialisation du schéma via migration.
 *
 * Pourquoi SQLite pour ce projet ?
 * ---------------------------------
 * Cette application est à usage strictement personnel (un seul utilisateur
 * à la fois). SQLite est idéal dans ce contexte car :
 *   - Zéro configuration serveur : la base de données est un simple fichier
 *     sur le disque.
 *   - Sauvegarde triviale : copier le fichier `.db` suffit.
 *   - Performances excellentes en lecture/écriture séquentielle (single-user).
 *   - Déploiement simplifié : pas de processus séparé à gérer.
 * Si l'application devait supporter plusieurs utilisateurs simultanés, une
 * migration vers PostgreSQL serait envisageable — les requêtes SQL standard
 * restent pour la plupart compatibles.
 *
 * Pourquoi ne pas utiliser un ORM ?
 * ----------------------------------
 * Un ORM (comme Prisma ou Sequelize) ajoute une couche d'abstraction qui
 * génère du SQL à notre place. C'est pratique pour des requêtes complexes mais :
 *   - Cela masque ce qui se passe réellement en base (moins pédagogique).
 *   - Cela crée une dépendance supplémentaire à maintenir.
 *   - Pour un projet de cette taille, le SQL direct avec `better-sqlite3`
 *     est plus simple, plus rapide et plus lisible.
 * Nous utilisons des *prepared statements* (requêtes paramétrées) qui offrent
 * la même protection contre les injections SQL qu'un ORM, sans la complexité.
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Chemin vers le fichier SQLite, défini dans la variable d'environnement DB_PATH.
// dotenv doit avoir été chargé avant ce module (dans app.js).
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/recettes.db');

// Chemin vers le fichier de migration initial.
// Ce fichier est versionné dans le dépôt et décrit le schéma complet.
const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');

/**
 * Ouvre (ou crée) la base de données SQLite au chemin spécifié.
 *
 * L'option `verbose` en développement trace chaque requête SQL dans la
 * console, ce qui aide au débogage. En production, on peut la retirer.
 */
const db = new Database(dbPath, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

/**
 * Active les clés étrangères (FK) pour cette connexion.
 *
 * SQLite n'applique pas les contraintes de clé étrangère par défaut ;
 * il faut les activer explicitement à chaque ouverture de connexion.
 * Cela garantit que les suppressions en cascade (ON DELETE CASCADE) et
 * les vérifications d'intégrité référentielle fonctionnent correctement.
 */
db.pragma('foreign_keys = ON');

/**
 * Exécute le fichier de migration 001_initial.sql si les tables n'existent
 * pas encore.
 *
 * La migration est idempotente grâce aux clauses `IF NOT EXISTS` dans le SQL.
 * On peut l'appeler à chaque démarrage sans risque d'erreur ni de perte de données.
 */
function runMigrations() {
  if (!fs.existsSync(migrationPath)) {
    throw new Error(
      `Fichier de migration introuvable : ${migrationPath}\n` +
      'Assurez-vous que backend/src/db/migrations/001_initial.sql existe.'
    );
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // exec() exécute plusieurs instructions SQL séparées par des points-virgules,
  // ce qui est nécessaire pour un fichier de migration complet.
  db.exec(sql);
}

// Exécuter les migrations au chargement du module.
// Toute erreur ici doit faire échouer le démarrage du serveur.
runMigrations();

/**
 * Exporte l'instance `db` pour être utilisée dans les routes et les services.
 *
 * Grâce au système de cache de modules Node.js (require cache), cette instance
 * est un singleton : tous les modules qui font `require('./db/database')` partagent
 * la même connexion SQLite, ce qui est le comportement souhaité.
 */
module.exports = db;
