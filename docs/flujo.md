# Flujo de usuario

## Puntos de entrada

| Entrada | Descripción |
|---|---|
| **Directa** | El usuario ve el intro de confianza → aviso legal → CTA "Calcular" |
| **Modo ejemplo** | Clic en "Ver un ejemplo primero" → resultados con datos simulados + banner ámbar fijo |
| **URL compartida** | Hash en la URL restaura el estado automáticamente y muestra los resultados |

## Flujo principal

```
Inicio → Paso 1 → Paso 2 → Paso 3 → Paso 4 → Resultados
```

### Paso 1 — Ingresa tus datos
**Datos:** edad, sexo biológico, fondo actual

El subheader informa que los datos se usan para calcular la fecha de jubilación y no se guardan.

### Paso 2 — ¿Cuántas semanas cotizadas tienes?
**Datos:** semanas totales, semanas al 1-jul-2025, saldo AFP, traslados previos, situaciones especiales

Detalles UX:
- El campo de saldo solo aparece si el fondo actual es una AFP (no Colpensiones ni "ninguno")
- El saldo se formatea automáticamente al salir del campo: `198000000` → `$198.000.000`
- Un estimador colapsable permite calcular semanas a partir de años trabajados
- La hint de conversión a SMMLV aparece en tiempo real al escribir el saldo

### Paso 3 — Panorama laboral
**Datos:** rango salarial, años de cotización restantes, ritmo de trabajo futuro

La opción de ritmo de trabajo usa labels conversacionales:
- 💪 Igual o más que ahora
- 📉 Menos que ahora
- 🌅 Semi-retiro

Si el usuario es independiente (marcado en paso 2), aparece un hint contextual que orienta la elección.

### Paso 4 — Factores personales
**Datos:** número de hijos, prioridades (selección múltiple)

Prioridades disponibles: maximizar mesada · retirarme pronto · dejar herencia · menor riesgo · garantía del Estado.

La herramienta detecta combinaciones contradictorias (ej: maximizar mesada + retirarme pronto) y muestra una nota explicativa sin bloquear el avance.

## Validación

Cada paso valida antes de avanzar. Si hay un error, el campo específico recibe un borde rojo y un shake — el usuario sabe exactamente qué corregir. El mensaje de error es específico (ej: "Ingresa tu edad", no "Completa los campos").

## Pantalla de resultados

### 1. Query card
Chips con el perfil ingresado. Permite confirmar los datos de un vistazo.

### 2. Verdict card
Recomendación principal:
- Régimen recomendado
- Acción concreta (quedarse / trasladarse / afiliarse)
- Mesada estimada en SMMLV y pesos de hoy
- Escala visual de certeza (baja / media / alta)

### 3. Result cards
Una card por régimen con mesada estimada, pros, contras y barras de métricas (estabilidad, herencia, riesgo).

### 4. Análisis IA (opcional)
Botón que solicita a Claude Haiku una explicación personalizada. Solo aparece si `ANTHROPIC_API_KEY` está configurada.

## Acciones post-resultado

| Acción | Comportamiento |
|---|---|
| **Compartir** | Copia una URL con los datos codificados en el hash (sin servidor) |
| **Imprimir / PDF** | Vista de impresión optimizada; oculta elementos no imprimibles |
| **Analizar mi caso** | Desde modo ejemplo: regresa al formulario vacío |
| **Volver a calcular** | Reinicia el formulario conservando la sesión del navegador |
