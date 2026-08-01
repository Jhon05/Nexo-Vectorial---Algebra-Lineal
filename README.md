# Nexo Vectorial v3.10 — SCORM 1.2 para Brightspace

Juego de Álgebra Lineal con campaña espacial, preguntas dinámicamente parametrizadas y envío de nota sobre 5.00.

## Cambios de esta versión

- Banco ampliado a **50 plantillas principales**, 10 por mundo.
- Todas las preguntas numéricas de vectores, matrices, determinantes, sistemas y retos mixtos cambian sus datos y el procedimiento mostrado.
- Las preguntas repetidas por reintento regeneran valores, respuesta correcta, distractores, pista, gráfica y explicación.
- Los portales usan entre 4 y 5 plantillas avanzadas por mundo.
- Astros, salvavidas, escudos de jefes y reintentos de jefes reciben variantes nuevas en cada aparición.
- Se validaron automáticamente decenas de miles de instancias sin opciones duplicadas ni respuestas inválidas.
- Se conserva la cámara de tres astros al superar un agujero negro; al fallar, solo desaparece el portal.
- Se mantienen pausa, rendimiento adaptativo, nota fija por mundo y nota 5.00 al completar toda la campaña.
- `imsmanifest.xml` permanece directamente en la raíz del ZIP.

## Uso

Subir el ZIP directamente a Brightspace como paquete SCORM 1.2, sin descomprimirlo.


## Corrección v3.7
Los portales y los tres astros validan el mundo original, el sector secuencial y los subtemas seleccionados. Nunca usan preguntas de otro mundo como respaldo.


## v3.9 · Auditoría de puntaje
- Las respuestas correctas de asteroides, astros y cálculos de escuadras/jefes tienen recompensa positiva protegida.
- Ninguna respuesta correcta puede reducir la nota.
- Los astros siempre conceden una recompensa positiva, incluso si se agota la lista de preguntas cubiertas.
- Las recompensas por destruir naves y formas del jefe también se validan como positivas.


## Versión 3.10 — asteroides cafés y jefes obligatorios

- Los impactos con asteroides cafés reducen vida y puntos de combate, pero nunca modifican la nota académica.
- Cada mundo exige completar sus preguntas, derrotar la escuadra y vencer a su jefe.
- La nota del mundo no se fija y el mundo siguiente no se desbloquea hasta registrar la derrota del jefe correspondiente.
- El último mundo conserva la batalla final Alfa/Beta y completar toda la campaña fija automáticamente 5.00.
