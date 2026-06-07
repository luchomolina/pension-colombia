# Producto

## Problema

Los colombianos en edad activa tienen que tomar decisiones críticas sobre su pensión —si trasladarse de AFP a Colpensiones o quedarse— sin entender bien las implicaciones. La información existe, pero está dispersa, es técnica y difícil de interpretar sin asesoría profesional.

## Propuesta de valor

Una calculadora web gratuita, sin registro y sin sesgos que responde en minutos la pregunta: **¿me conviene más Colpensiones o mi AFP?**

## Usuario objetivo

Persona colombiana entre 25 y 60 años que:

- Cotiza o ha cotizado en el sistema pensional
- Está considerando trasladarse de fondo o quiere entender su situación
- Quiere orientarse antes de buscar asesoría profesional

## Principios

| Principio | Aplicación |
|---|---|
| **Sin sesgos** | Sin afiliación con ninguna AFP ni Colpensiones. Solo la ley colombiana y matemáticas. |
| **Privacidad por defecto** | Todo corre en el navegador. No se guardan ni envían datos. |
| **Transparencia** | El código es abierto en GitHub — cualquiera puede leerlo y verificarlo. |
| **Orientación, no decisión** | La herramienta orienta; la decisión y la asesoría definitiva son del usuario y su AFP / Colpensiones. |

## Funcionalidades

### Cálculo de pensión
Recopila datos en 4 pasos y proyecta escenarios comparados para Colpensiones (RPM) y AFP (RAIS), con una recomendación y nivel de certeza (alta / media / baja). El detalle de la base legal, los supuestos y las limitaciones está en [algoritmo.md](algoritmo.md).

### Modo ejemplo
Permite explorar la herramienta con datos simulados sin ingresar datos propios. Un banner fijo indica que se están viendo datos de ejemplo.

### Análisis con IA (opcional)
Análisis personalizado vía Claude Haiku que explica el resultado en lenguaje natural, adaptado a las preferencias declaradas.

### Compartir e imprimir
- URL compartible que codifica los datos en el hash (sin pasar por servidor)
- Vista de impresión optimizada y descarga como PDF

## Métricas de éxito sugeridas

- Tasa de completitud del formulario (pasos 1→4 → resultados)
- Tasa de uso del análisis IA
- Tasa de regreso al formulario desde el modo ejemplo
- Tiempo en resultados (proxy de comprensión del contenido)
