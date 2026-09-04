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

// Directory containing all SQL migration files.
// Each file is named with a numeric prefix (e.g. 001_initial.sql, 002_enhancements.sql)
// so lexicographic sorting gives the correct execution order.
const migrationsDir = path.join(__dirname, 'migrations');

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
 * Runs all *.sql migration files found in the migrations/ directory,
 * in lexicographic order (001_initial.sql before 002_enhancements.sql, etc.).
 *
 * Each file is split into individual statements on semicolons and executed
 * one by one. This per-statement approach lets us make migrations idempotent:
 * "duplicate column name" errors from ALTER TABLE statements are silently
 * ignored so re-running on an already-migrated database is safe. All other
 * errors are re-thrown to fail fast on genuine problems (syntax errors,
 * constraint violations, etc.).
 */
function runMigrations() {
  // List all .sql files and sort them so they run in the right order.
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // lexicographic order: 001_initial.sql before 002_enhancements.sql

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Split on semicolons to get individual statements.
    // We must strip single-line SQL comments (-- ... ) first because some
    // comments in 001_initial.sql contain semicolons (e.g. "archive ; peut
    // être NULL"), which would produce spurious fragments if we split first.
    // After stripping comments we split on ";", trim, and drop empty strings.
    const stripped = sql
      .split('\n')
      .map(line => {
        const commentStart = line.indexOf('--');
        return commentStart >= 0 ? line.substring(0, commentStart) : line;
      })
      .join('\n');

    const statements = stripped
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        db.exec(statement);
      } catch (err) {
        // SQLite raises an error when trying to add a column that already exists.
        // This happens when the migration is run again on an already-migrated DB.
        // We silently ignore "duplicate column name" errors to make the runner idempotent.
        // All other errors (syntax errors, constraint violations, etc.) are re-thrown.
        if (err.message && err.message.includes('duplicate column name')) {
          // Column already exists — safe to ignore.
          continue;
        }
        throw err;
      }
    }
  }
}

// Run all migrations when the module is loaded.
// Any error here should crash the server immediately — a bad schema is not recoverable.
runMigrations();

/**
 * Exporte l'instance `db` pour être utilisée dans les routes et les services.
 *
 * Grâce au système de cache de modules Node.js (require cache), cette instance
 * est un singleton : tous les modules qui font `require('./db/database')` partagent
 * la même connexion SQLite, ce qui est le comportement souhaité.
 */
module.exports = db;
