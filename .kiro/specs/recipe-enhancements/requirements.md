# Requirements Document — Recipe Enhancements

## Introduction

This spec covers four independent improvements to the Recettes application
(a personal recipe-management PWA). The four features are:

1. **Portions ajustables** — a servings field per recipe and a frontend control
   that proportionally recalculates displayed ingredient quantities.
2. **Temps de préparation et cuisson** — prep-time and cook-time fields,
   displayed on cards and detail view, filterable on the home page, and
   extracted automatically from OCR photos via Gemini.
3. **Affichage de la photo** — display the recipe photo (already stored in
   `uploads/`) as a header image on the detail view, and as an optional
   thumbnail on recipe cards.
4. **Notes personnelles** — a private notes field per recipe, editable inline
   on the detail view without navigating to the full edit form.

All four features share the same existing stack: Node.js 22 + Express 4 +
SQLite (better-sqlite3) on the backend, and Vue 3 + Pinia + Vue Router 4 on
the frontend.

---

## Glossary

- **Recipe** : a row in the `recipes` table; the central domain object.
- **Backend** : the Node.js/Express application served on port 3000.
- **Frontend** : the Vue 3 SPA built by Vite and served by Nginx.
- **API** : the REST interface exposed by the Backend under `/api`.
- **Servings_Control** : the `+` / `−` stepper UI component in the recipe
  detail view that adjusts the displayed servings count.
- **Servings_Ratio** : the ratio `current_servings / original_servings` used
  to recalculate ingredient quantities proportionally.
- **Numeric_Quantity** : an ingredient quantity field whose value can be parsed
  as a positive decimal number (e.g. `"200"`, `"1.5"`, `"0.5"`).
- **Text_Quantity** : an ingredient quantity field whose value cannot be parsed
  as a positive decimal number (e.g. `"à goût"`, `"une pincée"`, `"QS"`).
- **Prep_Time** : the time in minutes required for preparation before cooking
  (`prep_time` column, optional integer).
- **Cook_Time** : the time in minutes spent actively cooking (`cook_time`
  column, optional integer).
- **Total_Time** : `Prep_Time + Cook_Time`; computed on the fly when at least
  one of the two values is present.
- **Time_Filter** : a dropdown on the home page that limits results to recipes
  whose Total_Time does not exceed a chosen threshold.
- **Gemini** : the `geminiService.js` integration that parses OCR text into a
  structured recipe object.
- **Photo_Endpoint** : the new `GET /api/photos/:filename` route that serves
  image files from the `uploads/` directory.
- **Inline_Notes_Editor** : the UI component in the detail view that allows
  editing the `notes` field in place, without navigating to the full edit form.
- **DB_Migration** : a new SQL file added to `backend/src/db/migrations/`
  that alters the `recipes` table with `ALTER TABLE … ADD COLUMN`.
- **Recipe_Form** : the existing `RecipeForm.vue` component used for creating
  and fully editing recipes.
- **RecipeCard** : the existing `RecipeCard.vue` component that renders a
  recipe summary in the list view.
- **Detail_View** : the existing `RecipeDetailView.vue` component.
- **Recipe_Store** : the Pinia store `recipes.js` that manages API calls and
  recipe state on the frontend.

---

## Requirements

### Requirement 1 — Portions ajustables : champ `servings` en base

**User Story:** As the owner, I want each recipe to have a default servings
count, so that the quantity adjustment control has a reference point.

#### Acceptance Criteria

1. THE DB_Migration SHALL add a `servings` column of type `INTEGER` with a
   `DEFAULT 4` and a `NOT NULL` constraint to the `recipes` table.
2. THE DB_Migration SHALL be idempotent: re-running the migration on an
   already-migrated database SHALL leave the schema unchanged and SHALL NOT
   raise an error.
3. WHEN a recipe is created via `POST /api/recipes` without a `servings`
   field, THE Backend SHALL store `4` as the default value for `servings`.
4. WHEN a recipe is created via `POST /api/recipes` with a `servings` field,
   THE Backend SHALL validate that `servings` is an integer between 1 and 100
   inclusive before storing it.
5. WHEN a `servings` value outside the range [1, 100] is submitted,
   THE Backend SHALL reject the request with HTTP 400 and a descriptive error
   message for the `servings` field.
6. WHEN a recipe is updated via `PUT /api/recipes/:id` with a `servings`
   field, THE Backend SHALL apply the same validation rules as for creation
   (integer in [1, 100]).
7. WHEN a recipe is updated via `PUT /api/recipes/:id` without a `servings`
   field, THE Backend SHALL preserve the recipe's existing `servings` value.
8. THE Backend SHALL include the `servings` field in the response body of
   `GET /api/recipes/:id`.
9. THE Backend SHALL include the `servings` field in each item of the response
   body of `GET /api/recipes`.

---

### Requirement 2 — Portions ajustables : contrôle frontend

**User Story:** As the owner, I want to adjust the servings count in the detail
view, so that ingredient quantities are automatically recalculated for the
number of people I am cooking for.

#### Acceptance Criteria

1. WHEN the Detail_View loads a recipe, THE Servings_Control SHALL be
   initialised with the recipe's `servings` value from the API.
2. WHEN the user activates the `+` button of the Servings_Control, THE
   Servings_Control SHALL increment the displayed servings count by 1, up to
   a maximum of 100.
3. WHEN the user activates the `−` button of the Servings_Control, THE
   Servings_Control SHALL decrement the displayed servings count by 1, down
   to a minimum of 1.
4. WHEN the displayed servings count equals 1, THE Servings_Control SHALL
   disable the `−` button so it cannot be activated.
5. WHEN the displayed servings count equals 100, THE Servings_Control SHALL
   disable the `+` button so it cannot be activated.
6. WHEN the servings count changes, THE Detail_View SHALL recompute each
   ingredient's displayed quantity by multiplying the original quantity by the
   Servings_Ratio.
7. WHEN recomputing a Numeric_Quantity, THE Detail_View SHALL round the
   result to at most 2 decimal places before displaying it.
8. WHEN recomputing a Text_Quantity, THE Detail_View SHALL display the
   Text_Quantity unchanged.
9. THE Servings_Control SHALL operate exclusively in frontend memory; changing
   servings in the Detail_View SHALL NOT trigger any API call or persist any
   change to the database.
10. WHEN the user navigates away from the Detail_View and returns, THE
    Servings_Control SHALL be reset to the recipe's original `servings` value.

---

### Requirement 3 — Temps de préparation et cuisson : champ en base

**User Story:** As the owner, I want to store the preparation and cooking time
for each recipe, so that I can see at a glance how long a recipe takes.

#### Acceptance Criteria

1. THE DB_Migration SHALL add a `prep_time` column of type `INTEGER` (minutes,
   nullable) to the `recipes` table.
2. THE DB_Migration SHALL add a `cook_time` column of type `INTEGER` (minutes,
   nullable) to the `recipes` table.
3. WHEN a recipe is created or updated with a `prep_time` value, THE Backend
   SHALL validate that the value is a positive integer (≥ 1).
4. WHEN a recipe is created or updated with a `cook_time` value, THE Backend
   SHALL validate that the value is a positive integer (≥ 1).
5. IF a `prep_time` or `cook_time` value fails validation, THEN THE Backend
   SHALL reject the request with HTTP 400 and a descriptive error message for
   the failing field.
6. WHEN a recipe is created or updated without a `prep_time` field, THE
   Backend SHALL store `NULL` for `prep_time`.
7. WHEN a recipe is created or updated without a `cook_time` field, THE
   Backend SHALL store `NULL` for `cook_time`.
8. THE Backend SHALL include `prep_time` and `cook_time` in the response body
   of `GET /api/recipes/:id`.
9. THE Backend SHALL include `prep_time` and `cook_time` in each item of the
   response body of `GET /api/recipes`.

---

### Requirement 4 — Temps de préparation et cuisson : affichage frontend

**User Story:** As the owner, I want to see the preparation and cooking times
on recipe cards and on the detail view, so that I can quickly evaluate how long
a recipe requires.

#### Acceptance Criteria

1. WHEN a recipe has at least one non-null time field (`prep_time` or
   `cook_time`), THE RecipeCard SHALL display the Total_Time in minutes in a
   human-readable format (e.g. "45 min", "1 h 15 min").
2. WHEN both `prep_time` and `cook_time` are null, THE RecipeCard SHALL not
   display any time information.
3. WHEN a recipe has at least one non-null time field, THE Detail_View SHALL
   display `prep_time` and `cook_time` separately and the Total_Time in the
   recipe header.
4. WHEN both `prep_time` and `cook_time` are null, THE Detail_View SHALL not
   display a time section in the header.
5. THE Recipe_Form SHALL include input fields for `prep_time` and `cook_time`
   so the owner can set or update these values when editing a recipe.

---

### Requirement 5 — Temps de préparation et cuisson : filtre sur la page d'accueil

**User Story:** As the owner, I want to filter recipes by total time on the
home page, so that I can quickly find recipes that fit the time I have
available.

#### Acceptance Criteria

1. THE HomeView SHALL display a Time_Filter control that offers at least the
   following threshold options: "Moins de 30 min", "Moins de 1 h",
   "Moins de 2 h", "Toutes les durées" (no filter).
2. WHEN the owner selects a threshold in the Time_Filter, THE Frontend SHALL
   pass a `max_time` query parameter (integer, minutes) to
   `GET /api/recipes`.
3. WHEN `GET /api/recipes` receives a `max_time` parameter, THE Backend SHALL
   return only recipes whose Total_Time (`prep_time + cook_time`) is less than
   or equal to `max_time`, or whose both time fields are null (timeless recipes
   are always included).
4. WHEN `GET /api/recipes` receives a `max_time` parameter that is not a
   positive integer, THE Backend SHALL reject the request with HTTP 400.
5. WHEN the owner selects "Toutes les durées", THE Frontend SHALL omit the
   `max_time` parameter, and THE Backend SHALL return all recipes regardless
   of time.
6. WHEN the owner changes the Time_Filter, THE HomeView SHALL reset the
   current page to 1 and reload the recipe list.

---

### Requirement 6 — Temps de préparation et cuisson : extraction par Gemini

**User Story:** As the owner, I want the Gemini OCR structuring to
automatically extract preparation and cooking times from a recipe photo, so
that I do not have to enter them manually.

#### Acceptance Criteria

1. WHEN Gemini processes OCR text, THE Gemini service SHALL attempt to extract
   `prep_time` and `cook_time` as integer values in minutes.
2. WHEN a time value is expressed in hours and minutes in the source text
   (e.g. "1 h 30 min"), THE Gemini service SHALL convert it to a total number
   of minutes (e.g. 90) before returning it.
3. WHEN a time value cannot be extracted or is absent from the OCR text, THE
   Gemini service SHALL return `null` for the corresponding field.
4. WHEN the Gemini service returns non-null `prep_time` or `cook_time` values,
   THE Backend SHALL store them in the recipe row created by `POST /api/photos`.

---

### Requirement 7 — Affichage de la photo : endpoint de service

**User Story:** As the owner, I want the backend to serve stored recipe photos,
so that the frontend can display them without requiring a separate file server.

#### Acceptance Criteria

1. THE Backend SHALL expose a route `GET /api/photos/:filename` that serves
   the image file corresponding to `:filename` from the `uploads/` directory.
2. WHEN the requested file exists in the `uploads/` directory, THE
   Photo_Endpoint SHALL respond with HTTP 200 and the file content, with the
   correct `Content-Type` header for the image format (`image/jpeg` or
   `image/png`).
3. WHEN the requested file does not exist, THE Photo_Endpoint SHALL respond
   with HTTP 404.
4. IF the `:filename` parameter contains path-traversal sequences (e.g. `..`,
   `/`, `\`), THEN THE Photo_Endpoint SHALL reject the request with HTTP 400,
   to prevent directory traversal attacks.
5. THE Photo_Endpoint SHALL be protected by the existing X-API-Key
   authentication middleware.
6. THE Photo_Endpoint SHALL only serve files whose name ends with `.jpg`,
   `.jpeg`, or `.png`; any other extension SHALL result in HTTP 400.

---

### Requirement 8 — Affichage de la photo : intégration frontend

**User Story:** As the owner, I want to see the recipe's photo on the detail
view and as a thumbnail on recipe cards, so that I can visually recognise
recipes at a glance.

#### Acceptance Criteria

1. WHEN a recipe has a non-null `photo_path` field, THE Detail_View SHALL
   display the photo as a full-width header image above the recipe title.
2. WHEN a recipe has a null `photo_path` field, THE Detail_View SHALL not
   display a photo section.
3. WHEN a recipe has a non-null `photo_path` field, THE RecipeCard SHALL
   display a thumbnail of the photo.
4. WHEN a recipe has a null `photo_path` field, THE RecipeCard SHALL not
   display any image element.
5. THE Frontend SHALL construct the photo URL by combining the API base URL
   with the `/api/photos/` prefix and the filename extracted from
   `photo_path`.
6. WHEN the photo fails to load (network error or 404), THE Detail_View SHALL
   hide the image element and SHALL NOT display a broken-image icon.
7. WHEN the photo fails to load on a RecipeCard, THE RecipeCard SHALL hide the
   thumbnail and SHALL NOT display a broken-image icon.
8. THE Backend SHALL include the `photo_path` field in each item of the
   response body of `GET /api/recipes`, so that the list view can render
   thumbnails.

---

### Requirement 9 — Notes personnelles : champ en base

**User Story:** As the owner, I want to save personal notes on a recipe, so
that I can record variations, tips, and reminders linked to a specific recipe.

#### Acceptance Criteria

1. THE DB_Migration SHALL add a `notes` column of type `TEXT` (nullable) to
   the `recipes` table.
2. WHEN a recipe is created or updated with a `notes` value, THE Backend SHALL
   validate that the value does not exceed 2000 characters.
3. IF a `notes` value exceeds 2000 characters, THEN THE Backend SHALL reject
   the request with HTTP 400 and a descriptive error message for the `notes`
   field.
4. WHEN a recipe is created or updated without a `notes` field, THE Backend
   SHALL store `NULL` for `notes`.
5. THE Backend SHALL sanitise the `notes` field using the same sanitisation
   function applied to other text fields (XSS prevention).
6. THE Backend SHALL include the `notes` field in the response body of
   `GET /api/recipes/:id`.

---

### Requirement 10 — Notes personnelles : éditeur inline

**User Story:** As the owner, I want to edit my notes directly on the detail
view, so that I can quickly update them while consulting the recipe without
navigating to the full edit form.

#### Acceptance Criteria

1. WHEN the Detail_View displays a recipe, THE Detail_View SHALL show a "Mes
   notes" section below the instructions section.
2. WHEN `notes` is null or empty, THE Inline_Notes_Editor SHALL display a
   placeholder text inviting the owner to add a note (e.g. "Ajouter une
   note…").
3. WHEN `notes` is non-empty, THE Inline_Notes_Editor SHALL display the note
   text in read mode.
4. WHEN the owner activates the edit control in the "Mes notes" section, THE
   Inline_Notes_Editor SHALL switch to edit mode, displaying a `<textarea>`
   pre-filled with the current notes content.
5. WHILE in edit mode, THE Inline_Notes_Editor SHALL display a character
   counter showing the number of characters used out of the 2000-character
   limit.
6. WHILE in edit mode, THE Inline_Notes_Editor SHALL display a save button and
   a cancel button.
7. WHEN the owner activates the save button, THE Inline_Notes_Editor SHALL
   call `PUT /api/recipes/:id` with the updated `notes` value (and the
   existing values for all other required fields) and SHALL switch back to read
   mode on success.
8. WHEN the owner activates the cancel button, THE Inline_Notes_Editor SHALL
   discard any unsaved changes and switch back to read mode.
9. IF the save call to `PUT /api/recipes/:id` fails, THEN THE
   Inline_Notes_Editor SHALL remain in edit mode and SHALL display an error
   message to the owner.
10. WHILE the save call is in progress, THE Inline_Notes_Editor SHALL disable
    the save button to prevent duplicate submissions.
