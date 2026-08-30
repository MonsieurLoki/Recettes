/**
 * photoValidator.js
 *
 * Valide les fichiers image soumis via POST /api/photos avant tout traitement
 * (stockage ou OCR). Vérifie trois contraintes successives :
 *   1. Format MIME : seuls image/jpeg et image/png sont acceptés (Req. 1.4)
 *   2. Taille fichier : maximum 10 Mo (Req. 1.5)
 *   3. Résolution image : minimum 640 × 480 px (Req. 1.6)
 *
 * Pourquoi sharp pour les métadonnées ?
 * --------------------------------------
 * `sharp` lit uniquement les en-têtes du fichier image (quelques dizaines
 * d'octets) pour obtenir les dimensions (width, height) et le format, sans
 * jamais décoder l'intégralité des données pixel en mémoire. Cela rend la
 * validation très peu coûteuse en RAM, même pour des images de 10 Mo.
 * Lire les métadonnées via `sharp(path).metadata()` est donc préférable à
 * charger le buffer complet ou à utiliser une bibliothèque de décodage
 * complet.
 *
 * Paramètres :
 *   file (object) — objet fichier Multer :
 *     - mimetype (string) : type MIME déclaré par le client
 *     - size     (number) : taille en octets
 *     - path     (string) : chemin temporaire du fichier sur disque
 *
 * Valeur de retour :
 *   Promise<{ valid: true }>
 *   Promise<{ valid: false, error: string }>
 */

'use strict';

const sharp = require('sharp');

// Formats MIME autorisés (Req. 1.4)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

// Taille maximale en octets : 10 Mo (Req. 1.5)
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Résolution minimale en pixels (Req. 1.6)
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;

/**
 * validatePhotoFile
 *
 * Valide le format MIME, la taille et la résolution d'un fichier image.
 *
 * @param {object} file - Objet fichier fourni par Multer (mimetype, size, path)
 * @returns {Promise<{ valid: boolean, error?: string }>}
 *   Résout avec `{ valid: true }` si toutes les contraintes sont respectées,
 *   ou `{ valid: false, error: <message explicatif> }` dès qu'une contrainte
 *   est violée. Les contraintes sont vérifiées dans l'ordre croissant de coût :
 *   MIME (lecture mémoire) → taille (lecture mémoire) → résolution (I/O).
 */
async function validatePhotoFile(file) {
  // --- Vérification 1 : Format MIME (Req. 1.4) ---
  // Le type MIME est lu depuis les en-têtes multipart envoyés par le client.
  // La vérification côté serveur reste indispensable car le client peut
  // falsifier ce champ — la validation de la résolution via sharp confirme
  // ensuite que le fichier est réellement une image décodable.
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Format de fichier non supporté : "${file.mimetype}". Seuls les formats JPEG et PNG sont acceptés.`,
    };
  }

  // --- Vérification 2 : Taille (Req. 1.5) ---
  // `file.size` est renseigné par Multer à partir du Content-Length multipart.
  // Vérifier avant la lecture des métadonnées évite un accès disque inutile.
  if (file.size > MAX_SIZE_BYTES) {
    const sizeMo = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Taille du fichier dépassée : ${sizeMo} Mo. La taille maximale autorisée est 10 Mo.`,
    };
  }

  // --- Vérification 3 : Résolution (Req. 1.6) ---
  // `sharp(path).metadata()` lit uniquement les en-têtes de l'image (format
  // JPEG : marqueurs SOF ; format PNG : chunk IHDR) pour obtenir width et
  // height sans décoder les données pixel, ce qui est très économe en RAM.
  let metadata;
  try {
    metadata = await sharp(file.path).metadata();
  } catch (err) {
    // Si sharp ne peut pas lire le fichier, il ne s'agit pas d'une image
    // JPEG/PNG valide malgré le MIME déclaré.
    return {
      valid: false,
      error: 'Le fichier n\'est pas une image valide ou est corrompu.',
    };
  }

  const { width, height } = metadata;

  if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      valid: false,
      error: `Résolution insuffisante : ${width ?? '?'} × ${height ?? '?'} px. La résolution minimale requise est ${MIN_WIDTH} × ${MIN_HEIGHT} px.`,
    };
  }

  // Toutes les contraintes sont respectées
  return { valid: true };
}

module.exports = { validatePhotoFile };
