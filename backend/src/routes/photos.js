/**
 * routes/photos.js
 *
 * Rôle : exposer le endpoint POST /api/photos qui orchestre le flux complet
 * de capture d'une recette par photo :
 *   1. Authentification (clé API)
 *   2. Réception du fichier via Multer (multipart/form-data, champ « photo »)
 *   3. Validation du fichier (format, taille, résolution) via photoValidator
 *   4. Appel au service OCR (Google Cloud Vision) via ocrService
 *   5. Extraction du nom candidat via ocrNameExtractor
 *   6. Création d'un brouillon de recette en base de données
 *   7. Réponse 201 avec { recipe_id, ocr_text, suggested_name }
 *
 * Requirements couverts :
 *   1.3  — stocker la photo puis appeler l'OCR
 *   1.4  — rejeter les formats non JPEG/PNG
 *   1.5  — rejeter les fichiers > 10 Mo
 *   1.6  — rejeter les images < 640×480 px
 *   1.7  — si le stockage échoue, rejeter sans appeler l'OCR
 *   1.8  — stocker le texte OCR et retourner recipe_id
 *   1.9  — gérer le timeout OCR → HTTP 502
 *   3.1  — extraire les 5 premiers mots comme nom candidat
 *   3.2  — retourner "" si le texte OCR ne contient aucun mot
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const multer  = require('multer');

const auth                = require('../middleware/auth');
const { validatePhotoFile } = require('../validators/photoValidator');
const { extractTextFromImage } = require('../services/ocrService');
const { extractCandidateName } = require('../services/ocrNameExtractor');
const db                  = require('../db/database');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Multer
// ─────────────────────────────────────────────────────────────────────────────
// Pourquoi diskStorage plutôt que memoryStorage ?
// Sharp (utilisé dans photoValidator) peut lire un chemin de fichier directement,
// ce qui est plus économe en RAM que de passer un Buffer complet en mémoire.
// De plus, le fichier doit de toute façon être stocké dans UPLOADS_DIR après
// validation, donc diskStorage est le choix naturel.
//
// Deux passes de contrôle de la taille :
//   1. Multer (limits.fileSize) coupe le flux dès que la taille dépasse 10 Mo,
//      avant même que le fichier soit entièrement écrit sur disque (Req. 1.5).
//      Cela protège le serveur contre les uploads volumineux.
//   2. photoValidator vérifie ensuite la taille déclarée (file.size) pour
//      produire un message d'erreur lisible côté client.
//
// Filtre MIME dans fileFilter :
// Le filtre Multer effectue un premier contrôle sur le type MIME déclaré par
// le client. photoValidator le vérifie à nouveau indépendamment pour garantir
// la cohérence (Req. 1.4).

// Dossier de destination des photos, configurable via UPLOADS_DIR.
// path.resolve garantit un chemin absolu même si la variable contient un
// chemin relatif (ex. "./uploads").
const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')
);

// S'assurer que le dossier d'uploads existe au démarrage du module.
// recursive:true évite une erreur si le dossier existe déjà.
fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Stockage Multer : diskStorage
 *
 * destination : dossier UPLOADS_DIR (créé ci-dessus si absent)
 * filename    : horodatage Unix + nom original pour éviter les collisions
 *               et conserver l'extension d'origine (utile pour sharp et l'OCR).
 */
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename(_req, file, cb) {
    // Exemple : "1700000000000_photo.jpg"
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

/**
 * Filtre MIME Multer.
 *
 * Permet un premier rejet rapide des fichiers de type clairement invalide
 * avant même d'écrire quoi que ce soit sur le disque.
 * photoValidator effectue ensuite une vérification indépendante.
 *
 * @param {import('express').Request} _req
 * @param {object} file - Objet fichier Multer (fieldname, originalname, mimetype…)
 * @param {Function} cb - Callback Multer : cb(error, acceptFile)
 */
function fileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Passer false (sans erreur) laisse Multer ignorer le fichier ;
    // on passe une erreur pour signaler explicitement le refus de type MIME.
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), false);
  }
}

/**
 * Instance Multer configurée pour le champ « photo ».
 *
 * limits.fileSize : Multer interrompt le flux dès que la taille dépasse 10 Mo.
 *   Cela évite d'écrire l'intégralité d'un fichier gigantesque sur disque
 *   avant de le rejeter — c'est la protection de premier niveau (Req. 1.5).
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo en octets
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/photos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supprime un fichier de façon silencieuse (sans propager l'erreur).
 *
 * Utilisée pour nettoyer les fichiers uploadés en cas d'échec de validation
 * ou d'OCR, afin de ne pas laisser de fichiers orphelins dans UPLOADS_DIR.
 *
 * @param {string|undefined} filePath - Chemin absolu du fichier à supprimer
 */
function cleanupFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      // Logger en silence : l'erreur de nettoyage ne doit pas masquer
      // l'erreur principale déjà renvoyée au client.
      console.error(`[PHOTOS] Échec suppression fichier temporaire "${filePath}":`, err.message);
    }
  });
}

/**
 * POST /api/photos
 *
 * Flux complet : upload → validation → OCR → brouillon DB → réponse 201.
 *
 * Middlewares appliqués dans l'ordre :
 *   1. auth          — vérifie X-API-Key (Req. 10.1)
 *   2. upload.single — réceptionne le fichier multipart dans req.file
 *   3. handler async — validation, OCR, insertion DB
 *
 * Erreurs Multer (ex. fichier trop grand, mauvais champ) :
 *   Traitées dans le bloc try/catch avant la logique métier, pour retourner
 *   un HTTP 400 clair plutôt que de laisser Express générer un 500.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Function}                   next
 */
router.post('/', auth, (req, res, next) => {
  // On utilise une fonction intermédiaire non-async pour intercepter les erreurs
  // Multer (qui ne sont pas des erreurs Express standard) avant d'entrer dans
  // la logique async. Multer appelle cb(err) → on peut alors distinguer
  // MulterError (400) des autres erreurs (500).
  upload.single('photo')(req, res, (multerErr) => {
    if (multerErr) {
      // Erreurs Multer spécifiques → HTTP 400 avec message lisible (Req. 1.5)
      if (multerErr instanceof multer.MulterError) {
        let message;
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          message = 'Taille du fichier dépassée. La taille maximale autorisée est 10 Mo.';
        } else if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
          message = 'Format de fichier non supporté. Seuls les formats JPEG et PNG sont acceptés.';
        } else {
          message = `Erreur lors de la réception du fichier : ${multerErr.message}`;
        }
        return res.status(400).json({ error: message });
      }
      // Toute autre erreur Multer imprévue → gestionnaire global
      return next(multerErr);
    }

    // Multer a terminé sans erreur → continuer avec la logique async
    handlePhotoUpload(req, res, next);
  });
});

/**
 * Logique métier principale du endpoint POST /api/photos.
 *
 * Appelée après que Multer a écrit le fichier sur disque sans erreur.
 * Effectue dans l'ordre :
 *   1. Vérification de la présence du fichier dans la requête
 *   2. Validation (format MIME, taille, résolution) via photoValidator
 *   3. Appel OCR via ocrService (avec timeout 30 s)
 *   4. Extraction du nom candidat via ocrNameExtractor
 *   5. Insertion d'un brouillon de recette en base de données
 *   6. Réponse 201 avec { recipe_id, ocr_text, suggested_name }
 *
 * En cas d'échec à n'importe quelle étape après le stockage du fichier,
 * cleanupFile() supprime le fichier pour éviter les orphelins.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Function}                   next
 */
async function handlePhotoUpload(req, res, next) {
  const file = req.file;

  // Aucun fichier transmis dans le champ « photo »
  if (!file) {
    return res.status(400).json({
      error: 'Aucun fichier reçu. Envoyez une image JPEG ou PNG dans le champ "photo".',
    });
  }

  try {
    // ── Étape 1 : Validation du fichier (Req. 1.4, 1.5, 1.6) ─────────────────
    // photoValidator vérifie le MIME, la taille et la résolution via sharp.
    // Si la validation échoue, on supprime le fichier déjà stocké sur disque
    // (Req. 1.7 par analogie : si la validation échoue, le fichier ne doit pas
    // rester dans UPLOADS_DIR) et on retourne 400.
    const validation = await validatePhotoFile(file);

    if (!validation.valid) {
      cleanupFile(file.path);
      return res.status(400).json({ error: validation.error });
    }

    // ── Étape 2 : Stockage confirmé (Req. 1.7) ───────────────────────────────
    // À ce stade, le fichier est validé et déjà présent dans UPLOADS_DIR grâce
    // à Multer. Si l'écriture disque avait échoué, Multer aurait propagé une
    // erreur dans le callback, capturée plus haut — on n'atteindrait donc pas
    // cette ligne. Le chemin relatif est calculé pour être stocké en DB
    // (chemin absolu → relatif depuis la racine du projet backend).
    const photoPath = path.relative(
      path.join(__dirname, '../..'),
      file.path
    ).replace(/\\/g, '/'); // Normaliser les séparateurs Windows → POSIX

    // ── Étape 3 : Appel OCR (Req. 1.8, 1.9) ─────────────────────────────────
    // ocrService lance l'extraction via Google Cloud Vision avec un timeout de
    // 30 s (Promise.race interne). En cas d'échec ou de timeout, il lance une
    // erreur avec .status = 502 que l'on relance vers le gestionnaire global.
    let ocrText;
    try {
      ocrText = await extractTextFromImage(file.path);
    } catch (ocrErr) {
      // L'OCR a échoué ou a expiré : on conserve le fichier sur disque
      // (la photo est valide, l'OCR peut être retentée plus tard), mais on
      // retourne une erreur 502 au client (Req. 1.9).
      // Note : on ne supprime PAS le fichier ici — l'utilisateur pourrait
      // retenter l'OCR sur la même photo sans avoir à la recharger.
      const status = ocrErr.status || 502;
      return res.status(status).json({
        error: ocrErr.message || "Le service d'extraction de texte a rencontré une erreur.",
      });
    }

    // ── Étape 4 : Extraction du nom candidat (Req. 3.1, 3.2) ─────────────────
    // extractCandidateName extrait les 5 premiers mots non vides du texte OCR
    // et les concatène, avec troncature à 200 caractères.
    // Si le texte OCR est vide, retourne "".
    const suggestedName = extractCandidateName(ocrText);

    // ── Étape 5 : Création d'un brouillon de recette en base (Req. 1.8) ──────
    // La recette est créée avec :
    //   - name       : nom candidat extrait de l'OCR (peut être vide → remplacé
    //                  par un nom générique horodaté pour satisfaire la contrainte
    //                  NOT NULL UNIQUE)
    //   - instructions: chaîne vide (brouillon, l'utilisateur complétera via PUT)
    //   - ocr_text   : texte brut retourné par l'OCR (archivé, Req. 1.8)
    //   - photo_path : chemin relatif du fichier dans /uploads
    //
    // Gestion de l'unicité du nom (contrainte UNIQUE COLLATE NOCASE sur recipes.name) :
    // Si le nom candidat est vide ou dupliqué, on génère un nom générique unique
    // horodaté. Cela garantit que le brouillon est toujours insérable sans erreur,
    // et l'utilisateur peut renommer la recette lors de l'édition.
    let draftName = suggestedName.trim() || `Recette du ${new Date().toLocaleString('fr-FR')}`;

    // Préparer et exécuter l'INSERT avec un prepared statement (Req. 11.1)
    const insertRecipe = db.prepare(`
      INSERT INTO recipes (name, instructions, ocr_text, photo_path)
      VALUES (?, '', ?, ?)
    `);

    let recipeId;
    try {
      const result = insertRecipe.run(draftName, ocrText, photoPath);
      recipeId = result.lastInsertRowid;
    } catch (dbErr) {
      // Collision de nom (UNIQUE constraint) très probable si l'utilisateur
      // envoie plusieurs photos rapidement. On retente avec un horodatage précis.
      if (dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || dbErr.message?.includes('UNIQUE')) {
        const fallbackName = `Recette ${Date.now()}`;
        const result = insertRecipe.run(fallbackName, ocrText, photoPath);
        recipeId = result.lastInsertRowid;
      } else {
        // Erreur DB inattendue → nettoyer le fichier et propager l'erreur
        cleanupFile(file.path);
        throw dbErr;
      }
    }

    // ── Étape 6 : Réponse 201 (Req. 1.8) ─────────────────────────────────────
    // Retourner recipe_id (pour que le frontend redirige vers l'édition),
    // ocr_text (pour affichage dans le champ éditable) et suggested_name
    // (pour pré-remplir le champ nom de la recette).
    return res.status(201).json({
      recipe_id:      recipeId,
      ocr_text:       ocrText,
      suggested_name: suggestedName,
    });

  } catch (err) {
    // Erreur non anticipée : nettoyer le fichier si présent et déléguer au
    // gestionnaire d'erreurs global (errorHandler.js → HTTP 500).
    cleanupFile(file?.path);
    next(err);
  }
}

module.exports = router;
