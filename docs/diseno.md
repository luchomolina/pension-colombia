# Sistema de diseño

## Paleta de colores

| Token | Valor | Uso |
|---|---|---|
| Azul principal | `#003893` | Títulos, CTAs, elementos de marca |
| Azul acento | `#0045c4` | Gradiente del verdict card |
| Verde | `#16a34a` | Pill "Recomendada", pros, certeza alta |
| Rojo | `#dc2626` | Contras, errores de validación, certeza baja |
| Ámbar | `#f59e0b` | Banner de modo ejemplo |
| Texto principal | `#1a1a2e` | Cuerpo de texto |
| Texto secundario | `#5c6470` | Hints, labels secundarios |
| Borde | `#e0e4ed` | Inputs, separadores |

## Tipografía

- **Fuente:** system-ui (sin dependencias externas)
- **Jerarquía:**

| Nivel | Tamaño | Peso | Uso |
|---|---|---|---|
| H1 | 2.1rem | 900 | Título de la app |
| H2 | 1.15rem | 800 | Título de cada card |
| Body | 0.95rem | 400 | Texto general |
| Hint | 0.78rem | 400 | Ayuda contextual bajo preguntas |
| Label chip | 0.74rem | 600 | Query chips, pills |

## Componentes

### Verdict card
Card con gradiente azul (`#002776` → `#0045c4`) que muestra la recomendación principal:
- Eyebrow en mayúsculas (texto contextual)
- Nombre del régimen recomendado
- Acción concreta: quedarse / trasladarse / afiliarse
- Mesada estimada en SMMLV y pesos de hoy
- **Escala de certeza** — 3 pills (baja → media → alta): solo la activa tiene color completo; las otras aparecen en blanco translúcido para dar contexto de escala

### Result card
Card individual por régimen con:
- Pill "Recomendada" en verde (solo si es el mejor resultado)
- Título del régimen en azul
- Mesada estimada
- Lista de pros en verde `#15803d` y contras en rojo `#dc2626`
- Barras de Estabilidad / Herencia / Riesgo

### Query card
Chips con el resumen del perfil ingresado. Permite confirmar de un vistazo que los datos son correctos antes de leer los resultados.

### Stepper
Barra de progreso con dots numerados y líneas de conexión. 4 pasos: Tus datos · Semanas cotizadas · Trabajo · Prioridades.

### Inline error affordance
Al fallar la validación, el campo específico recibe feedback visual inmediato:
- **Inputs de texto:** borde rojo, fondo rosado, animación shake
- **Grupos radio / checkbox:** outline rojo, fondo tintado, animación shake
- El error se limpia al interactuar con ese campo (sin necesidad de volver a enviar el formulario)

### Campo de saldo AFP
- `type="text"` con `inputmode="numeric"` para teclado numérico en móvil
- Al escribir: muestra solo dígitos (cursor libre)
- Al salir del campo (blur): formatea como `$198.000.000`
- Hint en tiempo real: convierte el monto a SMMLV mientras se escribe

## Principios de UX

- **Sentence case** — Mayúscula solo en inicial y nombres propios. Nunca all-caps en el copy (solo en elementos con `text-transform: uppercase` por CSS).
- **Cantidades monetarias** — Formato colombiano: `$198.000.000` (puntos como separador de miles). Abreviaciones con coma decimal: `$1,75M`.
- **Hints** — Máximo 48 caracteres. Concisos y directamente accionables.
- **Preguntas conversacionales** — Los títulos de los pasos son preguntas o frases en primera persona, no labels técnicos.
- **Copy positivo** — El aviso legal y los mensajes de error comunican lo que el usuario *puede* hacer, no solo restricciones.
