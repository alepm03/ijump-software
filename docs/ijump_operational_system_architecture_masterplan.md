# iJump Operational System — Arquitectura Completa, MVP y Roadmap

# 1. Visión General del Proyecto

## Objetivo del software

El objetivo del proyecto es desarrollar un sistema operacional completo para una empresa de paracaidismo tándem.

El sistema sustituirá progresivamente el modelo operativo actual basado en:

- Excel
- WhatsApp
- papel
- coordinación manual
- memoria operativa humana

El foco principal del proyecto NO es crear un simple sistema de reservas.

El núcleo del sistema es:

# El Manifest Operacional Diario

Actualmente, el Excel actúa simultáneamente como:

- agenda operativa
- sistema de reservas
- CRM básico
- manifest de vuelos
- control de pagos
- control operacional
- panel diario
- herramienta de reporting
- histórico

Por tanto, el software se diseñará alrededor del concepto:

```txt
OperationalDay
```

Y no alrededor del cliente.

---

# 2. Filosofía de Desarrollo

## Estrategia del proyecto

El proyecto seguirá una estrategia progresiva:

# Fase 1
Replicar digitalmente el Excel operacional.

# Fase 2
Evolucionar gradualmente hacia un ERP operacional completo.

---

## Objetivos principales del MVP

- eliminar dependencia del Excel
- persistencia histórica
- edición rápida operacional
- gestión de vuelos
- gestión de participantes
- cálculo automático
- drag & drop
- tiempo real
- almacenamiento documental
- simplificación operativa

---

## Lo que NO se intentará en el MVP

No se intentará construir inicialmente:

- CRM avanzado
- IA integrada
- automatización WhatsApp
- sistema multimedia completo
- BI avanzado
- reporting avanzado
- pagos online complejos
- automatización de marketing
- multiempresa
- múltiples manifests
- múltiples aviones
- aplicación móvil cliente

---

# 3. Modelo Operacional Real del Negocio

## Flujo real actual

```txt
Cliente contacta
→ WhatsApp / teléfono / Groupon
→ administración añade manualmente al Excel
→ cliente asignado a vuelo
→ cliente llega el día del salto
→ firma documentos
→ briefing
→ equipamiento
→ pesaje
→ asignación instructor
→ salto
→ edición vídeo
→ entrega multimedia
```

---

# 4. Conceptos Fundamentales del Dominio

# OperationalDay

Representa una jornada completa de saltos.

Ejemplo:

```txt
Sábado 28 Septiembre
```

Contiene:

- vuelos
- participantes
- métricas
- pagos
- estados
- notas
- histórico

Es la entidad central del sistema.

---

# Flight

Representa un vuelo individual del día.

Ejemplo:

```txt
Vuelo 1
09:00
```

Características:

- un único avión
- máximo 2 clientes por vuelo
- máximo 2 instructores tándem
- posibilidad de cámara externa
- hora estimada
- editable dinámicamente

Los vuelos:

- pueden añadirse
- eliminarse
- reordenarse
- modificarse

No son estáticos.

---

# Participant

Representa una persona individual que realizará un salto.

Cada participante:

- tiene fila propia
- tiene instructor propio
- tiene estado operativo individual
- tiene documentación individual
- tiene pago asociado
- ocupa plaza operacional propia

Aunque varias personas pertenezcan a una misma reserva.

---

# ReservationGroup

Representa una reserva comercial.

Ejemplo:

```txt
Juan reserva para:
- Juan
- Ana
```

Características:

- múltiples participantes
- pagos flexibles
- un pagador principal opcional
- agrupación comercial

La operativa diaria se realiza siempre sobre participantes individuales.

---

# Instructor

Instructor tándem asignado a un participante.

Características futuras:

- licencia
- disponibilidad
- peso máximo
- estado activo
- especialidades

En el MVP:

- asignación manual
- asignación tardía durante operación

---

# MediaPackage

Tipos de multimedia:

## Handycam

Vídeo grabado por el instructor tándem.

NO requiere personal adicional.

## Video Externo

Vídeo grabado por otro instructor/cámara.

SÍ requiere ocupación adicional en vuelo.

---

# Payment

Sistema de pagos desacoplado.

Separación importante:

## Reservation Source

Ejemplos:

- Groupon
- reserva directa
- promoción
- bono

## Payment Method

Ejemplos:

- efectivo
- tarjeta
- bizum
- transferencia

## Payment Stage

Ejemplos:

- reserva
- liquidación
- suplemento

---

# Waiver / Documentación

Documentos legales digitales.

Incluye:

- consentimiento
- waiver
- RGPD
- firma
- timestamp
- almacenamiento

---

# 5. Arquitectura Técnica Definitiva

# Filosofía Arquitectónica

Se prioriza:

- simplicidad
- rapidez de desarrollo
- mantenibilidad
- escalabilidad razonable
- realtime
- bajo coste operativo

Se evita:

- sobrearquitectura
- microservicios innecesarios
- backend enterprise complejo

---

# Stack Tecnológico Definitivo

# Frontend

## Tecnologías

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Table
- DnD Kit
- Zustand

---

# Backend

## Filosofía

No existirá inicialmente un backend separado tradicional.

La lógica backend se implementará mediante:

- Next.js Server Actions
- Route Handlers
- Supabase
- PostgreSQL
- Edge Functions

---

# Base de Datos

## PostgreSQL

Gestionado mediante Supabase.

Razones:

- relaciones complejas
- consistencia
- históricos
- queries avanzadas
- escalabilidad suficiente

---

# Plataforma Backend

## Supabase

Se utilizará:

- PostgreSQL
- Auth
- Realtime
- Storage
- Row Level Security
- Edge Functions

---

# Hosting

## Vercel

Frontend y lógica Next.js desplegados en Vercel.

Ventajas:

- despliegue rápido
- previews automáticas
- CI/CD simple
- integración perfecta con Next.js

---

# Realtime

## Supabase Realtime

Utilizado para:

- drag & drop sincronizado
- edición simultánea
- actualizaciones en vivo
- sincronización operacional

---

# Storage

## Supabase Storage

Utilizado para:

- PDFs
- firmas
- documentos
- multimedia futura

---

# Tipado

## TypeScript End-to-End

Todo el sistema utilizará TypeScript.

No se utilizará Java ni Python para el core inicial.

Razones:

- velocidad de desarrollo
- menor complejidad
- menor mantenimiento
- tipado compartido frontend/backend
- menor cantidad de bugs

Python podrá utilizarse en el futuro para:

- IA
- automatización multimedia
- procesamiento vídeo
- OCR
- automatizaciones complejas

---

# 6. Diseño del MVP

# Objetivo Principal del MVP

# Sustituir completamente el Excel operacional.

---

# Funcionalidades MVP

# 1. Calendario Operacional

Características:

- crear jornadas
- visualizar jornadas pasadas
- navegación histórica
- persistencia completa

---

# 2. Vista Operacional Principal

La interfaz NO copiará literalmente Excel.

Se construirá un modelo híbrido moderno:

- estilo dashboard
- edición inline
- comportamiento spreadsheet
- UX moderna

Características:

- vuelos visuales
- participantes por vuelo
- edición rápida
- filtros
- drag & drop
- realtime
- cálculos automáticos

---

# 3. Gestión de Vuelos

Funciones:

- crear vuelo
- eliminar vuelo
- editar hora
- reordenar vuelos
- mover participantes

---

# 4. Gestión de Participantes

Funciones:

- crear participante
- editar datos
- mover entre vuelos
- asignar instructor
- estados operativos
- notas

---

# 5. Sistema de Pagos Básico

Funciones:

- pagos reserva
- liquidaciones
- suplementos overweight
- métodos de pago
- cálculos automáticos
- totales diarios

---

# 6. Sistema Documental

Funciones:

- firma táctil
- almacenamiento PDF
- QR futuro
- histórico documental

---

# 7. Histórico Completo

El sistema deberá permitir:

- abrir cualquier jornada pasada
- consultar estado exacto histórico
- mantener persistencia operacional

---

# 7. Entidades Iniciales

# OperationalDay

```ts
OperationalDay
```

Campos aproximados:

- id
- date
- weatherStatus
- notes
- createdAt
- updatedAt

---

# Flight

```ts
Flight
```

Campos:

- id
- operationalDayId
- flightNumber
- estimatedDepartureTime
- actualDepartureTime
- status
- orderIndex

---

# Participant

```ts
Participant
```

Campos:

- id
- reservationGroupId
- fullName
- phone
- email
- packageType
- mediaPackage
- weight
- overweightFee
- operationalStatus
- assignedFlightId
- assignedInstructorId
- waiverSigned
- checkInCompleted
- gearedUp
- notes

---

# ReservationGroup

```ts
ReservationGroup
```

Campos:

- id
- payerName
- source
- totalAmount
- notes

---

# Payment

```ts
Payment
```

Campos:

- id
- participantId
- amount
- method
- stage
- notes
- createdAt

---

# Instructor

```ts
Instructor
```

Campos iniciales:

- id
- name
- active

---

# Waiver

```ts
Waiver
```

Campos:

- id
- participantId
- signedAt
- pdfUrl
- signatureUrl
- accepted

---

# 8. Enums Iniciales

# PackageType

```ts
HANDYCAM
VIDEO_EXTERNO
```

---

# PaymentMethod

```ts
EFECTIVO
TARJETA
BIZUM
TRANSFERENCIA
GROUPON
```

---

# PaymentStage

```ts
RESERVA
LIQUIDACION
SUPLEMENTO
```

---

# OperationalStatus

```ts
PENDING
CHECKED_IN
WAIVER_SIGNED
BRIEFED
GEARED_UP
READY
COMPLETED
CANCELLED
NO_SHOW
WEATHER_CANCELLED
```

---

# FlightStatus

```ts
SCHEDULED
BOARDING
IN_AIR
COMPLETED
DELAYED
CANCELLED
```

---

# ReservationSource

```ts
DIRECT
GROUPON
BONO
PROMO
```

---

# 9. Roadmap Evolutivo

# MVP v1

- sistema operacional
- vuelos
- participantes
- pagos básicos
- histórico
- documentación

---

# v1.5

- métricas avanzadas
- filtros avanzados
- mejoras realtime
- snapshots
- usuarios múltiples

---

# v2

- integración WhatsApp
- IA administrativa
- automatización reservas
- chatbot

---

# v3

- módulo multimedia
- subida vídeos
- entrega automática
- integración edición

---

# v4

- reporting avanzado
- dashboard financiero
- métricas operativas
- BI ligero

---

# 10. Seguridad y Persistencia

# Autenticación

Inicialmente:

- una única cuenta administrativa
- auth mediante Supabase

Futuro:

- múltiples usuarios
- roles
- permisos

---

# Persistencia Histórica

Requisito obligatorio.

Cada jornada debe poder:

- abrirse posteriormente
- visualizarse exactamente
- mantenerse íntegra

---

# Auditoría

En fases posteriores:

- tracking de cambios
- historial de edición
- logs operacionales

---

# 11. Decisiones Arquitectónicas Importantes

# Decisión 1

El núcleo del sistema es:

```txt
OperationalDay
```

NO el cliente.

---

# Decisión 2

El MVP replicará la operativa actual.

No se reinventará el flujo inicialmente.

---

# Decisión 3

La interfaz será híbrida moderna.

No una copia literal de Excel.

---

# Decisión 4

Arquitectura TypeScript Full Stack.

---

# Decisión 5

Backend simplificado mediante Supabase.

---

# Decisión 6

Diseño preparado para evolución futura.

Aunque inicialmente:

- un único avión
- un único manifest
- una única administrativa

---

# 12. Primeros Pasos de Desarrollo

# Fase 1 — Setup Base

- crear repositorio
- configurar Next.js
- configurar Supabase
- configurar Vercel
- configurar Tailwind
- configurar shadcn/ui

---

# Fase 2 — Base de Datos

- diseño schema PostgreSQL
- relaciones
- enums
- migraciones
- generación de tipos

---

# Fase 3 — Autenticación

- login administrativo
- protección rutas

---

# Fase 4 — Calendario Operacional

- listado jornadas
- navegación
- creación jornadas

---

# Fase 5 — Vista Operacional Principal

- flights
- participants
- drag & drop
- edición inline
- realtime

---

# Fase 6 — Pagos y Totales

- cálculos
- métricas
- liquidaciones

---

# Fase 7 — Documentación

- firma
- PDFs
- almacenamiento

---

# 13. Conclusión

El proyecto iJump no es simplemente una aplicación de reservas.

Es un sistema operacional especializado para centros de paracaidismo tándem.

La estrategia correcta es:

1. sustituir el Excel
2. digitalizar la operación
3. mantener simplicidad operacional
4. evolucionar progresivamente
5. automatizar posteriormente

La arquitectura elegida:

- Next.js
- TypeScript
- Supabase
- PostgreSQL
- Vercel

es extremadamente adecuada para:

- velocidad de desarrollo
- MVP rápido
- escalabilidad razonable
- realtime
- mantenibilidad
- evolución futura

El sistema se diseñará desde el principio pensando en:

- persistencia histórica
- modularidad
- crecimiento
- automatización futura
- experiencia operacional rápida

