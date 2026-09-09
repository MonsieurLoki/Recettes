/**
 * routes/photos.js
 *
 * RÃ´le : exposer le endpoint POST /api/photos qui orchestre le flux complet
 * de capture d'une recette par photo :
 *   1. Authentification (clÃ© API)
 *   2. RÃ©ception du fichier via Multer (multipart/form-data, champ Â« photo Â»)
 *   3. Validation du fichier (format, taille, rÃ©solution) via photoValidator
 *   4. Appel au service OCR (Google Cloud Vision) via ocrService
 *   5. Extraction du nom candidat via ocrNameExtractor
 *   6. CrÃ©ation d'un brouillon de recette en base de donnÃ©es
 *   7. RÃ©ponse 201 avec { recipe_id, ocr_text, suggested_name }
 *
 * Requirements couverts :
 *   1.3  â€” stocker la photo puis appeler l'OCR
 *   1.4  â€” rejeter les formats non JPEG/PNG
 *   1.5  â€” rejeter les fichiers > 10 Mo
 *   1.6  â€” rejeter les images < 640Ã—480 px
 *   1.7  â€” si le stockage Ã©choue, rejeter sans appeler l'OCR
 *   1.8  â€” stocker le texte OCR et retourner recipe_id
 *   1.9  â€” gÃ©rer le timeout OCR â†’ HTTP 502
 *   3.1  â€” extraire les 5 premiers mots comme nom candidat
 *   3.2  â€” retourner "" si le texte OCR ne contient aucun mot
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
const { structureRecipeFromOcr } = require('../services/geminiService');
const { extractDishFromPhoto } = require('../services/dishExtractorService');
const db                  = require('../db/database');

const router = express.Router();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Configuration Multer
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pourquoi diskStorage plutÃ´t que memoryStorage ?
// Sharp (utilisÃ© dans photoValidator) peut lire un chemin de fichier directement,
// ce qui est plus Ã©conome en RAM que de passer un Buffer complet en mÃ©moire.
// De plus, le fichier doit de toute faÃ§on Ãªtre stockÃ© dans UPLOADS_DIR aprÃ¨s
// validation, donc diskStorage est le choix naturel.
//
// Deux passes de contrÃ´le de la taille :
//   1. Multer (limits.fileSize) coupe le flux dÃ¨s que la taille dÃ©passe 10 Mo,
//      avant mÃªme que le fichier soit entiÃ¨rement Ã©crit sur disque (Req. 1.5).
//      Cela protÃ¨ge le serveur contre les uploads volumineux.
//   2. photoValidator vÃ©rifie ensuite la taille dÃ©clarÃ©e (file.size) pour
//      produire un message d'erreur lisible cÃ´tÃ© client.
//
// Filtre MIME dans fileFilter :
// Le filtre Multer effectue un premier contrÃ´le sur le type MIME dÃ©clarÃ© par
// le client. photoValidator le vÃ©rifie Ã  nouveau indÃ©pendamment pour garantir
// la cohÃ©rence (Req. 1.4).

// Dossier de destination des photos, configurable via UPLOADS_DIR.
// path.resolve garantit un chemin absolu mÃªme si la variable contient un
// chemin relatif (ex. "./uploads").
const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')
);

// S'assurer que le dossier d'uploads existe au dÃ©marrage du module.
// recursive:true Ã©vite une erreur si le dossier existe dÃ©jÃ .
fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Stockage Multer : diskStorage
 *
 * destination : dossier UPLOADS_DIR (crÃ©Ã© ci-dessus si absent)
 * filename    : horodatage Unix + nom original pour Ã©viter les collisions
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
 * avant mÃªme d'Ã©crire quoi que ce soit sur le disque.
 * photoValidator effectue ensuite une vÃ©rification indÃ©pendante.
 *
 * @param {import('express').Request} _req
 * @param {object} file - Objet fichier Multer (fieldname, originalname, mimetypeâ€¦)
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
 * Instance Multer configurÃ©e pour le champ Â« photo Â».
 *
 * limits.fileSize : Multer interrompt le flux dÃ¨s que la taille dÃ©passe 10 Mo.
 *   Cela Ã©vite d'Ã©crire l'intÃ©gralitÃ© d'un fichier gigantesque sur disque
 *   avant de le rejeter â€” c'est la protection de premier niveau (Req. 1.5).
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo en octets
  },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/photos
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Supprime un fichier de faÃ§on silencieuse (sans propager l'erreur).
 *
 * UtilisÃ©e pour nettoyer les fichiers uploadÃ©s en cas d'Ã©chec de validation
 * ou d'OCR, afin de ne pas laisser de fichiers orphelins dans UPLOADS_DIR.
 *
 * @param {string|undefined} filePath - Chemin absolu du fichier Ã  supprimer
 */
function cleanupFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      // Logger en silence : l'erreur de nettoyage ne doit pas masquer
      // l'erreur principale dÃ©jÃ  renvoyÃ©e au client.
      console.error(`[PHOTOS] Ã‰chec suppression fichier temporaire "${filePath}":`, err.message);
    }
  });
}

/**
 * POST /api/photos
 *
 * Flux complet : upload â†’ validation â†’ OCR â†’ brouillon DB â†’ rÃ©ponse 201.
 *
 * Middlewares appliquÃ©s dans l'ordre :
 *   1. auth          â€” vÃ©rifie X-API-Key (Req. 10.1)
 *   2. upload.single â€” rÃ©ceptionne le fichier multipart dans req.file
 *   3. handler async â€” validation, OCR, insertion DB
 *
 * Erreurs Multer (ex. fichier trop grand, mauvais champ) :
 *   TraitÃ©es dans le bloc try/catch avant la logique mÃ©tier, pour retourner
 *   un HTTP 400 clair plutÃ´t que de laisser Express gÃ©nÃ©rer un 500.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Function}                   next
 */
router.post('/', auth, (req, res, next) => {
  // On utilise une fonction intermÃ©diaire non-async pour intercepter les erreurs
  // Multer (qui ne sont pas des erreurs Express standard) avant d'entrer dans
  // la logique async. Multer appelle cb(err) â†’ on peut alors distinguer
  // MulterError (400) des autres erreurs (500).
  upload.single('photo')(req, res, (multerErr) => {
    if (multerErr) {
      // Erreurs Multer spÃ©cifiques â†’ HTTP 400 avec message lisible (Req. 1.5)
      if (multerErr instanceof multer.MulterError) {
        let message;
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          message = 'Taille du fichier dÃ©passÃ©e. La taille maximale autorisÃ©e est 10 Mo.';
        } else if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
          message = 'Format de fichier non supportÃ©. Seuls les formats JPEG et PNG sont acceptÃ©s.';
        } else {
          message = `Erreur lors de la rÃ©ception du fichier : ${multerErr.message}`;
        }
        return res.status(400).json({ error: message });
      }
      // Toute autre erreur Multer imprÃ©vue â†’ gestionnaire global
      return next(multerErr);
    }

    // Multer a terminÃ© sans erreur â†’ continuer avec la logique async
    handlePhotoUpload(req, res, next);
  });
});

/**
 * Logique mÃ©tier principale du endpoint POST /api/photos.
 *
 * AppelÃ©e aprÃ¨s que Multer a Ã©crit le fichier sur disque sans erreur.
 * Effectue dans l'ordre :
 *   1. VÃ©rification de la prÃ©sence du fichier dans la requÃªte
 *   2. Validation (format MIME, taille, rÃ©solution) via photoValidator
 *   3. Appel OCR via ocrService (avec timeout 30 s)
 *   4. Extraction du nom candidat via ocrNameExtractor
 *   5. Insertion d'un brouillon de recette en base de donnÃ©es
 *   6. RÃ©ponse 201 avec { recipe_id, ocr_text, suggested_name }
 *
 * En cas d'Ã©chec Ã  n'importe quelle Ã©tape aprÃ¨s le stockage du fichier,
 * cleanupFile() supprime le fichier pour Ã©viter les orphelins.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Function}                   next
 */
async function handlePhotoUpload(req, res, next) {
  const file = req.file;

  // Aucun fichier transmis dans le champ Â« photo Â»
  if (!file) {
    return res.status(400).json({
      error: 'Aucun fichier reÃ§u. Envoyez une image JPEG ou PNG dans le champ "photo".',
    });
  }

  try {
    // â”€â”€ Ã‰tape 1 : Validation du fichier (Req. 1.4, 1.5, 1.6) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // photoValidator vÃ©rifie le MIME, la taille et la rÃ©solution via sharp.
    // Si la validation Ã©choue, on supprime le fichier dÃ©jÃ  stockÃ© sur disque
    // (Req. 1.7 par analogie : si la validation Ã©choue, le fichier ne doit pas
    // rester dans UPLOADS_DIR) et on retourne 400.
    const validation = await validatePhotoFile(file);

    if (!validation.valid) {
      cleanupFile(file.path);
      return res.status(400).json({ error: validation.error });
    }

    // â”€â”€ Ã‰tape 2 : Stockage confirmÃ© (Req. 1.7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Ã€ ce stade, le fichier est validÃ© et dÃ©jÃ  prÃ©sent dans UPLOADS_DIR grÃ¢ce
    // Ã  Multer. Si l'Ã©criture disque avait Ã©chouÃ©, Multer aurait propagÃ© une
    // erreur dans le callback, capturÃ©e plus haut â€” on n'atteindrait donc pas
    // cette ligne. Le chemin relatif est calculÃ© pour Ãªtre stockÃ© en DB
    // (chemin absolu â†’ relatif depuis la racine du projet backend).
    const photoPath = path.relative(
      path.join(__dirname, '../..'),
      file.path
    ).replace(/\\/g, '/'); // Normaliser les sÃ©parateurs Windows â†’ POSIX

    // â”€â”€ Ã‰tape 3 : Appel OCR (Req. 1.8, 1.9) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ocrService lance l'extraction via Google Cloud Vision avec un timeout de
    // 30 s (Promise.race interne). En cas d'Ã©chec ou de timeout, il lance une
    // erreur avec .status = 502 que l'on relance vers le gestionnaire global.
    let ocrText;
    try {
      ocrText = await extractTextFromImage(file.path);
    } catch (ocrErr) {
      // L'OCR a Ã©chouÃ© ou a expirÃ© : on conserve le fichier sur disque
      // (la photo est valide, l'OCR peut Ãªtre retentÃ©e plus tard), mais on
      // retourne une erreur 502 au client (Req. 1.9).
      // Note : on ne supprime PAS le fichier ici â€” l'utilisateur pourrait
      // retenter l'OCR sur la mÃªme photo sans avoir Ã  la recharger.
      const status = ocrErr.status || 502;
      return res.status(status).json({
        error: ocrErr.message || "Le service d'extraction de texte a rencontrÃ© une erreur.",
      });
    }

    // â”€â”€ Ã‰tape 4 : Extraction du nom candidat (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // extractCandidateName extrait les 5 premiers mots non vides du texte OCR
    // et les concatÃ¨ne, avec troncature Ã  200 caractÃ¨res.
    // Si le texte OCR est vide, retourne "".
    const suggestedName = extractCandidateName(ocrText);

    // â”€â”€ Ã‰tape 4bis : Structuration par Gemini â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Si GEMINI_API_KEY est dÃ©finie, on envoie le texte OCR Ã  Gemini Flash
    // pour obtenir une recette structurÃ©e (nom, ingrÃ©dients, instructions).
    // En cas d'Ã©chec Gemini, on continue avec le fallback (suggestedName seul).
    let structured = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        structured = await structureRecipeFromOcr(ocrText);
      } catch (geminiErr) {
        console.warn('[Photos] Gemini structuring failed, using fallback:', geminiErr.message);
      }
    }

    // â”€â”€ Ã‰tape 5 : CrÃ©ation d'un brouillon de recette en base (Req. 1.8) â”€â”€â”€â”€â”€â”€
    // La recette est crÃ©Ã©e avec :
    //   - name         : nom candidat extrait de l'OCR ou de Gemini
    //   - instructions : texte structurÃ© par Gemini, ou chaÃ®ne vide (brouillon)
    //   - prep_time    : extrait par Gemini en minutes, ou NULL (Req. 6.4)
    //   - cook_time    : extrait par Gemini en minutes, ou NULL (Req. 6.4)
    //   - ocr_text     : texte brut retournÃ© par l'OCR (archivÃ©, Req. 1.8)
    //   - photo_path   : chemin relatif du fichier dans /uploads
    //
    // Gestion de l'unicitÃ© du nom (contrainte UNIQUE COLLATE NOCASE sur recipes.name) :
    // Si le nom candidat est vide ou dupliquÃ©, on gÃ©nÃ¨re un nom gÃ©nÃ©rique unique
    // horodatÃ©. Cela garantit que le brouillon est toujours insÃ©rable sans erreur,
    // et l'utilisateur peut renommer la recette lors de l'Ã©dition.
    // ── Étape 4ter : Extraction du plat ──────────────────────────────────────────
    // Tente de détecter un plat dans la photo via Vision OBJECT_LOCALIZATION.
    // Si un plat est trouvé → on stocke le recadrage comme photo de la recette.
    // Si aucun plat n'est trouvé (photo d'une feuille de recette, texte seul…)
    // → on stocke NULL dans photo_path : l'image originale n'est pas esthétique
    //   et le placeholder sera affiché à la place.
    // En cas d'erreur Vision → on garde la photo originale par sécurité.
    let finalPhotoPath = null; // null par défaut = pas de plat détecté
    try {
      const croppedPath = await extractDishFromPhoto(file.path);
      if (croppedPath) {
        // Un plat a été détecté et recadré → utiliser le recadrage
        finalPhotoPath = path.relative(
          path.join(__dirname, '../..'),
          croppedPath
        ).replace(/\\/g, '/');
      }
      // croppedPath === null → aucun plat détecté → finalPhotoPath reste null
    } catch {
      // Erreur Vision imprévue → conserver la photo originale par sécurité
      finalPhotoPath = photoPath;
    }

        const finalName = (structured?.name?.trim()) || suggestedName.trim() || `Recette du ${new Date().toLocaleString('fr-FR')}`;
    let draftName = finalName;

    // Extraction des temps depuis Gemini (NULL si non disponibles â€” Req. 6.4)
    const finalPrepTime = structured?.prep_time ?? null;
    const finalCookTime = structured?.cook_time ?? null;

    // PrÃ©parer et exÃ©cuter l'INSERT avec un prepared statement (Req. 11.1)
    const finalInstructions = structured?.instructions?.trim() || '';
    const insertRecipe = db.prepare(`
      INSERT INTO recipes (name, instructions, prep_time, cook_time, ocr_text, photo_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let recipeId;
    try {
      const result = insertRecipe.run(draftName, finalInstructions, finalPrepTime, finalCookTime, ocrText, finalPhotoPath);
      recipeId = result.lastInsertRowid;
    } catch (dbErr) {
      // Collision de nom (UNIQUE constraint) trÃ¨s probable si l'utilisateur
      // envoie plusieurs photos rapidement. On retente avec un horodatage prÃ©cis.
      if (dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || dbErr.message?.includes('UNIQUE')) {
        const fallbackName = `Recette ${Date.now()}`;
        const result = insertRecipe.run(fallbackName, finalInstructions, finalPrepTime, finalCookTime, ocrText, finalPhotoPath);
        recipeId = result.lastInsertRowid;
      } else {
        // Erreur DB inattendue â†’ nettoyer le fichier et propager l'erreur
        cleanupFile(file.path);
        throw dbErr;
      }
    }

    // â”€â”€ Ã‰tape 6 : RÃ©ponse 201 (Req. 1.8) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Retourner recipe_id (pour que le frontend redirige vers l'Ã©dition),
    // ocr_text (pour affichage dans le champ Ã©ditable) et suggested_name
    // (pour prÃ©-remplir le champ nom de la recette).
    return res.status(201).json({
      recipe_id:      recipeId,
      ocr_text:       ocrText,
      structured:     structured, // null si Gemini non disponible
      suggested_name: structured?.name?.trim() || suggestedName,
    });

  } catch (err) {
    // Erreur non anticipÃ©e : nettoyer le fichier si prÃ©sent et dÃ©lÃ©guer au
    // gestionnaire d'erreurs global (errorHandler.js â†’ HTTP 500).
    cleanupFile(file?.path);
    next(err);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/photos/:filename
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /api/photos/:filename
 *
 * Sert un fichier image depuis le dossier UPLOADS_DIR.
 *
 * SÃ©curitÃ© appliquÃ©e dans l'ordre :
 *   1. Path traversal guard : le nom de fichier ne doit pas contenir /, \, ou ..
 *      (Req. 7.4) â€” protÃ¨ge contre les attaques de type "../../../etc/passwd"
 *   2. Extension allowlist : seuls .jpg, .jpeg, .png sont autorisÃ©s (Req. 7.6)
 *   3. File existence check : HTTP 404 si le fichier n'existe pas (Req. 7.3)
 *   4. Content-Type correct : image/jpeg ou image/png (Req. 7.2)
 *   5. Authentification X-API-Key hÃ©ritÃ©e de `auth` (Req. 7.5)
 *
 * Requirements : 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
router.get('/:filename', (req, res, next) => {
  try {
    const { filename } = req.params;

    // 1. Path traversal guard (Req. 7.4)
    // On rejette tout nom contenant un sÃ©parateur de chemin (/ ou \)
    // ou une sÃ©quence de montÃ©e de rÃ©pertoire (..).
    if (/[/\\]|\.\./.test(filename)) {
      return res.status(400).json({ error: 'Nom de fichier invalide.' });
    }

    // 2. Extension allowlist (Req. 7.6)
    // path.extname retourne l'extension avec le point (ex. ".jpg").
    const ext = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return res.status(400).json({ error: 'Extension non autorisÃ©e.' });
    }

    // 3. File existence check (Req. 7.3)
    const fullPath = path.join(uploadsDir, filename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Photo introuvable.' });
    }

    // 4. Serve with correct Content-Type (Req. 7.2)
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);

    // res.sendFile requiert un chemin absolu.
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

