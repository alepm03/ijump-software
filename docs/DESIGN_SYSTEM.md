# Sistema de Diseño — iJump Operational System

> Sistema de diseño normativo para el CRM/manifiesto operativo de iJump Skydive, concebido para escalar a otros centros de paracaidismo (white-label).
> Versión: v1 · Fecha: 2026-06-17 · Owner: Dirección de Diseño (Edrai Solutions)

Este documento es la **única fuente de verdad** de tokens, escalas y patrones de UI. Toda nueva pantalla debe ajustarse a él. Reemplaza y formaliza las reglas dispersas en `CLAUDE.md` y `docs/REDESIGN.md`, que quedan como contexto histórico.

**Stack de referencia (no se cambia):** Next.js 16, React 19, Tailwind CSS v4 (config CSS-native vía `@theme inline` en `src/app/globals.css`, sin `tailwind.config.ts`), shadcn/ui preset `base-nova` sobre Base UI, lucide-react, next-themes (instalado, dark mode no cableado), sonner, dnd-kit. Fuente: Inter.

---

## 0. Cómo leer este documento

- **Tokens** = variables CSS en `:root` dentro de `globals.css`. Se exponen a Tailwind v4 vía `@theme inline` con un alias `--color-*`.
- **Regla de oro:** ningún color, tamaño de fuente, radio o sombra se escribe como literal en un componente. Todo pasa por un token. Si un valor no tiene token, primero se crea el token aquí.
- Los valores OKLCH siguen el formato `oklch(L C H)` con `L` luminancia 0–1, `C` croma, `H` matiz en grados. El matiz cálido del sistema es **55** (neutros) y **42** (naranja de marca).

---

## 1. Principios de diseño

Cinco principios, ordenados por prioridad para una herramienta de operaciones de drop zone (DZ) usada en campo.

### P1 — Legibilidad a pleno sol antes que estética
La tablet se usa en el aeródromo bajo luz solar directa. El contraste es un requisito funcional, no una preferencia. Por eso el sistema es **light-first de alto contraste**: fondos casi blancos, texto casi negro (contraste AAA en cuerpo), y colores de estado saturados sobre tints muy claros. El brillo de pantalla en exterior aplana las diferencias sutiles de luminancia; cualquier par texto/fondo crítico debe superar **7:1** (AAA), no solo 4.5:1.
**Implicación:** el modo oscuro NO es la solución para el sol (un tema oscuro empeora la legibilidad con reflejos en exterior). Ver §4.

### P2 — Densidad informativa deliberada
Es una herramienta de operaciones, no una landing. La fila de participante empaqueta ~10 campos editables y eso es correcto. La densidad se gestiona con **jerarquía tipográfica y color**, no con aire. El espaciado es ajustado (escala de 4px), las alturas de control son compactas (24–32px), y se prioriza ver una jornada completa sin scroll sobre el confort de una landing.

### P3 — La acción más rápida gana
El staff no puede perder tiempo con la UI durante una jornada. Edición inline en todas partes, hit targets generosos pese a la densidad (§5.6), feedback inmediato (optimista + `sonner`). Cada estado de participante se cambia en **un tap**, no en un formulario.

### P4 — El estado se lee de un vistazo, por color y forma
En operación, el operador escanea, no lee. Los estados (participante, pago, clima) se codifican con un **sistema de color semántico consistente** (mismo verde = completado/pagado en todo el producto) reforzado con texto (nunca solo color, por daltonismo y por sol). Los badges son píldoras de bajo peso visual que no compiten con los datos.

### P5 — Temable desde el día uno
El producto se venderá a otras DZ. La marca (naranja iJump) vive en un puñado de tokens aislados. Cambiar de cliente = cambiar ~6 tokens, no tocar componentes. Los colores de estado/dominio son **estructurales** (no de marca) y se comparten entre clientes. Ver §8.

---

## 2. Paleta de color semántica (OKLCH)

### 2.1 Estado actual (auditoría)

`globals.css` ya define una base sólida en OKLCH (matiz 55 cálido, primary naranja `oklch(0.640 0.175 42)`, `--radius 0.5rem`). El problema **no** son los tokens base, sino que **los colores de dominio están hardcodeados en hex** dentro de los componentes y desconectados del tema:

- `ParticipantRow.tsx`: `STATUS_CONFIG`, `PACKAGE_CONFIG`, `STAGE_COLORS`, `getPaymentStatus`, checklist y badge "OW" usan hex inline (`#ECFDF5`/`#059669`, `#EEF2FF`/`#6366F1`, etc.).
- `DayCard.tsx`: `WEATHER_CONFIG` usa hex; el hover reescribe `boxShadow` con un OKLCH literal vía JS.

Estos hex se migran a tokens. Los valores propuestos abajo **conservan los hex actuales** (convertidos a OKLCH para coherencia con el resto del tema), de modo que la migración es visualmente neutra y de bajo riesgo.

### 2.2 Tokens base (ya existen — se mantienen)

Sin cambios respecto a `globals.css` actual:

```css
--background:           oklch(0.985 0.006 55);
--foreground:           oklch(0.175 0.015 55);
--card:                 oklch(0.999 0.002 55);
--card-foreground:      oklch(0.175 0.015 55);
--popover:              oklch(0.999 0.002 55);
--popover-foreground:   oklch(0.175 0.015 55);
--primary:              oklch(0.640 0.175 42);   /* naranja de marca */
--primary-foreground:   oklch(0.998 0.002 55);
--secondary:            oklch(0.957 0.038 55);   /* tint naranja muy claro */
--secondary-foreground: oklch(0.640 0.175 42);
--muted:                oklch(0.960 0.006 55);
--muted-foreground:     oklch(0.480 0.012 55);
--accent:               oklch(0.957 0.038 55);
--accent-foreground:    oklch(0.640 0.175 42);
--destructive:          oklch(0.560 0.220 27);
--border:               oklch(0.912 0.009 55);
--input:                oklch(0.912 0.009 55);
--ring:                 oklch(0.640 0.175 42);
--radius:               0.5rem;
```

**Adición recomendada** (faltan dos peldaños de neutro útiles para la densidad alta):

```css
--border-strong:        oklch(0.860 0.012 55);   /* divisores internos de fila/tarjeta */
--foreground-subtle:    oklch(0.700 0.008 55);   /* placeholders, texto deshabilitado */
--primary-hover:        oklch(0.600 0.180 42);    /* hover sólido de CTA, hoy se usa /90 */
```

### 2.3 Tokens de estado semánticos (NUEVOS — el núcleo del sistema)

Patrón uniforme: cada estado tiene un par `--{token}` (color de texto/icono, saturado) y `--{token}-bg` (tint de fondo, muy claro). Esto reproduce exactamente el patrón `{ color, bg }` que ya usa `ParticipantRow`, pero centralizado.

Se definen **6 familias cromáticas** y los estados de dominio se mapean a ellas (no inventamos un color por estado: agrupamos por significado). Esto es clave para el white-label: las familias son fijas, el mapeo dominio→familia es estable.

| Familia | Significado | Texto (OKLCH) | Fondo `-bg` (OKLCH) | hex origen |
|---|---|---|---|---|
| `neutral` | inactivo / por hacer | `oklch(0.520 0.010 60)` | `oklch(0.968 0.004 60)` | `#71717A` / `#F4F4F5` |
| `info` (azul) | en curso / check-in | `oklch(0.580 0.180 256)` | `oklch(0.970 0.025 256)` | `#3B82F6` / `#EFF6FF` |
| `accent2` (índigo) | reserva / video ext. | `oklch(0.560 0.190 277)` | `oklch(0.965 0.025 277)` | `#6366F1` / `#EEF2FF` |
| `purple` | waiver / documental | `oklch(0.530 0.230 304)` | `oklch(0.970 0.025 312)` | `#9333EA` / `#FAF5FF` |
| `warning` (ámbar) | atención / marginal | `oklch(0.620 0.150 80)` | `oklch(0.975 0.040 95)` | `#CA8A04` / `#FEFCE8` |
| `brand` (naranja) | equipado / suplemento | `oklch(0.640 0.175 42)` | `oklch(0.962 0.038 55)` | `#EA580C` / `#FFF7ED` |
| `success` (verde) | listo / pagado / OK | `oklch(0.560 0.130 158)` | `oklch(0.965 0.030 162)` | `#059669` / `#ECFDF5` |
| `danger` (rojo) | cancelado / no-show | `oklch(0.560 0.200 18)` | `oklch(0.970 0.025 18)` | `#E11D48` / `#FFF1F2` |
| `teal` | fotos (add-on) | `oklch(0.560 0.090 185)` | `oklch(0.965 0.030 185)` | `#0D9488` / `#F0FDFA` |

**Tokens CSS de las familias:**

```css
--state-neutral:     oklch(0.520 0.010 60);   --state-neutral-bg:  oklch(0.968 0.004 60);
--state-info:        oklch(0.580 0.180 256);  --state-info-bg:     oklch(0.970 0.025 256);
--state-accent2:     oklch(0.560 0.190 277);  --state-accent2-bg:  oklch(0.965 0.025 277);
--state-purple:      oklch(0.530 0.230 304);  --state-purple-bg:   oklch(0.970 0.025 312);
--state-warning:     oklch(0.620 0.150 80);   --state-warning-bg:  oklch(0.975 0.040 95);
--state-brand:       oklch(0.640 0.175 42);   --state-brand-bg:    oklch(0.962 0.038 55);
--state-success:     oklch(0.560 0.130 158);  --state-success-bg:  oklch(0.965 0.030 162);
--state-danger:      oklch(0.560 0.200 18);   --state-danger-bg:   oklch(0.970 0.025 18);
--state-teal:        oklch(0.560 0.090 185);  --state-teal-bg:     oklch(0.965 0.030 185);
```

### 2.4 Mapeo dominio → familia (alias semánticos)

Para que el código lea el dominio (`--status-completed`) y no la familia (`--state-success`), se definen **alias** que apuntan a las familias. Así el componente nunca conoce el color, solo el significado, y un cambio de criterio se hace en una línea.

```css
/* OperationalStatus */
--status-pending:            var(--state-neutral);   --status-pending-bg:            var(--state-neutral-bg);
--status-checked-in:         var(--state-info);      --status-checked-in-bg:         var(--state-info-bg);
--status-waiver-signed:      var(--state-purple);    --status-waiver-signed-bg:      var(--state-purple-bg);
--status-briefed:            var(--state-warning);   --status-briefed-bg:            var(--state-warning-bg);
--status-geared-up:          var(--state-brand);     --status-geared-up-bg:          var(--state-brand-bg);
--status-ready:              var(--state-success);   --status-ready-bg:              var(--state-success-bg);
--status-completed:          var(--state-success);   --status-completed-bg:          var(--state-success-bg);
--status-cancelled:          var(--state-danger);    --status-cancelled-bg:          var(--state-danger-bg);
--status-no-show:            var(--state-danger);    --status-no-show-bg:            var(--state-danger-bg);
--status-weather-cancelled:  var(--state-danger);    --status-weather-cancelled-bg:  var(--state-danger-bg);

/* PackageType */
--package-solo:            var(--state-neutral);   --package-solo-bg:            var(--state-neutral-bg);
--package-handycam:        var(--state-info);      --package-handycam-bg:        var(--state-info-bg);
--package-video-externo:   var(--state-accent2);   --package-video-externo-bg:   var(--state-accent2-bg);
--package-fotos:           var(--state-teal);      --package-fotos-bg:           var(--state-teal-bg);
--package-handycam-fotos:  var(--state-info);      --package-handycam-fotos-bg:  var(--state-info-bg);

/* PaymentStage / estado de pago */
--pay-reserva:       var(--state-accent2);   --pay-reserva-bg:       var(--state-accent2-bg);
--pay-liquidacion:   var(--state-success);   --pay-liquidacion-bg:   var(--state-success-bg);
--pay-suplemento:    var(--state-brand);     --pay-suplemento-bg:    var(--state-brand-bg);
--pay-paid:          var(--state-success);   --pay-paid-bg:          var(--state-success-bg);
--pay-reserved:      var(--state-accent2);   --pay-reserved-bg:      var(--state-accent2-bg);

/* WeatherStatus de jornada */
--weather-ok:        var(--state-success);   --weather-ok-bg:        var(--state-success-bg);
--weather-marginal:  var(--state-warning);   --weather-marginal-bg:  var(--state-warning-bg);
--weather-cancelled: var(--state-danger);    --weather-cancelled-bg: var(--state-danger-bg);
```

### 2.5 Exposición a Tailwind v4

Cada token que se use con utilidades (`bg-*`, `text-*`) necesita su alias `--color-*` en el bloque `@theme inline` de `globals.css`. Patrón:

```css
@theme inline {
  /* ...los existentes... */
  --color-status-completed:    var(--status-completed);
  --color-status-completed-bg: var(--status-completed-bg);
  --color-state-success:       var(--state-success);
  --color-state-success-bg:    var(--state-success-bg);
  /* etc. — uno por token de estado usado en clases */
  --color-border-strong:       var(--border-strong);
  --color-foreground-subtle:   var(--foreground-subtle);
}
```

Tras esto, en JSX: `className="bg-status-completed-bg text-status-completed"` en lugar de `style={{ background: '#ECFDF5', color: '#059669' }}`.

> **Tip de implementación para configs tipo `STATUS_CONFIG`:** en vez de un objeto `{ bg, color }` con hex, usar un mapa a **nombres de clase** Tailwind (`{ className: 'bg-status-completed-bg text-status-completed' }`). Mantiene la tabla de mapeo en un único sitio, conserva la firma del componente y elimina los `style` inline. Si se prefiere mantener `style`, usar `style={{ background: 'var(--status-completed-bg)', color: 'var(--status-completed)' }}`.

---

## 3. Escala tipográfica

### 3.1 Problema

Hay **~14 tamaños arbitrarios** repartidos por el código: `text-[9.5px]`, `text-[10px]`, `text-[11px]`, `text-[11.5px]`, `text-[12px]`, `text-[12.5px]`, `text-[13px]`, `text-[13.5px]`, `text-[14px]`, `text-[15px]`, `text-[16px]`, `text-[22px]`, más `letter-spacing` inline sueltos. Imposible de mantener y de tematizar.

### 3.2 Escala nombrada (6 pasos + 1 micro)

Inter, base 16px. Se define una escala de **densidad operativa** (más compacta que una web estándar). Cada paso es un token y una utilidad Tailwind.

| Token | px / rem | line-height | letter-spacing | Peso típico | Uso |
|---|---|---|---|---|---|
| `--text-display` | 22px / 1.375rem | 1.15 | -0.02em | 600 | Título de mes en calendario, cabeceras de página |
| `--text-title` | 16px / 1rem | 1.25 | -0.01em | 600 | Título de sheet/dialog, nombre de cliente en ficha |
| `--text-body` | 14px / 0.875rem | 1.4 | 0 | 400–500 | Texto base, inputs, contenido de celdas no comprimidas |
| `--text-sm` | 13px / 0.8125rem | 1.35 | -0.005em | 400–600 | Datos densos de fila (nombre, métricas de DayCard) |
| `--text-xs` | 11.5px / 0.71875rem | 1.3 | 0 | 500–700 | Badges, etiquetas de campo, instructor select |
| `--text-2xs` | 10px / 0.625rem | 1.2 | 0 | 600–700 | Badges micro (weather en calendario, "OW") |
| `--text-micro` | 9.5px / 0.59375rem | 1.2 | 0.01em | 700 | Solo casos extremos (tag "WAIVER"/"RGPD"). Evitar; +tracking por legibilidad |

**Reglas de uso:**
- **Cuerpo y todo lo editable = `--text-body` (14px) o `--text-sm` (13px) mínimo.** Nada que el usuario lea con frecuencia o edite baja de 13px. A pleno sol, <12px es ilegible.
- `--text-2xs` y `--text-micro` se reservan a badges no críticos (la información ya está duplicada en texto largo en otro sitio).
- El `letter-spacing` negativo solo en tamaños grandes (≥16px) para compactar titulares; en tamaños pequeños el tracking ligeramente **positivo** mejora legibilidad exterior.

### 3.3 Mapeo de migración (qué reemplaza a qué)

| Hardcodeado actual | Token destino |
|---|---|
| `text-[22px]` + `letter-spacing:-0.5px` | `text-display` |
| `text-[16px]`, `text-[15px]` | `text-title` |
| `text-[14px]`, `text-sm` | `text-body` |
| `text-[13.5px]`, `text-[13px]`, `text-[12.5px]`, `text-[12px]`, `text-xs` | `text-sm` |
| `text-[11.5px]`, `text-[11px]` | `text-xs` |
| `text-[10px]` | `text-2xs` |
| `text-[9.5px]` | `text-micro` |

> Consolidar de 14 tamaños a 7 es intencional: varios de los pasos actuales (12 vs 12.5 vs 13) son indistinguibles y solo añaden entropía.

### 3.4 Tailwind v4 — declaración

```css
@theme inline {
  --text-display: 1.375rem;   --text-display--line-height: 1.15;   --text-display--letter-spacing: -0.02em;
  --text-title:   1rem;       --text-title--line-height: 1.25;     --text-title--letter-spacing: -0.01em;
  --text-body:    0.875rem;   --text-body--line-height: 1.4;
  --text-sm:      0.8125rem;  --text-sm--line-height: 1.35;        --text-sm--letter-spacing: -0.005em;
  --text-xs:      0.71875rem; --text-xs--line-height: 1.3;
  --text-2xs:     0.625rem;   --text-2xs--line-height: 1.2;
  --text-micro:   0.59375rem; --text-micro--line-height: 1.2;      --text-micro--letter-spacing: 0.01em;
}
```

Esto genera `text-display`, `text-title`, `text-body`, etc. con su line-height y tracking ya aplicados.

---

## 4. Modo oscuro — recomendación

**Recomendación: NO cablear dark mode como tema por defecto, y mantener el producto light-first.** Razones:

1. El requisito real es **legibilidad a pleno sol**. En exterior con luz directa, una UI oscura sufre reflejos especulares mucho peores que una clara; los operadores de campo (aviación, marina, agro) usan interfaces claras de alto contraste, no oscuras. Un tema oscuro resolvería un problema que no tenemos (uso nocturno) empeorando el que sí tenemos.
2. `CLAUDE.md` y `REDESIGN.md` ya fijaron "light mode únicamente" por esta misma razón. Coherente.
3. Cablear dark mode ahora duplica el coste de cada token de estado (§2.3) sin beneficio operativo.

**Qué sí se hace:**
- Mantener `next-themes` instalado y `@custom-variant dark` en CSS (ya está), pero **sin** `ThemeProvider` activo ni toggle. Coste cero, opción futura abierta.
- Reservar el modo oscuro como **palanca white-label opcional** (§8): una DZ que opere de noche (raro) podría activarlo. Por eso los tokens de estado se definen como familias mapeables; un `.dark {}` futuro solo redefine las ~12 familias y los neutros base, no el dominio.
- **Sí** crear una variante de **"sol intenso" / alto contraste** como mejora futura más valiosa que el dark mode: un toggle que sube el contraste de bordes (`--border` → `--border-strong`) y la saturación de badges. Documentado aquí como roadmap, no como entregable v1.

**Esqueleto `.dark` (solo si se activa en el futuro, no implementar ahora):**
```css
.dark {
  --background: oklch(0.205 0.012 55);
  --foreground: oklch(0.960 0.006 55);
  --card:       oklch(0.245 0.012 55);
  --border:     oklch(0.330 0.012 55);
  --primary:    oklch(0.680 0.170 42);
  /* familias de estado: subir L a ~0.72 para el texto y bajar -bg a ~0.30 con baja croma */
}
```

---

## 5. Espaciado, radios, sombras y componentes

### 5.1 Escala de espaciado

Base **4px**, alineada con la densidad alta. Se usa la escala nativa de Tailwind (`gap-2` = 8px, `px-3.5` = 14px, etc.), que ya está en uso. Convención de aplicación:

| Contexto | Espaciado |
|---|---|
| Padding interno de fila densa (ParticipantRow) | `px-3.5 py-2` (14/8px) |
| Gap entre controles dentro de fila | `gap-2` (8px) |
| Gap entre filas/tarjetas en lista de jornada | `gap-3` (12px) |
| Padding de tarjeta/sheet | `p-4`–`p-6` (16–24px) |
| Padding de página | `px-6 py-7` a `px-8 py-7` |
| Separación de secciones en ficha | `pt-5` |

Regla: dentro de una zona densa, no superar `gap-3`; el aire se reserva para separar bloques, no elementos.

### 5.2 Radios

`--radius: 0.5rem` (8px) ya define la escala derivada en `@theme inline` (`--radius-sm` … `--radius-4xl`). Uso:

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` (`--radius-sm`, ~4.8px) | inputs inline, checkboxes |
| `rounded` / `rounded-md` | badges, botones pequeños, selects |
| `rounded-lg` (8px) | botones estándar, controles de nav |
| `rounded-xl` | tarjetas de calendario (DayCard), contenedores QR |
| `rounded-full` | **badges de estado píldora** (estándar del sistema), avatar del día activo |

Decisión: **los badges de estado son píldoras** (`rounded-full`) — refuerza P4 (lectura por forma) y ya es el patrón fijado en `CLAUDE.md`. Hoy `ParticipantRow` usa `rounded` en algunos badges; homogeneizar a `rounded-full`.

### 5.3 Sombras

Sistema de **2 niveles** (alta densidad = sombras sutiles, el peso lo lleva el borde). Hoy `DayCard` reescribe `boxShadow` imperativamente vía JS `onMouseEnter/onMouseLeave`; esto se reemplaza por tokens + estados CSS declarativos.

```css
--shadow-card:       0 0 0 1px var(--border), 0 1px 3px oklch(0 0 0 / 0.04);
--shadow-card-hover: 0 0 0 1.5px oklch(0.640 0.175 42 / 0.35), 0 4px 12px oklch(0 0 0 / 0.08);
--shadow-card-today: 0 0 0 1.5px var(--primary), 0 1px 4px oklch(0 0 0 / 0.06);
--shadow-overlay:    0 8px 30px oklch(0 0 0 / 0.12);   /* dialogs, dropdowns, sheets */
```

Exponer como `--shadow-*` en `@theme inline` para usar `shadow-card`, `hover:shadow-card-hover`. **Eliminar el hover por JS** en `DayCard.tsx` y `CalendarView.tsx`: el borde naranja de hover se logra con `hover:shadow-card-hover` (clase), y el estado "hoy" con una clase condicional, no con manipulación directa de `style`.

### 5.4 Cuándo usar cada componente shadcn

| Componente | Usar para | NO usar para |
|---|---|---|
| **`Button`** (shadcn) | Toda acción que parezca botón: CTA primario, acciones de toolbar, confirmaciones. Variante `default` (primario naranja), `outline`, `ghost` (acciones terciarias), `destructive` (borrar). Tamaños `sm`/`default` en campo. | Triggers que abren menús/dialogs y necesitan estilo de badge (usar el trigger del primitivo con clases del sistema). |
| **`<button>` nativo** | Solo micro-interacciones inline ultra-específicas que no encajan en ninguna variante (el "×" de borrar, toggles de checklist con check SVG). Debe llevar clases del sistema (tokens), nunca color hardcodeado. | Cualquier acción "normal": usar `Button`. Hoy hay muchos `<button>` que deberían ser `Button` (p. ej. nav del calendario, "Hoy", "Añadir pago"). |
| **`Card`** | Contenedores de agrupación con superficie propia: tarjeta de jornada, paneles de finanzas, bloques de admin. | Filas de lista densas (ParticipantRow): ahí un `div` con `bg-card` + borde inferior es correcto, no un Card por fila. |
| **`Badge`** | Estados de participante, paquete, etapa de pago, clima. **Centralizar** el badge de estado en un componente `<StatusBadge variant="completed" />` que lea los tokens (§2.4). | Acciones (eso es un Button). Un badge nunca es clicable como acción primaria; si abre un dropdown de cambio de estado, el trigger lleva apariencia de badge pero rol de botón con `aria-haspopup`. |
| **`Tabs`** | Navegación dentro de una pantalla: en la **ficha del cliente** (hoy 3 columnas fijas Contacto/Checklist/Notas-Docs), en **Finanzas** (resumen / por método / por etapa), en **Admin** (instructores / ajustes). Mejora el responsive (§7). | Navegación principal entre pantallas (eso es el sidebar). |
| **`Select` / `DropdownMenu`** | `Select` para elegir de una lista cerrada (instructor). `DropdownMenu` para acciones/cambios de estado con feedback visual (cambiar status/paquete). | — |
| **`Dialog` / `Sheet`** | `Dialog` modal centrado para tareas cortas (gestionar pagos, QR). `Sheet` para contexto lateral/superior amplio (ficha de cliente). Sin clases de color: los tokens shadcn ya temean. | — |

### 5.5 Foco y accesibilidad

- **Foco visible obligatorio.** `Button` ya trae `focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring`. Todo control interactivo custom (`<button>`, triggers de badge, inputs inline) debe tener un anillo equivalente: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`.
- Los inputs inline hoy usan `focus:ring-1 focus:ring-ring` — subir a `focus-visible:ring-2` para visibilidad a pleno sol.
- **Nunca color como único portador de significado.** Todo estado lleva texto (ya se cumple: "Completado", "Pagado", etc.). Mantener.
- **Contraste:** los pares texto/`-bg` de §2.3 están calculados para ≥4.5:1; los críticos (texto sobre fondo blanco) cumplen AAA. Verificar cualquier familia nueva contra su `-bg` y contra `--card`.
- Estados deshabilitados: `opacity` no basta para contraste; usar `--foreground-subtle` para texto deshabilitado relevante.

### 5.6 Hit targets (uso en tablet)

Regla de campo: **mínimo 32×32px de área tocable** para cualquier acción frecuente, aunque el badge visible sea más pequeño. Se logra con padding o un área de tap invisible.

- Badges de estado/paquete que abren dropdown: el badge puede medir ~20px de alto visual, pero el trigger debe garantizar ≥32px de alto efectivo (padding vertical + `min-h`). Hoy `py-0.5` es insuficiente como target táctil.
- El "×" de borrar y el handle de drag: ampliar área tocable a 32px (padding), manteniendo el icono pequeño.
- `SelectTrigger` de instructor (`h-5` actual) sube a `h-7`/`h-8` mínimo en tablet.
- Excepción: en uso con ratón (desktop admin) los targets densos actuales son aceptables; la regla de 32px aplica en el breakpoint `tablet` (§7).

---

## 6. Iconografía y misceláneos

- **lucide-react** es el set único. Tamaños: 14–16px en controles densos, 18–20px en nav. `strokeWidth` 2 por defecto.
- Sustituir glifos de texto improvisados (`×`, `+`, `✓`, `↗`) por iconos lucide (`X`, `Plus`, `Check`, `ExternalLink`) para consistencia de peso y alineación. El check SVG inline del checklist puede mantenerse o migrar a `Check`.
- Color de icono = `currentColor` para heredar del token de texto (`text-muted-foreground`, etc.). Nunca `stroke="white"` hardcodeado salvo sobre fondo de marca sólido.

---

## 7. Estrategia responsive

Hoy no hay responsive y el layout asume desktop ancho. El uso real es **tablet en campo + desktop en oficina**.

### 7.1 Breakpoints (Tailwind v4 default, semánticos)

| Nombre | Ancho | Dispositivo objetivo |
|---|---|---|
| base | <768px | Móvil (uso secundario: cara cliente del waiver) |
| `md` (tablet) | ≥768px | **Tablet en campo — caso de uso primario** |
| `lg` | ≥1024px | Tablet apaisada grande / laptop |
| `xl` | ≥1280px | Desktop oficina (admin/finanzas) |

Diseñar **tablet-first** para las pantallas operativas (la tablet es donde se opera), desktop-up para finanzas/admin.

### 7.2 Sidebar

- **Desktop (`xl`):** sidebar fija 224px (actual), expandida con labels.
- **Tablet (`md`–`lg`):** sidebar **colapsable a riel de iconos** (~64px), labels en tooltip. Maximiza el ancho útil del manifiesto en tablet. Usar el patrón `Sidebar` de shadcn (collapsible="icon") o un estado controlado con `next-themes`-style persistence.
- **Móvil (base):** sidebar oculta tras un botón hamburguesa que abre un `Sheet` lateral. La vista cliente del waiver no muestra sidebar en absoluto.
- Estado activo de nav: `bg-secondary text-primary font-semibold` (ya fijado en `CLAUDE.md`), nunca `border-left`.

### 7.3 Fila de participante (el reto de densidad)

La fila empaqueta ~10 campos. Estrategia por breakpoint, sin perder edición inline:

- **`lg`+ (apaisado/desktop):** fila completa en una línea (layout actual). Todos los campos visibles.
- **`md` (tablet retrato, ~768px):** fila en **dos renglones** dentro del mismo contenedor:
  - Renglón 1: drag handle · nombre · estado · paquete · pago (lo crítico de operación).
  - Renglón 2 (más tenue): instructor · peso/OW · acciones.
  - Implementar con `flex-wrap` + `order-*`, no con un componente distinto. La altura de fila crece, pero sigue siendo escaneable.
- **base (móvil):** la fila colapsa a **tarjeta** (nombre + estado + paquete arriba; resto expandible). Caso poco frecuente para staff; prioridad baja.
- Los campos editables nunca desaparecen por breakpoint; se reordenan/apilan. La ficha completa sigue accesible vía el `Sheet` (que en tablet pasa a `side="bottom"` a altura mayor).

### 7.4 Calendario y resto

- Calendario: grid de 7 columnas se mantiene en `md`+; en base, scroll o vista de lista de jornadas próximas.
- Finanzas/Admin: `Tabs` (§5.4) en lugar de columnas fijas resuelve el responsive casi gratis.

---

## 8. Tematización / white-label

Objetivo: vender el producto a otras DZ cambiando **solo tokens de marca**, sin tocar componentes ni la semántica de estados.

### 8.1 Capas de token (qué cambia y qué no)

| Capa | Tokens | ¿Cambia por cliente? |
|---|---|---|
| **Marca** | `--primary`, `--primary-foreground`, `--primary-hover`, `--secondary`, `--accent`, `--ring`, `--sidebar-primary`, `--state-brand`(+`-bg`) | **Sí** — el corazón del white-label |
| **Identidad** | logo (asset), nombre, favicon, fuente (si la DZ tiene marca propia: cambiar `--font-sans`) | **Sí** |
| **Forma** | `--radius` (una DZ más "premium" puede querer 0.75rem; otra más técnica, 0.25rem) | Opcional |
| **Estados de dominio** | familias `--state-*` y alias `--status-*`/`--package-*`/`--pay-*`/`--weather-*` | **No** — son estructurales; verde = pagado en todas las DZ |
| **Neutros** | `--background`, `--foreground`, `--card`, `--border`… | No (salvo ajuste fino de matiz cálido/frío vía el ángulo de matiz 55) |

### 8.2 Mecanismo

- Cada cliente = un **archivo de tema** (`themes/{cliente}.css`) que redefine **solo** la capa de marca/identidad bajo un selector de tenant (`[data-tenant="ijump"] { --primary: … }`) o, en arquitectura single-tenant, sustituyendo el bloque `:root` de marca.
- Validación obligatoria por cliente: el nuevo `--primary` debe mantener contraste ≥4.5:1 con `--primary-foreground` y ser distinguible de `--state-success`/`--state-danger` (que no cambian) para no romper la lectura de estados.
- `--state-brand` se ata a `--primary` por cliente (es el único estado de dominio que sigue a la marca: "equipado"/"suplemento"). El resto de familias son fijas.
- Recomendación de marca: definir el primario como **token de marca**, y derivar `-hover` bajando L ~0.04 y `-bg`/`secondary` subiendo L a ~0.96 con croma ~0.038, igual que el sistema iJump. Así un cliente solo aporta **un** color y el resto se deriva.

### 8.3 Checklist de onboarding de un cliente nuevo
1. Color de marca (un OKLCH/hex) → genera `--primary`, `--primary-hover`, `--secondary`, `--accent`, `--state-brand`.
2. Logo + favicon + nombre.
3. (Opcional) `--radius` y `--font-sans`.
4. Verificar contraste del primario y distinción frente a estados.
5. Nada más. Estados, tipografía, espaciado y componentes son idénticos.

---

## 9. Implementación prioritaria

Orden recomendado, de mayor impacto/menor riesgo a más profundo. Cada paso es independiente y desplegable.

**Fase 0 — Tokens (fundación, sin cambio visual)**
1. Añadir a `globals.css`: tokens base nuevos (§2.2), familias `--state-*` (§2.3), alias de dominio (§2.4), escala tipográfica (§3.4), sombras (§5.3). Exponer todos en `@theme inline`.
2. *Resultado:* nada cambia en pantalla todavía, pero el vocabulario existe. Riesgo nulo.

**Fase 1 — Migrar colores hardcodeados (el problema #2)**
3. `ParticipantRow.tsx`: reemplazar `STATUS_CONFIG`/`PACKAGE_CONFIG`/`STAGE_COLORS`/`getPaymentStatus`/checklist/"OW" — de hex inline a clases/`var()` de §2.4. Extraer un componente `StatusBadge` reutilizable.
4. `DayCard.tsx`: `WEATHER_CONFIG` → tokens `--weather-*`.
5. *Resultado:* cero hex de dominio en componentes; visualmente casi idéntico (valores conservados).

**Fase 2 — Tipografía (el problema #1)**
6. Buscar y reemplazar los ~14 `text-[Npx]` por las 7 utilidades nombradas según §3.3. Eliminar `letter-spacing` inline (ya va en el token).
7. *Resultado:* escala consistente, base para responsive.

**Fase 3 — Hover/sombra declarativos**
8. `DayCard.tsx` y `CalendarView.tsx`: eliminar `onMouseEnter/onMouseLeave` que manipulan `style.boxShadow`; usar `shadow-card` + `hover:shadow-card-hover` + clase condicional para "hoy". 
9. *Resultado:* menos JS, hover correcto con teclado, código declarativo.

**Fase 4 — Componentes**
10. Homogeneizar badges a `rounded-full`. Migrar `<button>` "normales" (nav calendario, "Hoy", "Añadir pago") a `Button`. Centralizar `StatusBadge`.
11. Introducir `Tabs` en ficha de cliente, finanzas y admin.

**Fase 5 — Responsive + accesibilidad**
12. Sidebar colapsable en tablet (§7.2). Fila de participante con `flex-wrap`/`order` en `md` (§7.3). Hit targets ≥32px (§5.6). Subir anillos de foco a `focus-visible:ring-2` (§5.5).

**Fase 6 — White-label (cuando se cierre el 2º cliente)**
13. Extraer capa de marca a `themes/ijump.css`, parametrizar por tenant (§8.2).

---

## 10. Reglas rápidas (resumen accionable)

- Color → siempre token. Cero hex en `.tsx`. Estado → `bg-{token}-bg text-{token}`.
- Tamaño de fuente → una de las 7 utilidades (`text-display`…`text-micro`). Nunca `text-[Npx]`.
- Cuerpo/editable ≥ 13px. Badges no críticos pueden bajar.
- Badge de estado = píldora `rounded-full`, texto + color, vía `StatusBadge`.
- Acción que parece botón = `Button` de shadcn. `<button>` nativo solo para micro-inline con clases del sistema.
- Foco siempre visible (`focus-visible:ring-2 ring-ring`). Hit target ≥32px en tablet.
- Light-first, alto contraste. Sin dark mode en v1.
- Marca aislada en ~6 tokens. Estados de dominio nunca cambian por cliente.
