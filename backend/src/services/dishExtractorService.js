/**
 * dishExtractorService.js
 *
 * Attempts to detect and crop the main dish in a recipe photo.
 *
 * Strategy:
 *   1. Call Google Cloud Vision with OBJECT_LOCALIZATION to detect objects
 *      in the image and find those related to food.
 *   2. If a food object is found with confidence ≥ 0.5, crop the image to
 *      its bounding box (with a 10% margin) using sharp.
 *   3. Save the crop under a derived name (original → original_dish).
 *   4. Return the path of the cropped file, or null if no dish is detected.
 *
 * On failure (no dish, Vision error, etc.): return null silently —
 * the upload continues normally with the original photo.
 */

'use strict';

const vision = require('@google-cloud/vision');
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');

// Labels considered food objects by Vision AI.
// These are the names returned by OBJECT_LOCALIZATION (in English).
const FOOD_LABELS = new Set([
  'Food', 'Dish', 'Cuisine', 'Meal', 'Baked goods', 'Dessert',
  'Salad', 'Seafood', 'Sandwich', 'Pasta', 'Pizza', 'Soup',
  'Bread', 'Cake', 'Pastry', 'Fruit', 'Vegetable', 'Meat',
  'Cheese', 'Bowl', 'Plate', 'Cup', 'Drink', 'Beverage',
]);

/**
 * extractDishFromPhoto
 *
 * Detects the main dish in an image and returns the path of a file cropped
 * to that dish, or null if no dish is found.
 *
 * The function is intentionally silent on errors: a failed crop never
 * blocks the upload flow — the original photo is used instead.
 *
 * @param {string} imagePath - Absolute path to the original image file
 * @returns {Promise<string|null>} Path of the cropped file, or null
 */
async function extractDishFromPhoto(imagePath) {
  try {
    const client = new vision.ImageAnnotatorClient();

    // Ask Vision for object localisation — returns normalised bounding boxes
    // and confidence scores for each detected object.
    const [result] = await client.objectLocalization(imagePath);
    const objects = result.localizedObjectAnnotations || [];

    // Find the first food-related object with sufficient confidence.
    // We take the first match because OBJECT_LOCALIZATION returns objects
    // ordered by descending score, so the first food object is the most
    // prominent one in the image.
    const foodObject = objects.find(obj =>
      FOOD_LABELS.has(obj.name) && obj.score >= 0.5
    );

    if (!foodObject) {
      // No dish detected — keep the original photo
      return null;
    }

    // Extract the normalised bounding box (values between 0 and 1).
    // normalizedVertices is an array of {x, y} points (usually 4 corners).
    const vertices = foodObject.boundingPoly.normalizedVertices;
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    // Read image metadata to convert normalised coordinates to pixel values.
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;

    // Apply a 10% margin around the detected dish so it is not cropped too
    // tightly. Values are clamped to the image bounds.
    const margin = 0.10;
    const cropX = Math.max(0, Math.floor((xMin - margin) * width));
    const cropY = Math.max(0, Math.floor((yMin - margin) * height));
    const cropW = Math.min(width  - cropX, Math.ceil((xMax - xMin + 2 * margin) * width));
    const cropH = Math.min(height - cropY, Math.ceil((yMax - yMin + 2 * margin) * height));

    // Build the output file path: same directory and extension, "_dish" suffix.
    // Example: "uploads/1700000000_photo.jpg" → "uploads/1700000000_photo_dish.jpg"
    const ext        = path.extname(imagePath);
    const base       = path.basename(imagePath, ext);
    const dir        = path.dirname(imagePath);
    const croppedPath = path.join(dir, `${base}_dish${ext}`);

    // Crop and save.
    await sharp(imagePath)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .toFile(croppedPath);

    console.log(
      `[DishExtractor] Dish detected: "${foodObject.name}" ` +
      `(${Math.round(foodObject.score * 100)}%) → ${path.basename(croppedPath)}`
    );

    return croppedPath;
  } catch (err) {
    // Silent failure — do not block the upload on any error (Vision unavailable,
    // image format issue, file system error, etc.)
    console.warn('[DishExtractor] Dish extraction failed:', err.message);
    return null;
  }
}

module.exports = { extractDishFromPhoto };
