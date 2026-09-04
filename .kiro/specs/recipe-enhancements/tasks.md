# Implementation Plan: Recipe Enhancements

## Overview

Four additive improvements to the Recettes application implemented in four
waves: database migration first, then backend logic, then frontend components,
then frontend views. Each wave builds on the previous one. No existing
behaviour is removed.

---

## Tasks

- [ ] 1. Database migration
  - [ ] 1.1 Create `backend/src/db/migrations/002_enhancements.sql`
    - Add `ALTER TABLE recipes ADD COLUMN servings INTEGER NOT NULL DEFAULT 4`
    - Add `ALTER TABLE recipes ADD COLUMN prep_time INTEGER`
    - Add `ALTER TABLE recipes ADD COLUMN cook_time INTEGER`
    - Add `ALTER TABLE recipes ADD COLUMN notes TEXT`
    - _Requirements: 1.1, 3.1, 3.2, 9.1_
  - [ ] 1.2 Update `backend/src/db/database.js` migration runner
    - Change the runner to read all `*.sql` files from `migrations/` in
      lexicographic order
    - Wrap each `ALTER TABLE` statement in an individual try/catch; silently
      ignore `"duplicate column name"` errors, re-throw all others
    - _Requirements: 1.2_
  - [ ]* 1.3 Write integration test for migration idempotency
    - Run the migration runner twice on a fresh in-memory DB; assert no error
      and that all four columns are present in the schema
    - _Requirements: 1.2_

- [ ] 2. Backend — validator and new fields
  - [ ] 2.1 Update `backend/src/validators/recipeValidator.js`
    - Add `validateServings(value)`: optional integer in [1, 100]; returns
      error string or null; default 4 applied in routes, not here
    - Add `validatePositiveInteger(fieldName, value)`: for `prep_time` and
      `cook_time`; optional, ≥ 1 when present
    - Add `validateNotes(value)`: optional string ≤ 2 000 characters; sanitised
      before storage (in route layer)
    - Call all four validators from `validateCreateRecipe` and
      `validateUpdateRecipe`
    - _Requirements: 1.4, 1.5, 1.6, 3.3, 3.4, 3.5, 9.2, 9.3_
  - [ ]* 2.2 Write property test for `servings` validation
    - **Property 1 (partial): integer field validation**
    - For any integer in [1, 100], validator returns null; for any integer
      outside, validator returns a non-null error string
    - Use `fc.integer()` with filtering
    - Tag: `Feature: recipe-enhancements, Property 1: servings validation`
    - _Requirements: 1.4, 1.5_
  - [ ]* 2.3 Write unit tests for `recipeValidator.js` new fields
    - `servings`: boundary values (1, 100, 0, 101, non-integer, missing)
    - `prep_time`/`cook_time`: boundary values (1, 0, -1, non-integer, missing)
    - `notes`: 0 chars, 2000 chars, 2001 chars, null/missing
    - _Requirements: 1.4, 1.5, 3.3, 3.4, 3.5, 9.2, 9.3_

- [ ] 3. Backend — recipe routes (new fields + max_time filter)
  - [ ] 3.1 Update `getRecipeById` helper in `routes/recipes.js`
    - Extend the SELECT to include `servings`, `prep_time`, `cook_time`,
      `notes`, `photo_path`
    - _Requirements: 1.8, 3.8, 7.1 (photo_path in GET :id), 9.6_
  - [ ] 3.2 Update `GET /api/recipes` list query in `routes/recipes.js`
    - Add `photo_path`, `servings`, `prep_time`, `cook_time` to the SELECT
      inside `dataSql`
    - Add `max_time` query parameter validation (positive integer; HTTP 400
      otherwise)
    - Add SQL condition for `max_time`:
      ```sql
      (
        (prep_time IS NOT NULL OR cook_time IS NOT NULL)
        AND COALESCE(prep_time, 0) + COALESCE(cook_time, 0) <= ?
      ) OR (prep_time IS NULL AND cook_time IS NULL)
      ```
    - Include new fields in the mapped response objects
    - _Requirements: 1.9, 3.9, 5.2, 5.3, 5.4, 8.8_
  - [ ] 3.3 Update `POST /api/recipes` in `routes/recipes.js`
    - Read `servings` (default 4), `prep_time`, `cook_time`, `notes` from
      `req.body` after validation
    - Sanitise `notes` with `sanitizeText`
    - Add the four fields to the INSERT SQL
    - _Requirements: 1.3, 1.4, 3.6, 3.7, 6.4, 9.4, 9.5_
  - [ ] 3.4 Update `PUT /api/recipes/:id` in `routes/recipes.js`
    - Read `servings` (preserve existing DB value if absent — SELECT before
      transaction), `prep_time`, `cook_time`, `notes` from `req.body`
    - Sanitise `notes` with `sanitizeText`
    - Add the four fields to the UPDATE SQL
    - _Requirements: 1.6, 1.7, 3.3, 3.4, 9.2, 9.4, 9.5_
  - [ ]* 3.5 Write property tests for `max_time` filter
    - **Property 4: timeless recipes always returned**
      For any threshold T, seed DB with recipes having both time fields null;
      all must appear in the filtered response
    - **Property 5: timed recipes respect the threshold**
      For any T and any recipe where prep+cook > T, it must not appear
    - Use `fc.integer({ min: 1, max: 500 })` for thresholds and time values
    - Tag: `Feature: recipe-enhancements, Property 4: timeless recipes returned`
    - Tag: `Feature: recipe-enhancements, Property 5: timed recipes respect threshold`
    - _Requirements: 5.2, 5.3_
  - [ ]* 3.6 Write integration tests for recipe routes with new fields
    - POST with all four new fields: verify storage and response
    - POST without optional fields: verify defaults (servings=4, others null)
    - PUT without servings field: verify existing servings preserved
    - GET /api/recipes: verify photo_path, servings, prep_time, cook_time in list
    - GET /api/recipes?max_time=invalid: verify HTTP 400
    - GET /api/recipes?max_time=60: verify only matching recipes returned
    - _Requirements: 1.3, 1.7, 1.8, 1.9, 3.6-3.9, 5.3, 5.4_

- [ ] 4. Backend — photo serving endpoint
  - [ ] 4.1 Add `GET /api/photos/:filename` to `backend/src/routes/photos.js`
    - Reuse the existing `uploadsDir` constant and `auth` middleware
    - Security checks in order: path traversal guard, extension allowlist
      (`.jpg`, `.jpeg`, `.png`), file existence check
    - Serve the file with `res.sendFile` and correct `Content-Type` header
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [ ]* 4.2 Write unit/integration tests for `GET /api/photos/:filename`
    - Path traversal attempts: `../secret.jpg`, `foo/bar.jpg`, `..\\secret`
    - Bad extensions: `.gif`, `.exe`, `.txt`
    - Non-existent file: valid name, valid extension, file absent from uploads
    - Valid file: copy a small test PNG to a temp uploads dir, verify 200 and
      correct Content-Type
    - _Requirements: 7.2, 7.3, 7.4, 7.6_

- [ ] 5. Backend — Gemini service update
  - [ ] 5.1 Update `backend/src/services/geminiService.js`
    - Extend the prompt to instruct Gemini to also extract `prep_time` and
      `cook_time` as integers in minutes, converting "1 h 30 min" → 90
    - Extend the expected JSON schema to include `prep_time` and `cook_time`
    - Validate and return both fields as integers or `null`
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 5.2 Update `photos.js` POST handler to store `prep_time`/`cook_time`
    - After structuring via Gemini, include `structured.prep_time` and
      `structured.cook_time` in the INSERT statement for the draft recipe
    - _Requirements: 6.4_
  - [ ]* 5.3 Write unit tests for `geminiService.js` extended output
    - Mock the Gemini API response; verify that `prep_time` and `cook_time`
      are present, are integers or null, and that conversion from
      hours+minutes is handled correctly (e.g. "1h30" → 90)
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 6. Checkpoint — backend tests pass
  - Run the full backend test suite (`npm test` in `backend/`); ensure all
    existing tests still pass and all new tests pass. Fix any regressions
    before proceeding to frontend work.

- [ ] 7. Frontend — stores and shared utilities
  - [ ] 7.1 Update `frontend/src/stores/recipes.js`
    - Add `max_time` support in `fetchRecipes`: if `filters.maxTime` is set,
      append `max_time` as a query parameter
    - _Requirements: 5.2_
  - [ ] 7.2 Extract `scaleQuantity(qty, originalServings, targetServings)` as
    a pure helper in `frontend/src/utils/servings.js`
    - If `qty` can be parsed as a positive decimal number, return
      `String(Math.round((parseFloat(qty) * targetServings / originalServings) * 100) / 100)`
    - Otherwise return `qty` unchanged
    - _Requirements: 2.6, 2.7, 2.8_
  - [ ]* 7.3 Write property tests for `scaleQuantity`
    - **Property 1: servings ratio scales numeric quantities correctly**
      For any positive float Q, integer S in [1,100], integer T in [1,100]:
      `parseFloat(scaleQuantity(String(Q), S, T))` ≈ `round(Q*T/S, 2)`
    - **Property 2: non-numeric quantities are unaffected**
      For any string that is not a positive decimal: `scaleQuantity(s, S, T) === s`
    - **Property 3: stepper bounds**
      For any sequence of +/- operations starting from any value in [1,100],
      the result is always in [1,100]
    - Use fast-check; run ≥ 100 iterations per property
    - Tag: `Feature: recipe-enhancements, Property 1: servings ratio scales numeric quantities`
    - Tag: `Feature: recipe-enhancements, Property 2: non-numeric quantities unaffected`
    - Tag: `Feature: recipe-enhancements, Property 3: stepper bounds`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 8. Frontend — `RecipeForm.vue`
  - [ ] 8.1 Add servings, prep_time, cook_time fields to `RecipeForm.vue`
    - Add `servings`, `prep_time`, `cook_time` to the `form` reactive object
      (defaults: `4`, `null`, `null`)
    - Extend `initFromData` to populate these three fields
    - Add three `<input type="number">` fields below "Instructions":
      Portions (min=1, max=100), Préparation (min=1, placeholder "minutes"),
      Cuisson (min=1, placeholder "minutes")
    - Include the three fields in the `body` assembled in `handleSubmit`
      (send as integers or omit when empty)
    - _Requirements: 4.5_

- [ ] 9. Frontend — `RecipeCard.vue`
  - [ ] 9.1 Add time badge and thumbnail to `RecipeCard.vue`
    - Add `totalTime` computed: `(recipe.prep_time ?? 0) + (recipe.cook_time ?? 0)`,
      only when at least one time field is non-null
    - Add `formattedTime` computed: `"X min"` if < 60, `"Xh Ymin"` if ≥ 60
    - Render a time badge `<span>` when totalTime > 0 (Req. 4.1); hide when
      both null (Req. 4.2)
    - Add `photoError` ref (initially false); render an `<img>` thumbnail
      when `recipe.photo_path` is non-null and `!photoError`; bind `@error`
      to set `photoError = true`; construct `src` from
      `${import.meta.env.VITE_API_URL}/api/photos/${filename}`
    - _Requirements: 4.1, 4.2, 8.3, 8.4, 8.5, 8.7_

- [ ] 10. Frontend — `RecipeDetailView.vue`
  - [ ] 10.1 Add header photo display
    - Add `photoError` ref; in the header, render a full-width `<img>`
      when `recipe.photo_path` is non-null and `!photoError`; bind `@error`
      to set `photoError = true`
    - _Requirements: 8.1, 8.2, 8.5, 8.6_
  - [ ] 10.2 Add prep/cook time display in header
    - Add a `hasTimes` computed (true when at least one time field is non-null)
    - Render a time row in the header when `hasTimes` is true, showing
      `Préparation`, `Cuisson`, and `Total` values; hide the row when both null
    - _Requirements: 4.3, 4.4_
  - [ ] 10.3 Add servings control and ingredient scaling
    - Add `currentServings` ref initialised from `recipe.servings` in
      `onMounted`
    - Add `servingsRatio` computed: `currentServings.value / recipe.value.servings`
    - Add `scaledIngredients` computed: maps `recipe.ingredients` through
      `scaleQuantity` (imported from `utils/servings.js`)
    - Render a `+` / `−` stepper below the header using `currentServings`;
      clamp to [1, 100]; disable `−` at 1, `+` at 100
    - Replace `recipe.ingredients` with `scaledIngredients` in the ingredient
      list template
    - No API calls; `currentServings` resets on component remount (Req. 2.9, 2.10)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_
  - [ ] 10.4 Add inline notes editor
    - Add `editingNotes` ref, `notesDraft` ref, `notesError` ref, `savingNotes`
      ref
    - In read mode: show `recipe.notes` or placeholder "Ajouter une note…";
      pencil button to enter edit mode (Req. 10.2, 10.3)
    - In edit mode: `<textarea>` bound to `notesDraft`, character counter
      `N / 2000`, "Sauvegarder" button (disabled when `savingNotes`),
      "Annuler" button (Req. 10.4, 10.5, 10.6, 10.8)
    - Save: call `recipesStore.updateRecipe(id, { ...recipe, notes: notesDraft })`
      (include all required fields); on success update `recipe.notes` and exit
      edit mode; on error show `notesError` and stay in edit mode (Req. 10.7, 10.9, 10.10)
    - _Requirements: 10.1–10.10_

- [ ] 11. Frontend — `HomeView.vue`
  - [ ] 11.1 Add time filter dropdown to `HomeView.vue`
    - Add `maxTime` ref (initially `null`)
    - Add a `<select>` in `.search-section` with options: "Toutes les durées"
      (null), "Moins de 30 min" (30), "Moins de 1 h" (60), "Moins de 2 h" (120)
    - Add a `watch` on `maxTime` that sets `currentPage.value = 1` and calls
      `loadRecipes()`
    - Pass `maxTime.value` to `fetchRecipes` as `filters.maxTime`
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

- [ ] 12. Final checkpoint — full suite passes
  - Run `npm test` in `backend/`; verify all tests pass including new ones.
  - Manually verify in the browser: create a recipe via photo (Gemini returns
    prep/cook times), view the card (thumbnail + time badge), open detail view
    (photo header, servings control, notes editor), filter by time on home page.
  - Fix any remaining issues before considering the feature complete.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster initial
  deployment; the feature remains functional without them.
- `scaleQuantity` extracted to `utils/servings.js` (task 7.2) is used by both
  `RecipeDetailView.vue` (task 10.3) and its property tests (task 7.3). Both
  depend on task 7.2.
- The migration runner change (task 1.2) must complete before any backend route
  test that starts the server with a real DB (tasks 3.5, 3.6, 4.2).
- Property tests (7.3) require the `scaleQuantity` utility (7.2) to exist first.
- The `notes` inline editor (task 10.4) calls `updateRecipe` which requires
  all mandatory fields (name, instructions, ingredients, category_ids). The
  handler should read the current `recipe` object and spread it into the body,
  overwriting only `notes`.
- Each property test must run at least 100 iterations (fast-check default).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.1", "5.1"] },
    { "id": 4, "tasks": ["3.5", "3.6", "4.2", "5.2", "5.3"] },
    { "id": 5, "tasks": ["7.1", "7.2"] },
    { "id": 6, "tasks": ["7.3", "8.1", "9.1"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4", "11.1"] }
  ]
}
```
