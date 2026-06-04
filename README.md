# FitTracker / Tracker Pro — Documentación completa

Última actualización: 2026-06-04 (revisión post-refactor TFG)

> **Presentación TFG:** ver `ESTRUCTURA-TFG.md` (árbol de carpetas y capas).  
> **Entrada de la app:** `index.html`  
> **Catálogos locales:** carpeta `datos/` (no `js/data/` para alimentos/biología/clima).  
> **Ejecución:** servir por HTTP (Live Server, GitHub Pages). No abrir `index.html` con `file://` si fallan los módulos ES.

Autor del refactor: Jorge Gonzalez  
Proyecto: FitTracker (Nutrición) + Tracker Pro (Hábitos)  
Stack: HTML + CSS + Vanilla JS + ES Modules + Firebase compat CDN  
Restricciones: sin Node, sin npm, sin TypeScript, sin bundlers, 100% estático  
Hosting objetivo: GitHub Pages  

[FitTracker_Technical_Blueprint.pdf](https://github.com/user-attachments/files/27567904/FitTracker_Technical_Blueprint.pdf)

<img width="2752" height="1536" alt="unnamed" src="https://github.com/user-attachments/assets/19772745-6de1-4fda-9d12-aa73d54d9344" />


---

## 0. Cómo usar este documento

- Este README está escrito para que cualquier persona pueda entender el proyecto sin abrir el código primero.  
- Aun así, siempre indica “dónde está la verdad” (archivo exacto).  
- Recomendación: abre este README y usa Ctrl+F para buscar:  
- “`foodDatabase`”  
- “`MICRO_DEFS`”  
- “`BioEngine`”  
- “`usuarios/{uid}`”  
- “`tracker_semanas`”  
- “`calculateStats`”  
- “`exportHistoryRecord`”  
- “`fittracker-modules-boot`”  
- “`__FITTRACKER_MODULES__`”  

---

## 1. Resumen ejecutivo (qué es FitTracker)

- FitTracker es una aplicación web estática que corre 100% en el navegador.  
- La aplicación se divide en dos UIs principales:  
- `index.html` para nutrición y rendimiento (FitTracker) — **archivo principal**.  
- `tracker.html` para hábitos semanales, gráficas y export PDF (Tracker Pro).  
- `css/`, `datos/` y `js/app/` separan estilos, base de datos local y lógica (ver `ESTRUCTURA-TFG.md`).  
- Ambos comparten la misma “plataforma” de autenticación y base de datos: Firebase.  
- FitTracker combina **scripts clásicos** (datos + motor + app) y **módulos ES** (Strava, snapshots, gráficas avanzadas).  
- Controladores principales:  
- `js/app/fittracker-app.js` — Firebase Auth/Firestore, UI, nutrición, perfil, historial PDF, enlace con Tracker.  
- `tracker.html` — bloque `<script>` al final del HTML (hábitos, Chart.js, html2pdf, sync Firestore). No existe `js/tracker.js`.  
- `js/fittracker-modules-boot.js` — puente ES → `window.__FITTRACKER_MODULES__` (evento `fittracker-modules-ready`).  

---

## 2. Regla de oro (separación de responsabilidades)

- Esta sección describe la convención que no se debe romper.  
- Si se respeta, el proyecto se mantiene escalable y comprensible.  

### 2.1. Capas (Clean Architecture “pragmática”)

- UI (HTML/CSS)  
- Controllers (DOM + eventos)  
- Services (infra: Firebase/Firestore/Auth)  
- Core (lógica pura / dominio)  
- Data (constantes masivas / catálogos en `datos/`)  

### 2.2. Reglas duras

- `core/` no puede usar `document`, `window.document`, `getElementById`, etc.  
- `core/` no puede llamar a Firestore ni a Auth.  
- `services/` no puede renderizar ni tocar el DOM.  
- `datos/` (y `js/data/` solo para umbrales ES) no deben ejecutar lógica de negocio: solo constantes.  
- Los HTML no deben contener scripts monolíticos con lógica.  
- FitTracker: `index.html` + `css/` + `datos/` + `js/app/fittracker-app.js` + módulos ES. Tracker: `tracker.html` (script inline al final).  

### 2.3. Qué se considera “lógica pura”

- Cálculos matemáticos.  
- Fórmulas (BMR, porcentajes, ratios).  
- Normalización de datos.  
- Reglas de negocio (categorías, umbrales).  
- Transformaciones (arrays → métricas).  

### 2.4. Qué se considera “UI glue”

- Leer inputs del DOM.  
- Escuchar clicks.  
- Actualizar innerText / clases CSS.  
- Renderizar HTML dinámico.  
- Orquestar: llamar services, luego render.  

---

## 3. Estructura del proyecto (carpetas y archivos)

> Mapa resumido para el tribunal: `ESTRUCTURA-TFG.md`.  
> **Catálogo de todos los archivos:** sección **3.1** (árbol) y **3.2** (qué hace cada uno).

### 3.1. Árbol completo del repositorio

Todos los archivos de la aplicación (sin `.obsidian/`, que es solo configuración del editor Obsidian y no forma parte del TFG):

```
/
├── index.html
├── tracker.html
├── strava.html
├── README.md
├── ESTRUCTURA-TFG.md
│
├── css/
│   └── fittracker.css
│
├── datos/
│   ├── alimentos.js
│   ├── biologia.js
│   └── clima.js
│
└── js/
    ├── fittracker-modules-boot.js
    ├── app/
    │   └── fittracker-app.js
    ├── config/
    │   ├── tailwind-theme.js
    │   └── strava-config.js
    ├── core/
    │   ├── BioEngine.js
    │   ├── dailySnapshot.js
    │   ├── dynamic-diet-advice.js
    │   ├── food-helpers.js
    │   ├── PerformanceEngine.js
    │   ├── RecoveryEngine.js
    │   ├── strava-bio-max-sync.js
    │   ├── strava-chart-granularity.js
    │   ├── strava-chart-narratives.js
    │   ├── strava-lane-fitness-snapshot.js
    │   ├── strava-lane-narrative-engine.js
    │   ├── strava-metric-glossary.js
    │   ├── strava-session-analyst.js
    │   ├── strava-sport-taxonomy.js
    │   ├── strava-workout-filters.js
    │   ├── StravaCoachEngine.js
    │   └── StravaIntelligenceEngine.js
    ├── controllers/
    │   ├── strava-controller.js
    │   └── strava-pro-panel.js
    ├── data/
    │   └── weatherThresholds.js
    ├── integrations/
    │   ├── strava-auth.js
    │   └── strava-sync.js
    └── services/
        ├── daily-snapshot-persistence.js
        ├── strava-service.js
        └── weather-service.js
```

**Total:** 3 HTML, 2 MD, 1 CSS, 3 en `datos/`, 29 en `js/` (**38 archivos** de producto; sin contar `.obsidian/`).

### 3.2. Catálogo: qué hace cada archivo

#### Raíz

| Archivo | Qué hace |
|---------|----------|
| `index.html` | **Entrada TFG.** Markup de FitTracker: splash, selector de app, onboarding, login Google, pestañas (inicio, dieta, agua, estudio, gym, Strava), historial PDF. Enlaza CDNs, `css/`, `datos/`, `js/app/` y módulos ES. Sin bloque gigante de lógica inline. |
| `tracker.html` | **Tracker Pro (hábitos).** Tabla L–D por hábito, Chart.js (barras + línea), export PDF (html2pdf), auth gate, modal de configuración de hábitos. Toda la lógica JS está en un `<script>` al final del mismo archivo (Firebase, `saveTrackerCloudSnapshot`, `syncWeekToFitTracker`). |
| `strava.html` | Página de ayuda/redirección: enlaza de vuelta a `index.html` y explica que Strava vive en la pestaña inferior de la app principal. |
| `README.md` | Documentación técnica y de negocio del proyecto (este archivo). |
| `ESTRUCTURA-TFG.md` | Resumen corto para presentación: árbol, capas, orden de carga, ejecución. |

#### `css/`

| Archivo | Qué hace |
|---------|----------|
| `fittracker.css` | Estilos propios: shell responsive, zonas Strava (overview vs lane), animación splash, componentes que Tailwind no cubre, reglas de impresión/PDF donde aplica. |

#### `datos/` (catálogos — scripts clásicos, variables globales)

| Archivo | Qué hace |
|---------|----------|
| `datos/alimentos.js` | Define `foodDatabase`: alimentos por categoría (Desayuno, Comida, etc.) con macros y `micros` por 100 g / porción. Solo datos; lo consume `fittracker-app.js` y `food-helpers.js`. |
| `datos/biologia.js` | Define `BIO_DATABASE` (perfiles por edad/género: sueño, agua, meta metabólica, mensajes) y `MICRO_DEFS` (definición de cada micronutriente: unidad, base, tipo). |
| `datos/clima.js` | Define `CLIMA_PETRER`: array mensual de temperatura, humedad e icono (fallback si no hay API en vivo). Lo usa `BioEngine.getClimateStress()`. |

#### `js/app/`

| Archivo | Qué hace |
|---------|----------|
| `fittracker-app.js` | **Controlador principal FitTracker (~6000 líneas).** Inicializa Firebase (`auth`, `db`), login Google, carga/guarda perfil `USER_BIO` y día `todayData`, onboarding, dieta (búsqueda, categorías, macros, micros), agua, estudio, gym, mapa corporal, estrés, predicciones, alertas, historial e informes PDF. Instancia `const ENGINE = new BioEngine()`. Llama a `window.__FITTRACKER_MODULES__` para Strava y snapshots. Lee semanas archivadas en `tracker_semanas`. |

#### `js/config/`

| Archivo | Qué hace |
|---------|----------|
| `tailwind-theme.js` | Configura `tailwind.config` (colores `primary`, `secondary`, `danger`, etc.) tras cargar el CDN de Tailwind. |
| `strava-config.js` | Expone `window.__STRAVA_CONFIG__` / `STRAVA_CLIENT_ID` y secret (IIFE). Permite override desde `localStorage`. **No publicar en repos abiertos** si contiene secret real. |

#### `js/core/` (dominio — sin DOM en la mayoría)

| Archivo | Qué hace |
|---------|----------|
| `BioEngine.js` | Clase `BioEngine`: BMR, perfil biológico, estrés climático, composición corporal, recálculo de metas. Requiere globals de `datos/` y `USER_BIO` / `CLIMA_REAL`. |
| `dailySnapshot.js` | Esquema y utilidades del snapshot diario: `buildDailySnapshot`, `validateDailySnapshot`, `mergeSnapshotIntoInitial`, versión de esquema. |
| `dynamic-diet-advice.js` | IIFE en `<head>`: consejos de “Combustible” combinando estado del día y semilla aleatoria determinista (modal de dieta). |
| `food-helpers.js` | Peso por defecto inteligente por alimento y gramos de referencia para macros (`getSmartDefaultWeight`, `inferMacroReferenceGrams`). |
| `RecoveryEngine.js` | `recoverySignalsFromWorkouts`: carga/fatiga heurística en ventana de N días desde sesiones Strava. |
| `PerformanceEngine.js` | `performanceTrendHints`: tendencias simples (p. ej. ritmo de carrera) en la misma ventana temporal. |
| `StravaCoachEngine.js` | Carga por sesión, fatiga y textos tipo entrenador (últimos 7 días); base para narrativas Strava. |
| `StravaIntelligenceEngine.js` | Agregaciones y insights globales (CTL/ATL heurístico, tendencias, muestreo en catálogos grandes). |
| `strava-sport-taxonomy.js` | Clasificación estricta de actividades (`run`, `ride`, `gym`, etc.) y agrupación por categoría. |
| `strava-workout-filters.js` | Filtra workouts por pestaña UI (`overview`, `run`, `ride`, …); capa única para gráficas y panel. |
| `strava-session-analyst.js` | `buildStravaSessionAnalysis`: compara una sesión con el historial del mismo deporte. |
| `strava-bio-max-sync.js` | `applyStravaCatalogToBioMaxes`: actualiza máximos run/bici/gym del perfil según import Strava. |
| `strava-chart-granularity.js` | Agrupación de gráficas (día/semana/mes/año/máx) en `sessionStorage`. |
| `strava-chart-narratives.js` | Textos interpretativos para gráficas de sesión (7 días) según deporte. |
| `strava-lane-fitness-snapshot.js` | Estimaciones orientativas (VO2 aprox., % techo por edad) por categoría. |
| `strava-lane-narrative-engine.js` | Narrativa larga por deporte (7d / 28d / mes / año) sobre el catálogo del día. |
| `strava-metric-glossary.js` | Ayuda contextual de métricas Strava (`getStravaMetricHelp`, HTML para SweetAlert). |

#### `js/controllers/` (UI Strava — usan DOM y Chart.js)

| Archivo | Qué hace |
|---------|----------|
| `strava-controller.js` | `mountStravaCharts` / `unmountStravaCharts`: gráficas Chart.js por lane, combo, bloques de sesión, insights en pantalla. |
| `strava-pro-panel.js` | `mountStravaProPanel`: HTML del panel Strava Pro (KPIs, listas de sesiones, bloques por deporte). |

#### `js/data/`

| Archivo | Qué hace |
|---------|----------|
| `weatherThresholds.js` | Constantes ES (`HEAT_STRESS_TEMP_C`, frío, UV, lluvia) para mensajes de confort en clima de actividad. |

#### `js/integrations/` (scripts clásicos en `index.html`)

| Archivo | Qué hace |
|---------|----------|
| `strava-auth.js` | OAuth Strava en cliente: URL de autorización, intercambio `code`→tokens, guardado en Firestore. Documenta riesgo del `client_secret` en frontend. |
| `strava-sync.js` | Importación masiva de actividades, enriquecimiento opcional con clima, deltas en `todayData.stravaAdjustments`, UI de progreso. Se dispara al entrar en inicio / tras login. |

#### `js/services/` (infra — módulos ES)

| Archivo | Qué hace |
|---------|----------|
| `strava-service.js` | Refresco de token Strava y `fetchStravaActivities` contra API v3; lee credenciales de `window` / `localStorage`. |
| `weather-service.js` | `getActivityWeatherContext`: clima horario (Open-Meteo u similar) para lat/lng y fecha de una actividad. |
| `daily-snapshot-persistence.js` | Claves `localStorage` por uid/fecha, escritura/lectura de snapshot diario y sync opcional a Firestore. |

#### `js/` (raíz)

| Archivo | Qué hace |
|---------|----------|
| `fittracker-modules-boot.js` | Punto de entrada **ES module**: importa core/controllers/services y asigna `window.__FITTRACKER_MODULES__` + evento `fittracker-modules-ready`. Puente entre módulos modernos y `fittracker-app.js` clásico. |

### 3.3. Orden de carga en `index.html`

**`<head>`:** CDNs (Tailwind, Firebase compat, Chart.js, SweetAlert2, jsPDF, html5-qrcode) → `js/config/strava-config.js` → `js/core/dynamic-diet-advice.js` → `js/fittracker-modules-boot.js` (type=`module`) → `css/fittracker.css` → `js/config/tailwind-theme.js`.

**Final del `<body>` (orden obligatorio):**

1. `datos/clima.js` → `datos/biologia.js` → `datos/alimentos.js`
2. `js/core/BioEngine.js` (usa `BIO_DATABASE`, `CLIMA_PETRER`, `USER_BIO`, `CLIMA_REAL`)
3. `js/app/fittracker-app.js` (`const ENGINE = new BioEngine()`)
4. `js/integrations/strava-auth.js` → `strava-sync.js`

**`tracker.html`:** CDNs (Chart.js, html2pdf, Firebase) en `<head>` → un único `<script>` al final con toda la lógica Tracker.

**`strava.html`:** solo Tailwind + Font Awesome; sin JS de aplicación.

### 3.4. Dependencias entre archivos (resumen)

| Capa | Archivos | Depende de |
|------|----------|------------|
| Vista | `index.html`, `tracker.html`, `strava.html` | CDNs + rutas locales |
| Datos | `datos/*.js` | Nada (globals) |
| Motor | `BioEngine.js` | `datos/*`, `USER_BIO` (runtime) |
| App | `fittracker-app.js` | `datos/*`, `BioEngine.js`, Firebase CDN |
| Módulos ES | `fittracker-modules-boot.js` → `js/core/*`, `controllers/*`, `services/*` | `index.html` (HTTP), Chart.js |
| Integración | `strava-auth.js`, `strava-sync.js` | Firebase + opcional `__FITTRACKER_MODULES__` |

### 3.5. Archivos que ya no están en el repo (histórico)

Tras el refactor TFG **no** uses estas rutas en documentación nueva:

- `proyecto(1).html` — monolito antiguo (eliminado).
- `js/data/foodDatabase.js`, `bioDatabase.js`, `clima.js` — renombrados/movidos a `datos/alimentos.js`, `biologia.js`, `clima.js`.
- `js/tracker.js` — sustituido por script inline en `tracker.html`.
- `js/services/firebase-config.js`, `auth-service.js`, `db-service.js` — Firebase FitTracker está en `fittracker-app.js`; Tracker en `tracker.html`.

---

## 3b. Strava e integración

- Configuración: `js/config/strava-config.js` (client ID; no publicar `client_secret` en repos abiertos).
- OAuth / callback: `js/integrations/strava-auth.js`, `strava.html`, pestaña Strava en `index.html`.
- Sincronización actividades: `js/integrations/strava-sync.js` + `js/services/strava-service.js` (vía módulos).
- UI avanzada (gráficas, panel pro, métricas): módulos en `js/core/` y `js/controllers/`, cargados por `fittracker-modules-boot.js`.
- La app clásica espera `window.__FITTRACKER_MODULES__` o el evento `fittracker-modules-ready` antes de usar APIs Strava.

---

## 4. Dependencias externas (CDN) y por qué

### 4.1. Firebase (compat CDN)

- Se usa Firebase compat CDN porque:  
- Permite usar Firebase desde HTML estático sin bundlers.  
- Encaja con GitHub Pages.  
- Proporciona Auth + Firestore en el cliente.  

Dónde se carga:  
- `index.html` (debe cargar `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`).  
- `tracker.html` (ya lo carga).  

Qué APIs se usan:  
- `firebase.initializeApp(config)`  
- `firebase.auth()`  
- `firebase.firestore()`  
- `auth.onAuthStateChanged(handler)`  
- `auth.signOut()`  
- `db.collection(...).doc(...).get()`  
- `db.collection(...).doc(...).set(..., { merge: true })`  
- `db.collection(...).doc(...).delete()`  

### 4.2. Chart.js

- Se usa Chart.js por CDN para representar métricas del tracker.  
- Se usa en `tracker.html` y se consume desde `tracker.html`.  

Gráficas:  
- Bar chart: % completado por hábito.  
- Line chart: hábitos completados por día.  

### 4.3. html2pdf.js

- Se usa html2pdf.js por CDN para exportar a PDF.  
- Se usa en `tracker.html`.  
- Se consume desde `tracker.html`.  

### 4.4. Font Awesome

- Se usa para iconografía del tracker (hábitos).  
- Se carga por CDN en `tracker.html`.  

---

## 5. Ejecución (runtime) y entorno

### 5.1. Por qué `file://` puede fallar

- ES Modules imponen políticas de seguridad diferentes.  
- Algunos navegadores bloquean imports relativos desde `file://`.  
- En GitHub Pages (HTTPS) funciona correctamente.  

### 5.2. Modo recomendado de ejecución

- GitHub Pages.  
- Servidor local tipo “Live Server” en Cursor/VSCode.  
- Cualquier servidor HTTP simple.  

### 5.3. Señales de que todo está bien

**FitTracker (`index.html`):**  
- Tras ~1,2 s desaparece el splash y aparece login o la app.  
- Consola sin `SyntaxError` en `fittracker-app.js` o `BioEngine.js`.  
- Evento `fittracker-modules-ready` (Strava) sin errores de import.  

**Tracker (`tracker.html`):**  
- Tabla de hábitos y dashboard Chart.js visibles con sesión activa.  
- Export PDF genera archivo.  

---

## 6. Modelo de datos (contratos de objetos)

Esta sección define “shapes” (esquemas) para entender qué se guarda y qué se calcula.  
La idea es que puedas leer cualquier función y entender qué espera.  

### 6.1. `HabitConfig`

- Archivo: `tracker.html`  
- Representa un hábito y su render.  

Campos:  
- `id: string`  
- `name: string`  
- `icon: string` (clase FontAwesome, ej `fa-fire`)  
- `color: string` (hex string, ej `#2ecc71`)  

### 6.2. `CurrentData`

- Archivo: `tracker.html`  
- Estructura: map habitId → array[7] boolean.  

Forma:  
- `currentData: Record<string, boolean[]>`  
- Donde el array representa de Lunes a Domingo.  

Ejemplo conceptual:  
- `currentData["habit_123"] = [true, false, false, true, true, false, false]`  

### 6.3. `HistoryRecord` (historial de semanas)

- Archivo: `tracker.html`  

Campos típicos:  
- `id: number` (Date.now)  
- `date: string` (rango “dd/mm/yyyy - dd/mm/yyyy”)  
- `weekId: string` (YYYY-MM-DD_YYYY-MM-DD)  
- `weekStart: string` (YYYY-MM-DD)  
- `weekEnd: string` (YYYY-MM-DD)  
- `score: number` (0..100)  
- `checks: number` (>= 0)  
- `data: CurrentData` (snapshot de la semana)  
- `habitsSnapshot: HabitConfig[]` (snapshot de hábitos usados esa semana)  

### 6.4. `TrackerSnapshot` (lo que se guarda en Firestore)

- Archivo: `tracker.html` — función `saveTrackerCloudSnapshot()`  
- Ruta: `usuarios/{uid}` campo `tracker`  

Campos:  
- `habitsConfig: HabitConfig[]`  
- `currentData: CurrentData`  
- `history: HistoryRecord[]`  
- `updatedAt: string` (ISO timestamp)  

### 6.5. `MICRO_DEFS` (definición de micronutrientes)

- Archivo: `datos/biologia.js`  

Forma:  
- `MICRO_DEFS: Record<string, { name, unit, base, desc, type }>`  

Campos:  
- `name: string` (nombre legible)  
- `unit: string` (µg, mg, g, etc.)  
- `base: number` (objetivo base)  
- `desc: string` (explicación)  
- `type: "fat" | "water" | "min"` (categoría)  

### 6.6. `foodDatabase` (catálogo de alimentos)

- Archivo: `datos/alimentos.js`  

Forma:  
- `foodDatabase: Record<string, FoodItem[]>`  

Donde:  
- `FoodItem` incluye macros y micros.  

Campos típicos de `FoodItem`:  
- `name: string`  
- `cal: number`  
- `prot: number`  
- `fat: number`  
- `sat: number`  
- `carb: number`  
- `weight: number` (porción base)  
- `micros: Record<string, number>` (claves de `MICRO_DEFS`)  

---

## 7. Tracker Pro (Hábitos) — explicación detallada

Esta sección es “operativa”: describe el flujo exacto de la UI, eventos y persistencia.  

### 7.1. Punto de entrada

- Archivo: `tracker.html`  
- Carga: bloque `<script>` al final de `tracker.html` (Firebase, hábitos, Chart.js, PDF).  

### 7.2. Inicialización Firebase (Tracker)

- Archivo: `tracker.html` (inicio del `<script>`).  
- `firebase.initializeApp(firebaseConfig)` si no hay app previa.  
- Variables globales del bloque: `auth`, `db`, `currentUser`.  

(FitTracker hace lo mismo en `js/app/fittracker-app.js`, líneas iniciales.)

### 7.3. Auth gate (acceso protegido)

- Archivo: `tracker.html` contiene `#auth-gate`.  
- El script inline decide mostrarlo u ocultarlo.  

Regla:  
- Si no hay usuario Firebase (`currentUser == null`), se bloquea la app.  

### 7.4. `onAuthStateChanged`

- Archivo: `tracker.html` — `auth.onAuthStateChanged(...)` directamente (sin wrapper en `services/`).  

En `tracker.html`:  
- Cuando se recibe `user`:  
- Se guarda en `currentUser`.  
- Se carga snapshot de nube.  
- Se hace fallback a localStorage.  

### 7.5. Carga de snapshot nube

- Archivo: `tracker.html` — dentro de `auth.onAuthStateChanged`, lectura de `usuarios/{uid}` y campo `tracker`.  

Qué hace:  
- Lee `usuarios/{uid}`.  
- Si existe campo `tracker`, hidrata `habitsConfig`, `currentData` e `history` (con fallback a `localStorage` con clave `trackerPro_{uid}_*`).  
- Si falla la red, sigue con datos locales.  

### 7.6. Fallback a localStorage

- Archivo: `tracker.html`  

Qué hace:  
- Si en nube no hay `habitsConfig`, intenta:  
- `localStorage.getItem(storageKey('habitsConfig'))`.  

### 7.7. Onboarding de hábitos

- UI: modal `#habit-onboarding-modal`.  
- Controlador: `openHabitEditor()`, `addHabitInputRow()`, `guardarMisHabitos()`.  

Reglas:  
- No se permite dejar 0 hábitos.  
- Si un hábito ya existía con ese nombre (case-insensitive), se reutiliza su config.  
- Si es nuevo, se genera `id` y se asigna icon/color por índice.  

### 7.8. Estado semanal (currentData)

- Función: `loadData()`  

Regla:  
- Para cada hábito configurado, debe existir un array boolean[7].  
- Si no existía en localStorage, se crea vacío.  
- Si existía (y coincide id), se preserva.  

### 7.9. Render tabla

- Función: `renderTable()`  

Pasos:  
- Calcula porcentajes diarios (por columna).  
- Construye `<thead>` con días y `%` por día.  
- Construye `<tbody>` con filas de hábitos.  
- Crea botones `.check-btn` con dataset: `data-habit-id`, `data-day`.  
- Bindea `click` a cada botón.  

Decisión de diseño:  
- Se usan listeners JS, no `onclick` inline.  
- Esto facilita test, refactor y control.  

### 7.10. Toggle de hábito (evento principal)

- Función: `toggleHabit(habitId, dayIndex, btnElement)`  

Qué hace:  
- Invierte el boolean en `currentData[habitId][dayIndex]`.  
- Aplica/remueve clase `.completed`.  
- Recalcula % del día.  
- Guarda `currentData` en localStorage.  
- Llama `saveTrackerCloudSnapshot()` para persistir nube.  
- Llama `updateDashboard()` para re-dibujar stats/gráficas.  

### 7.11. Cálculo de métricas (stats)

- Función: `calculateStats()`  

Definiciones:  
- `totalChecks`: suma de checks `true` en toda la matriz.  
- `possibleChecks = habitsCount * 7`.  
- `globalScore = round(totalChecks / possibleChecks * 100)`.  
- `barData[i]`: % completado por hábito `i`.  
- `lineData[d]`: cuántos hábitos completos en el día `d`.  

Notas:  
- Se redondea con `Math.round`.  
- Se limita a 0 si no hay hábitos.  

### 7.12. Dashboard y Chart.js

- Función: `updateDashboard()`  

Pasos:  
- Pinta `#score-display` y `#completed-display`.  
- Destruye charts previos si existen.  
- Crea chart bar.  
- Crea chart line con gradiente.  

Detalles de bar:  
- labels: nombres de hábitos.  
- data: `barData`.  
- colores: `habit.color` con alpha para background.  

Detalles de line:  
- labels: `days.map(d => d.substring(0,3))`.  
- data: `lineData`.  
- max y: `habitsConfig.length`.  

### 7.13. Reset semana

- Función: `resetCurrentWeek()`  

Qué hace:  
- Confirm dialog.  
- Borra `current` en localStorage.  
- Persiste snapshot nube.  
- Recarga estado y re-render.  

### 7.14. Finalizar semana y archivar

- Función: `saveWeekToHistory()`  

Qué hace:  
- Rechaza si `totalChecks == 0`.  
- Calcula la semana actual (Lunes → Domingo).  
- Construye `weekId` (YYYY-MM-DD_YYYY-MM-DD).  
- Inserta record al principio del history.  
- Guarda history en localStorage.  
- Borra current.  
- Prepara payload `fittracker_tracker_week_payload`.  
- Llama `syncWeekToFitTracker(db, uid, payload)`.  
- Persiste snapshot tracker nube.  
- Cambia a pestaña history.  

Motivo:  
- Mantener historial independiente de cambios futuros de hábitos.  
- Por eso se guarda `habitsSnapshot`.  

### 7.15. Historial UI

- Función: `renderHistory()`  

Qué hace:  
- Si no hay history: muestra mensaje.  
- Si hay: renderiza cards por semana.  
- Colorea badge según score:  
- >=80 success.  
- >=50 warning.  
- <50 danger.  
- Bindea botones: export y delete.  

### 7.16. Borrar record histórico

- Función: `deleteHistoryRecord(id)`  

Qué hace:  
- Confirm dialog.  
- Filtra record.  
- Guarda history actualizado.  
- Si record estaba enlazado en nube y hay sesión:  
- Borra `usuarios/{uid}/tracker_semanas/{weekId}`.  
- Limpia payload pending si coincide.  
- Persiste snapshot tracker nube.  
- Re-render history.  

### 7.17. Export PDF (actual)

- Función: `exportCurrentToPDF()`  
- Interna: `generatePDF(element, filename)`.  

Qué hace:  
- Activa clase `.pdf-mode`.  
- Oculta `.no-export`.  
- html2pdf exporta landscape A4.  
- Quita `.pdf-mode`.  

### 7.18. Export PDF (histórico)

- Función: `exportHistoryRecord(id)`  

Qué hace:  
- Busca record en history.  
- Guarda copias temporales de `currentData` y `habitsConfig`.  
- Reemplaza estado con record.  
- Re-render table y dashboard.  
- Cambia título export.  
- Exporta.  
- Restaura estado.  

Riesgos:  
- Si hay cambios en UI IDs, hay que ajustar.  
- Si el HTML cambia, el selector `.export-title` debe existir.  

---

## 8. Firestore — esquema, rutas y contratos

Esta sección explica exactamente qué se guarda, dónde y por qué.  

### 8.1. Colección `usuarios`

- Ruta: `usuarios/{uid}`  
- Documento por usuario autenticado.  

Campos relevantes:  
- `tracker`: snapshot de tracker (subobjeto).  
- (FitTracker nutri) puede guardar: `bio`, `historial`, etc.  

### 8.2. Campo `usuarios/{uid}.tracker`

Tipo: objeto.  
Campos:  
- `habitsConfig`  
- `currentData`  
- `history`  
- `updatedAt`  

### 8.3. Subcolección `tracker_semanas`

- Ruta: `usuarios/{uid}/tracker_semanas/{weekId}`  
- weekId = `YYYY-MM-DD_YYYY-MM-DD`  

Campos:  
- `weekId`  
- `weekStart`  
- `weekEnd`  
- `score`  
- `checks`  
- `habitsSnapshot`  
- `data`  
- `generatedAt`  
- `source: "tracker"`  
- `linkedToFitTrackerAt`  

Motivo:  
- Permite que FitTracker (nutrición) lea semanas archivadas del tracker.  
- Permite auditoría y sincronización cruzada.  

### 8.4. Consistencia de timestamps

- Algunas escrituras usan `serverTimestamp()` si está disponible.  
- Fallback: `new Date()` cuando no se puede.  

---

## 9. Core BioEngine — explicación de cálculos

Esta sección explica la lógica de `js/core/BioEngine.js` como si fuese un “módulo de dominio”.  
Nota: la implementación exacta puede variar según tu versión final, pero los conceptos son estos.  

### 9.1. Datos de entrada: `userBio`

Campos típicos:  
- `edad`  
- `genero` ("hombre"/"mujer")  
- `peso` (kg)  
- `altura` (cm)  
- `grasa` (%)  
- `masaMuscular` (kg)  
- `maxRunKm`  
- `maxGymTime`  
- `maxBikeKm`  

### 9.2. Selección de perfil biológico

- Método: `getBioProfile(age, gender)`  

Qué hace:  
- Selecciona el array correcto (`BIO_DATABASE.hombre` o `.mujer`).  
- Busca el rango cuyo `min <= age <= max`.  
- Si no encuentra, devuelve el último rango por defecto.  

Salida:  
- un objeto con:  
- `sleep` (rango horas)  
- `water` (base)  
- `meta` (factor metabólico)  
- `msg` (mensaje contextual)  

### 9.3. `recalculateBiologicalProfile(userBio)`

Qué calcula:  
- `sleepNeed` desde el perfil.  
- `recoveryFactor` que depende de edad y masa muscular.  

Idea:  
- A mayor edad, menor recuperación.  
- Más masa muscular aumenta resiliencia.  

### 9.4. `getBMR(userBio)`

Base: fórmula tipo Mifflin-St Jeor.  

Pasos:  
- `base = 10*peso + 6.25*altura - 5*edad + sexoConst`.  
- sexoConst: +5 hombre, -161 mujer.  
- Ajuste por músculo (si aplica).  
- Ajuste metabólico por edad: multiplicar por `profile.meta`.  

Salida:  
- BMR estimado (kcal/día).  

### 9.5. `getClimateStress({ climaReal })`

Objetivo:  
- Ajustar hidratación y fatiga según temperatura.  

Dataset fallback:  
- `CLIMA_PETRER[month]`.  

Si hay climaReal:  
- usa `climaReal.temp` y `climaReal.icon`.  

Reglas:  
- Si temp > 25:  
- `waterFactor += (temp - 25)*0.05`.  
- `thermalFatigue = 10`.  
- Si temp < 15:  
- `termogenesisKcal = 100`.  

Salida:  
- `waterFactor`  
- `termogenesisKcal`  
- `thermalFatigue`  
- `temp`  
- `icon`  

### 9.6. `analyzeBodyComposition(userBio)`

Objetivo:  
- Diagnóstico orientativo (no clínico).  

Cálculos:  
- `heightM = altura/100`.  
- `bmi = peso / (heightM^2)`.  

Categorías IMC:  
- <18.5 bajo peso.  
- <25 normopeso.  
- <30 sobrepeso.  
- <35 obesidad I.  
- <40 obesidad II.  
- >=40 obesidad III.  

Categorías grasa (según sexo):  
- hombre saludable 10..20.  
- mujer saludable 18..28.  

Excepción muscular:  
- Si IMC alto pero grasa saludable y ratio músculo alto y fitnessLevel alto.  

Salida típica:  
- `bmi`  
- `bmiCategory`  
- `fatCategory`  
- `fitnessLevel`  
- `alertLevel` (none/warning/danger)  
- `status`  
- `advice`  

---

## 10. Data — bases de datos y su mantenimiento

### 10.1. `foodDatabase` (mantenimiento)

Buenas prácticas:  
- Añadir items con estructura consistente.  
- Mantener claves de micros alineadas con `MICRO_DEFS`.  
- Evitar duplicados de nombres.  
- Usar categorías claras.  

### 10.2. `MICRO_DEFS` (mantenimiento)

Buenas prácticas:  
- No cambiar keys si ya hay alimentos que las usan.  
- Si necesitas renombrar, haz migración.  
- Mantener `base` razonable y documentado.  

### 10.3. `BIO_DATABASE` (mantenimiento)

Buenas prácticas:  
- Mantener rangos sin solapamientos.  
- Mantener `meta` dentro de un rango razonable.  
- Documentar “por qué” de cada ajuste.  

---

## 11. Services — patrón de uso y extensión

### 11.1. Principio “services no UI”

- `services/` solo habla con infraestructura.  
- No hace `alert`, no toca DOM.  
- Devuelve datos o booleanos.  

### 11.2. Añadir una nueva operación Firestore

Proceso recomendado:  
- Definir la ruta Firestore exacta.  
- Definir “shape” del documento.  
- Implementar en `js/services/` (módulos ES) o en `fittracker-app.js` / `tracker.html` según la app.  
- Consumir desde controlador.  
- Renderizar desde controlador.  

### 11.3. Gestión de errores

Regla:  
- Services loguean error a consola.  
- Controlador decide cómo notificar (si hace falta).  

---

## 12. Controladores — patrón de UI y extensiones

### 12.1. Convención de “selectors”

- Agrupar `document.getElementById` en un objeto `els`.  
- Usar funciones `() => element` para evitar referencias stale.  
- Evitar querySelector repetitivo.  

### 12.2. Convención de “estado”

- Estado de sesión en variables del módulo.  
- Persistencia en localStorage y/o Firestore.  
- Render reacciona al estado (no al revés).  

### 12.3. Re-render: cuándo y por qué

- Cambia estado → guarda → render UI derivada.  
- En tracker: toggle → save local/cloud → update dashboard.  

---

## 13. Navegación entre apps (FitTracker ↔ Tracker)

Páginas:  
- `index.html` (FitTracker)  
- `tracker.html` (Tracker Pro)  

Regla:  
- Tracker requiere login previo en FitTracker.  
- Si no hay sesión: gate + botón para volver.  

---

## 14. Seguridad y privacidad (cliente + Firestore)

### 14.1. Dónde vive la “seguridad real”

- En Firebase Security Rules (servidor).  
- El cliente solo “pide” operaciones.  

### 14.2. Datos en localStorage

Riesgos:  
- Si otro usuario usa el mismo navegador, puede ver datos locales.  
- Mitigación: namespacing por uid y opción de “logout + limpiar”.  

### 14.3. Recomendación

- Definir reglas Firestore:  
- cada usuario solo puede leer/escribir su doc `usuarios/{uid}`.  
- y sus subcolecciones.  

---

## 15. Guía de troubleshooting (problemas típicos)

### 15.1. “No funciona al abrir con doble clic”

- Causa: `file://` bloquea ES Modules.  
- Solución: abrir con servidor HTTP (GitHub Pages o Live Server).  

### 15.2. “Firebase SDK no está cargado”

- Causa: faltan `<script src>` compat en el HTML.  
- Solución: revisar `index.html` / `tracker.html`.  

### 15.3. “No aparecen hábitos”

- Causa: usuario no logueado.  
- Revisar: auth gate visible.  
- Solución: login en FitTracker.  

### 15.4. “Las gráficas no se ven”

- Causa: Chart.js no cargó o canvas no existe.  
- Solución: comprobar CDN Chart.js y ids `barChart`, `lineChart`.  

### 15.5. “PDF sale en blanco”

- Causa: html2pdf no cargó o se exporta un elemento incorrecto.  
- Solución: comprobar CDN html2pdf y `#pdf-export-zone`.  

---

## 16. Checklist de calidad TFG

Arquitectura:  
- [ ] `index.html` sin monolito inline (lógica en `js/app/` + `datos/`).  
- [ ] Catálogos en `datos/` (`alimentos.js`, `biologia.js`, `clima.js`).  
- [ ] `BioEngine.js` sin DOM.  
- [ ] `js/services/` (ES) sin renderizado directo.  
- [ ] `fittracker-app.js` orquesta UI; Strava vía `__FITTRACKER_MODULES__`.  
- [ ] `tracker.html` documentado como excepción (script inline acotado a hábitos).  

Código:  
- [ ] Nombres coherentes.  
- [ ] Funciones pequeñas.  
- [ ] Estado controlado.  
- [ ] Sin duplicación innecesaria.  

Persistencia:  
- [ ] LocalStorage namespaced por usuario.  
- [ ] Firestore con rutas claras.  
- [ ] Reglas de seguridad definidas.  

Documentación:  
- [ ] Sección 3.1–3.2 documenta **todos** los archivos del árbol.  
- [ ] Explica flujos.  
- [ ] Explica cálculos.  
- [ ] Explica Firestore.  

---

## 17. Índice de referencia rápida (archivo → buscar aquí)

Lista completa con descripción de cada archivo: **sección 3.2**.

| Tema | Dónde mirar |
|------|-------------|
| Entrada FitTracker | `index.html` |
| App principal + Firebase FitTracker | `js/app/fittracker-app.js` |
| Catálogo alimentos | `datos/alimentos.js` (`foodDatabase`) |
| Biología + micros | `datos/biologia.js` (`BIO_DATABASE`, `MICRO_DEFS`) |
| Clima fallback | `datos/clima.js` (`CLIMA_PETRER`) |
| Motor biológico | `js/core/BioEngine.js` |
| Módulos Strava / snapshot | `js/fittracker-modules-boot.js` → `window.__FITTRACKER_MODULES__` |
| OAuth Strava | `js/integrations/strava-auth.js`, `js/config/strava-config.js` |
| Tracker hábitos + Firestore `tracker` | `tracker.html` (script final) |
| Tracker UI | `tracker.html` |
| Estilos FitTracker | `css/fittracker.css` |
| Mapa TFG corto | `ESTRUCTURA-TFG.md` |

---

## 18. Apéndice A — Glosario

- ES Modules: módulos JavaScript nativos (`import`/`export`).  
- Controller: capa que toca DOM y orquesta.  
- Core/Dominio: lógica pura.  
- Service: adaptador a infraestructura (Firebase).  
- Dataset: colección de datos estáticos (catálogos).  
- Snapshot: estado serializable guardado en nube/local.  
- WeekId: id determinista de semana (YYYY-MM-DD_YYYY-MM-DD).  

---

## 19. Apéndice B — Plantilla para documentar nuevas funciones

Usa esta plantilla cuando añadas algo nuevo:  

Nombre de función:  
Archivo:  
Responsabilidad:  
Inputs:  
Outputs:  
Side effects:  
Persistencia:  
Errores y manejo:  
Notas de UI:  
Test manual sugerido:  

---

## 20. Apéndice C — Catálogo Explicativo y Documentación Extendida

Esta sección existe para expandir la documentación de FitTracker a un nivel de manual de usuario y guía de arquitectura profunda. A continuación, se detalla el comportamiento del sistema por categoría de alimento, micronutriente, caso de uso y reglas de negocio del `BioEngine`.

### 20.1. Catálogo Explicativo: Categorías de Alimentos

El sistema agrupa los alimentos no solo por sus macros, sino por su impacto metabólico en el `BioEngine`. Las siguientes categorías definen cómo la aplicación interpreta lo que el usuario consume:

#### 20.1.1. Proteínas Magras
- **Definición**: Alimentos con alta densidad proteica y baja cantidad de grasas (especialmente saturadas) y carbohidratos. Ejemplos: Pechuga de pollo, pavo, pescado blanco, claras de huevo, tofu.
- **Impacto en BioEngine**: Generan un alto efecto termogénico (TEF). El motor calcula que aproximadamente el 20-30% de las calorías provenientes de estas fuentes se gastan en su propia digestión.
- **Uso en el Tracker**: Recomendado para estados de "Corte" (pérdida de grasa) donde se busca preservar la masa muscular sin exceder el límite calórico.

#### 20.1.2. Proteínas Grasas (Ricas en Omega-3)
- **Definición**: Fuentes de proteína que incluyen un alto perfil de grasas saludables. Ejemplos: Salmón, atún rojo, huevos enteros, cortes de carne roja alimentada con pasto.
- **Impacto en BioEngine**: Aportan saciedad prolongada. El motor ajusta la curva de energía diaria, evitando los picos de insulina. Son cruciales para la absorción de vitaminas liposolubles.
- **Uso en el Tracker**: Monitoreo estricto para no pasarse de las macros de grasa diaria, pero esenciales para la recuperación articular si el usuario importa entrenamientos largos desde Strava.

#### 20.1.3. Carbohidratos Complejos (Bajo Índice Glucémico)
- **Definición**: Alimentos ricos en almidones y fibra que se digieren lentamente. Ejemplos: Avena, arroz integral, boniato, quinoa, legumbres.
- **Impacto en BioEngine**: Proporcionan una liberación sostenida de glucógeno. El motor los prioriza en los días de alto gasto energético (cuando el factor multiplicador de actividad es > 1.5).
- **Uso en el Tracker**: Base energética del usuario. Si hay déficit de estos y el nivel de actividad es alto, el sistema lanza una alerta de "Riesgo de fatiga muscular".

#### 20.1.4. Carbohidratos Simples (Alto Índice Glucémico)
- **Definición**: Azúcares de rápida absorción. Ejemplos: Frutas muy maduras, miel, dextrosa, geles deportivos.
- **Impacto en BioEngine**: Pico rápido de glucosa en sangre. 
- **Uso en el Tracker**: El sistema solo los justifica de manera óptima si se consumen en la ventana "peri-entrenamiento" (antes, durante o justo después de una actividad cardiovascular intensa registrada).

#### 20.1.5. Grasas Saludables y Frutos Secos
- **Definición**: Fuentes de lípidos puros. Ejemplos: Aceite de oliva virgen extra, aguacate, almendras, nueces.
- **Impacto en BioEngine**: Esenciales para la regulación hormonal (testosterona, estrógenos). El motor requiere un mínimo de 0.8g a 1g de grasa por kg de peso corporal.
- **Uso en el Tracker**: Si el usuario registra menos del umbral mínimo de grasas durante 3 días seguidos, el Tracker Pro marca un mal hábito y sugiere ingesta urgente.

### 20.2. Catálogo Explicativo: Micronutrientes y su rol en FitTracker

El archivo `datos/alimentos.js` almacena los micronutrientes, pero el porqué se rastrean está definido por las siguientes reglas biológicas que el sistema monitorea.

#### 20.2.1. Minerales Electrolíticos
1. **Sodio (Na)**: 
   - *Rol*: Equilibrio de fluidos y contracción muscular.
   - *Lógica*: Si el usuario realiza entrenamientos con temperaturas altas (detectadas por el módulo de clima) o de más de 90 minutos, el límite recomendado de sodio sube automáticamente de 2000mg a 3500mg+ para compensar la pérdida por sudor.
2. **Potasio (K)**:
   - *Rol*: Evita calambres y equilibra el sodio.
   - *Lógica*: Se requiere un ratio aproximado de 2:1 a favor del potasio frente al sodio. El tracker mostrará advertencias si la dieta es demasiado rica en sodio procesado y pobre en vegetales ricos en potasio.
3. **Magnesio (Mg)**:
   - *Rol*: Relajación del sistema nervioso y más de 300 reacciones enzimáticas.
   - *Lógica*: Un marcador de "calidad de sueño" en el Tracker Pro se correlaciona directamente con alcanzar el 100% de la CDR de magnesio diario.

#### 20.2.2. Vitaminas Liposolubles (Acumulativas)
Estas vitaminas (A, D, E, K) se almacenan en el tejido adiposo.
- **Vitamina D**: Crucial para la absorción de calcio. El `BioEngine` la exige en mayor cantidad durante los meses de invierno (si la fecha actual es entre noviembre y marzo en el hemisferio norte) asumiendo menor exposición solar.
- **Riesgo de Toxicidad**: A diferencia de otras métricas, si el usuario supera el 400% de la CDR diaria durante más de una semana consecutiva, el sistema no lo marca en verde, sino en rojo (alerta de hipervitaminosis).

#### 20.2.3. Vitaminas Hidrosolubles (De purga diaria)
- **Vitamina C y Complejo B (B1, B2, B3, B6, B12)**: 
- *Lógica*: Al no almacenarse de forma eficiente en el cuerpo, el Tracker exige que la ingesta sea diaria. Un déficit de Vitamina B12 (común si el usuario marca "Dieta Vegana" en su configuración) activará una sugerencia de suplementación o de consumo de levadura nutricional.

### 20.3. Casos de Uso y Flujos de la Plataforma

Esta sección documenta los principales "User Journeys" (viajes del usuario) diseñados en la plataforma, explicando cómo la UI y los módulos interactúan.

#### Caso de Uso 1: El usuario busca "Recomposición Corporal" (Ganar músculo, perder grasa)
- **Contexto**: El usuario introduce en `index.html` un % de grasa alto (ej. 25%) pero indica un nivel de actividad alto.
- **Acción del Sistema**: El `BioEngine` no aplica un déficit calórico agresivo. En su lugar, aplica un déficit ligero (-300 kcal) pero sube el requerimiento de proteínas a 2.2g por kg de peso magro.
- **Tracker**: El `tracker.html` pondrá como hábito prioritario "Llegar al objetivo de proteína" y "Entrenamiento de fuerza", penalizando severamente si se falla en esos dos días seguidos.

#### Caso de Uso 2: Atleta de Resistencia (Integración con Strava)
- **Contexto**: El usuario conecta la app con Strava y sincroniza una tirada larga (ej. correr 20km).
- **Acción del Sistema**: Se inyectan de repente 1500 kcal extra quemadas en el día. 
- **Tracker**: El sistema automáticamente recalcula las macros del día. Si el usuario no ingiere los carbohidratos necesarios para reponer ese glucógeno, el PDF de la semana reflejará una "Deuda de recuperación".

#### Caso de Uso 3: Modo Offline / Pérdida de Conexión
- **Contexto**: El usuario está de viaje sin datos y abre `tracker.html`.
- **Acción del Sistema**: Si falla Firestore, `tracker.html` sigue guardando en `localStorage` (`trackerPro_{uid}_*`) y reintenta con `saveTrackerCloudSnapshot()` al recuperar red.
- **Tracker**: El usuario sigue marcando sus hábitos. La UI muestra un icono de "Pendiente de Sincronización". Cuando se recupera la conexión, se envían los datos con `merge: true` a Firestore.

#### Caso de Uso 4: Auditoría de Progreso Mensual (Exportación PDF)
- **Contexto**: Un entrenador personal le pide al usuario su reporte del mes.
- **Acción del Sistema**: El usuario va a la vista mensual del tracker y pulsa "Exportar PDF".
- **Tracker**: Se invoca a `html2pdf`. El DOM cambia temporalmente añadiendo clases específicas de impresión (ocultando botones, expandiendo las gráficas de Chart.js) y renderiza un documento A4 horizontal con todo el historial inmutable de Firestore.

### 20.4. Reglas de Arquitectura y Patrones de Diseño Extendido

Para asegurar que este proyecto siga siendo mantenible a medida que crece a miles de líneas de código, es obligatorio seguir estas premisas:

1. **Principio de Responsabilidad Única (SRP) en UI**: 
   - `index.html` NUNCA debe modificar datos de hábitos.
   - `tracker.html` NUNCA debe modificar el `foodDatabase`.
   - Se comunican únicamente mediante los snapshots guardados en Firebase Firestore.
2. **Inmutabilidad de Datos Base**: 
   - Las constantes `BIO_DATABASE` y `foodDatabase` (en `datos/`) son inmutables en tiempo de ejecución en el repo. Si el usuario crea un alimento personalizado, debe persistirse en Firestore (`usuarios/{uid}` u otra ruta acordada), no editando `datos/alimentos.js` en producción.
3. **Manejo de Tiempos y Zonas Horarias**:
   - Todo se calcula usando la fecha local del navegador (`new Date()`) pero al guardarse en Firebase, se estampa un ISO string UTC. El cálculo del "Lunes a Domingo" (WeekId) usa una función compartida en `core/` para que no haya desajustes si el usuario viaja.
4. **Sanitización y Seguridad sin Backend**:
   - Puesto que no hay backend (Node.js/Express) que valide los datos antes de insertarlos, la validación descansa en dos pilares:
     - *Client-side*: Los módulos de `core/` escupen `NaN` o errores genéricos si reciben inputs malformados (ej: peso negativo).
     - *Firebase Security Rules*: Firestore bloquea escrituras donde el `uid` del documento no coincida con el `request.auth.uid`.

### 20.5. Glosario Técnico de Variables y Claves de Almacenamiento

Para depuración rápida, este es el glosario de cómo se nombran las variables en el LocalStorage y en la base de datos de la nube:

- `fittracker_theme_pref`: Guarda 'light' o 'dark'.
- `fittracker_habits_${uid}`: Respaldo local de la configuración de hábitos.
- `fittracker_week_${weekId}`: El estado booleano de la semana actual.
- `firestore -> usuarios -> {uid} -> tracker`: El objeto maestro en la nube que contiene `currentData` e `history`.
- `firestore -> usuarios -> {uid} -> tracker_semanas -> {weekId}`: Archivo histórico de una semana ya finalizada (inmutable).

---
*Fin de la expansión. Esta documentación cubre a fondo el dominio del negocio, proveyendo contexto valioso para cualquier desarrollador futuro o LLM que analice este repositorio.*

