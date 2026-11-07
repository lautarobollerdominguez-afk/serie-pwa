# Verificación de Serie 1.2.0

Actualización: 3 de noviembre de 2026. La cobertura anterior se conserva; los nuevos controles se verificaron nuevamente.

## Pruebas automatizadas de lógica

**31 pruebas aprobadas**, ejecutadas con `node --test tests/*.test.js`:

- Respaldo JSON completo, identificadores estables, notas y RIR 0.
- Importación sin transferir alarmas activas ni permisos del otro dispositivo.
- Rechazo de archivos ajenos y versiones desconocidas sin modificar el original.
- Rechazo de referencias rotas, identificadores duplicados y estados incompatibles.
- Protección frente a descansos importados fuera del rango admitido.
- Distinción entre carga vacía y 0 kg; validación de repeticiones y RIR.
- Coma decimal, borradores incompletos y consistencia entre borrador y registro.
- Búsqueda de la sesión anterior por identidad y exclusión de series pendientes.
- Orden estable de series, independiente de su tipo.
- Recuperación del descanso por timestamp, pausa, reanudación y ajustes.
- Reconstrucción de campos permitidos al importar y escape de texto al renderizar.
- Generación de identificadores únicos.
- Service Worker probado con dobles de caché/red: rutas de subcarpeta, respuesta desde caché y exclusión de otras rutas.
- Existencia de los recursos del manifiesto y la caché.

Pruebas nuevas de la versión 1.1.0:

- Duración desde el inicio, recuperación por timestamp y congelación al finalizar, incluso después de una hora.
- Cronómetro sin deriva por ticks, pausa sin sumar tiempo, reanudación y reinicio.
- Entradas del temporizador: vacías, parciales, inválidas y límites de 1 segundo a 24 horas.
- Temporizador general independiente del descanso, recuperación, pausa y ajustes.
- Volumen por serie con cargas y repeticiones distintas, decimales, 0 kg, campos incompletos, cambios y eliminaciones; separación entre total y realizado y entre sesiones.
- Compatibilidad con respaldos anteriores y relojes generales locales que no se transfieren.
- Solicitud de sonido y vibración con dobles del navegador; ajustes desactivados y alertas vencidas.
- Título propio para la notificación general sin cambiar el aviso de descanso.

## Persistencia en navegador

**8 pruebas aprobadas en Chromium** mediante `tests/browser.html`, con una base temporal aislada:

1. Creación e inicialización de IndexedDB.
2. Conservación del último valor tras 200 cambios consecutivos.
3. Lectura correcta al cerrar y reabrir la conexión.
4. Retención de una escritura fallida y reintento posterior.
5. Importación atómica con copia anterior recuperable.
6. Aborto completo ante un registro inválido, sin alterar datos ni copia previa.
7. Restauración de la copia anterior.
8. Estado del temporizador, cronómetro y borradores de duración conservados al cerrar y reabrir IndexedDB.

## Interfaz comprobada

- Creación de un ejercicio y configuración de tipos de serie y descanso.
- Inicio de sesión; entrada de cargas, repeticiones y RIR, incluido RIR 0.
- Inicio automático del descanso al marcar una serie.
- Persistencia de series, notas y una entrada parcial `22,` después de recargar.
- Adición de una serie de calentamiento al final, sin reordenamiento por tipo.
- Finalización de sesión conservando y diferenciando las series pendientes.
- Referencia automática de la sesión anterior al comenzar otro entrenamiento.
- Copia de valores anteriores sin marcar nuevas series como realizadas.
- Revisión visual de escritorio y de vistas con ancho de 390 y 320 px.
- Ajuste de RIR mediante botones en vista móvil.
- Descanso visible al cambiar a Ajustes en la vista móvil.

Los datos usados para verificar son ficticios y no se incluyen en el estado inicial de la entrega.

## Verificación nueva de interfaz

- Temporizador de 5 segundos: inicio y estado final «TIEMPO CUMPLIDO»; el aviso no se repite en cada tick.
- Cronómetro en marcha recuperado al recargar; pausa conservada al cambiar de pestaña del reloj.
- Temporizador de 2 minutos con ajuste de +15 segundos, pausa y recarga: conserva el tiempo restante pausado.
- Entrenamiento nuevo: reloj arranca en 00:00:00 y sigue contando tras recargar.
- 20 kg × 10 y 22,5 kg × 8: volumen total 380 kg; con solo la primera serie realizada, volumen realizado 200 kg.
- Entrada parcial «22,» excluida del volumen; al corregirla se recupera el total.
- Añadir y eliminar serie actualiza el total de 3 a 4 y de vuelta a 3.
- Historial de la sesión finalizada muestra duración fija y los mismos totales.
- Vistas de escritorio y anchos de 390 y 320 px; paneles de temporizador y cronómetro, controles táctiles y resumen.

## Límite de esta verificación

La vista previa de este entorno se sirve por HTTP en un host que no es localhost. El navegador impide allí el registro de Service Workers. Por eso **no se ha comprobado una instalación real, una recarga sin red con el Service Worker del navegador, ni una actualización entre versiones instaladas**. Se revisaron el código, el manifiesto, los recursos y la lógica de caché mediante pruebas aisladas.

No se ha probado hardware Android/iOS, vibración física, volumen del teléfono ni comportamiento del sistema al bloquear la pantalla. La simulación de ancho de pantalla no equivale a una prueba en un teléfono real. Las ocho pruebas de persistencia verifican la base y la importación programáticamente; no representan un recorrido del selector de archivos de cada sistema operativo.

## Comprobación tras publicar por HTTPS

1. Abrir el enlace de GitHub Pages y esperar **Offline listo**.
2. Instalar la app desde el navegador.
3. Crear un ejercicio de prueba y registrar una serie.
4. Cerrar, activar modo avión y volver a abrir la app: verificar la interfaz y el dato guardado.
5. Exportar un respaldo, importarlo en el otro dispositivo y comprobar la sesión y los valores.
6. Con la app visible, usar **Probar alerta** y un descanso corto.
7. Probar el comportamiento al bloquear el teléfono. Una alerta retrasada u omitida en ese estado es una limitación del entorno web, no una función garantizada.
8. Al publicar una actualización con versión de caché nueva, comprobar el aviso **Actualizar** y que el historial se conserva.

Los límites y las instrucciones de recuperación están también explicados en `README.md` y en la interfaz.

## Resistencia · 1.2.0

Cinco pruebas nuevas aprobadas: duración en min:seg o segundos, validación independiente de carga, respaldo de duración y borradores, rechazo de datos inconsistentes, exclusión del volumen y compatibilidad con esquema 1.

Recorrido en Chromium: crear Bicicleta fija como Resistencia; registrar 20:30 sin kg/reps/RIR; marcar, recargar, finalizar e iniciar una nueva sesión. La referencia anterior muestra 20:30. Se conserva la cobertura de persistencia anterior; no se volvió a ejecutar la batería de IndexedDB, cuyo código no cambió.
