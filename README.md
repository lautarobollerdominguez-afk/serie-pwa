# Serie · Registro de entrenamiento

PWA personal en español para celular y PC. Código HTML, CSS y JavaScript nativo, sin compilación, CDN, cuenta, servicios de pago ni backend. Los entrenamientos se guardan en IndexedDB del navegador.

## Resistencia · versión 1.2.0

Al añadir o editar un ejercicio, elegí **Registro del ejercicio → Resistencia**. Cada serie permite registrar solamente duración, sin kg, repeticiones ni RIR. Escribí `20:30` para 20 minutos y 30 segundos, o `45` para 45 segundos. Se admiten de 1 segundo a 24 horas. El tiempo se autosalva, se puede marcar como realizado y aparece en el historial y en la referencia anterior. Copiar o duplicar series conserva su duración. Las series de resistencia cuentan en las series totales, sin aportar volumen en kg.

Para una bicicleta ya creada: Rutinas → Editar ejercicio → Registro del ejercicio → Resistencia. Se aplica a las próximas sesiones; los registros anteriores y la sesión abierta conservan su formato. El descanso y los relojes generales siguen funcionando igual.

Los respaldos nuevos usan `schemaVersion: 2`. El importador sigue aceptando la versión 1 y conserva sus registros sin exigir duración a los ejercicios de fuerza. La base IndexedDB existente mantiene su identidad y sus datos. Actualizá ambos dispositivos antes de transferir respaldos nuevos.

## Duración, volumen y reloj general · versión 1.1.0

- **Duración:** arranca al pulsar **Empezar entrenamiento**, continúa al recargar o cambiar de pantalla y se detiene al finalizar. La duración final aparece en el detalle del historial. Se calcula desde las fechas de inicio y finalización, también para sesiones anteriores.
- **Volumen total:** suma `carga en kg × repeticiones` de cada serie que tenga ambos valores completos, de todos los ejercicios de la sesión. Cada serie se cuenta una sola vez, incluidos calentamientos y aproximaciones. Debajo se muestra el volumen de las series marcadas como realizadas. Una carga de 0 kg aporta 0; un campo incompleto no aporta volumen. Se usa la carga registrada, sin duplicar automáticamente las mancuernas ni añadir el peso corporal.
- **Series totales:** número de series de la sesión, con el número de realizadas debajo. Los totales se recalculan al escribir, marcar, desmarcar, añadir, borrar o corregir una serie.
- **Reloj:** el nuevo botón de Entrenar y Rutinas abre un panel con **Temporizador** y **Cronómetro**. En pantallas pequeñas es una hoja inferior; en PC es un diálogo centrado.
- **Temporizador:** configurá minutos y segundos (de 1 segundo a 24 horas). Podés empezar, pausar, reanudar, ajustar ±15 segundos o reiniciar. Al terminar solicita sonido y vibración según Ajustes, y muestra un aviso visual. No modifica el descanso automático entre series.
- **Cronómetro:** cuenta hacia adelante en horas, minutos y segundos. Incluye pausa, reanudación y reinicio. No cuenta el tiempo en pausa.

Los dos relojes generales pueden funcionar a la vez y siguen funcionando al cerrar el panel. Son independientes de la sesión: finalizar un entrenamiento no los reinicia. Las marcas de tiempo, pausas y campos de configuración se guardan en IndexedDB en cada cambio; no se depende de que el navegador ejecute cada segundo. No se escribe en la base en cada tick.

El estado de los relojes generales es local a cada dispositivo y se reinicia al importar un respaldo, igual que el descanso. La duración del entrenamiento sí viaja con sus fechas en el JSON. En la versión 1.1.0 se conservó `schemaVersion: 1` y el nombre de la base anterior: esta actualización no borra sesiones, rutinas ni notas y admite los respaldos 1.0.0.

El temporizador general comparte los límites de alertas descritos más abajo: no garantiza despertar el dispositivo con pantalla bloqueada o la app suspendida.

## Publicar en GitHub Pages

1. Descomprimí `serie-pwa.zip`.
2. Creá un repositorio en GitHub, por ejemplo `serie`. Para usar Pages con una cuenta gratuita, usá un repositorio público. El código será público; tus entrenamientos no forman parte del código.
3. Subí **el contenido de la carpeta `serie-pwa`** al repositorio. `index.html` debe quedar en la raíz, junto a `sw.js` y `manifest.webmanifest`; conservá las carpetas `css`, `js` e `icons`. No subas solamente el ZIP.
4. En el repositorio, abrí **Settings → Pages → Build and deployment**.
5. Elegí **Deploy from a branch**, rama **main**, carpeta **/(root)** y guardá.
6. Esperá a que GitHub termine y abrí el enlace HTTPS que aparece en Pages.
7. Esperá el indicador **Offline listo** antes de desconectarte. Después usá **Instalar app** o las opciones del navegador.

Todas las rutas son relativas. La app funciona tanto en la raíz como en la subcarpeta de un repositorio de GitHub Pages. No necesitás editar la dirección del repositorio en el código.

Guía oficial: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Instalar

- **Android, Chrome:** menú ⋮ → Añadir a pantalla principal / Instalar aplicación. También se ofrece el botón de instalación cuando el navegador lo permite.
- **iPhone o iPad, Safari:** Compartir → Añadir a pantalla de inicio. Activá «Abrir como app web» si aparece.
- **PC, Chrome o Edge:** icono de instalación de la barra de direcciones o menú del navegador.

Abrir `index.html` con doble clic no es suficiente: los módulos y el Service Worker necesitan un sitio servido por HTTP(S), y la instalación/offline exige HTTPS o localhost. El programa detecta la apertura como archivo y explica cómo continuar.

## Primer entrenamiento

1. Abrí **Rutinas**. Hay una rutina vacía con dos días editables; no hay entrenamientos ni cargas de ejemplo precargados.
2. Añadí ejercicios, elegí cómo representar la carga, definí las series iniciales y el descanso en segundos.
3. En **Entrenar**, elegí el día y pulsá **Empezar entrenamiento**.
4. Registrá kg, repeticiones y, si querés, RIR. Se admite punto o coma decimal. En ejercicios de peso corporal, registrá 0 kg si no añadís carga.
5. Marcá la casilla de cada serie realizada. El descanso comienza automáticamente con la duración de ese ejercicio. 0 segundos lo desactiva.
6. Las series nuevas se añaden al final. Su tipo se puede cambiar sin reordenarlas. El menú de cada serie permite duplicarla, eliminarla y dejar el RIR vacío.
7. Usá las notas para guardar indicaciones. El historial anterior aparece debajo del nombre del ejercicio. **Copiar** trae solo las series realizadas de esa sesión y las deja pendientes.
8. Finalizá el entrenamiento. Las series pendientes permanecen diferenciadas de las realizadas. Desde Historial podés consultar, corregir o eliminar una sesión.

Los cambios en plantillas afectan a futuras sesiones. Los nombres y datos históricos se conservan. Un ejercicio reutilizado desde el catálogo comparte historial; cambiar la forma de registrar la carga crea una variante separada para evitar comparaciones incompatibles.

## Guardado y transferencia entre dispositivos

- Cada edición inicia una escritura local; las notas se guardan con cada evento de escritura, sin esperar a salir del campo.
- **Guardado** aparece después de completar la transacción. **Guardando…** indica que todavía hay escrituras pendientes.
- Ante un fallo se mantienen las ediciones en memoria y se ofrecen **Reintentar** y **Respaldar**. No cierres esa pestaña antes de recuperar o exportar los cambios.
- Cada navegador y dispositivo tiene su propia base. No hay sincronización automática.
- En el dispositivo con los datos más recientes: **Ajustes → Exportar respaldo**. Transferí el JSON y elegí **Importar respaldo** en el otro.
- Importar **reemplaza** el registro completo; no combina historiales. La validación ocurre antes del reemplazo y se conserva una copia anterior recuperable desde Ajustes. El reemplazo y la copia usan una sola transacción.
- El respaldo incluye la sesión abierta y los borradores de campos. No reactiva un descanso ni transfiere permisos del otro dispositivo.
- La importación admite archivos de hasta 30 MiB como protección de memoria. No hay límites comerciales de rutinas, días o ejercicios; el almacenamiento disponible depende del navegador.
- Los JSON contienen tu historial. Guardalos fuera del navegador y no los subas al repositorio público de la aplicación.

**Proteger almacenamiento** solicita persistencia al navegador. Este puede denegarla. Incluso concedida, no protege frente a borrar manualmente los datos, perder el dispositivo o un fallo físico. Evitá modo incógnito y generá respaldos periódicos.

La base y las cachés se identifican por la ruta de la app. Cambiar el dominio, la ruta del repositorio, el navegador o el perfil puede abrir otro registro vacío. Exportá antes de hacer esos cambios. Actualizar archivos en la misma dirección conserva IndexedDB.

En navegadores con Web Locks, solo una pestaña puede editar la app a la vez. En navegadores sin esta API, usá una sola pestaña para evitar cambios simultáneos.

## Descanso y límites del sistema

El contador calcula la diferencia entre un timestamp final y la hora actual, en vez de restar segundos por cada intervalo. Se recupera al volver a la app o recargar. Incluye pausa, reanudación y ajustes de 15 segundos. Alterar el reloj del dispositivo puede afectar el cálculo.

Hay un descanso activo. Completar otra serie lo reinicia; editar una serie ya realizada no lo reinicia. Desmarcar o borrar la serie que lo inició cancela ese descanso.

- **Probar alerta** activa y comprueba el audio mediante una interacción del usuario. Comprobá también el volumen y el modo silencio del equipo.
- Se solicita vibración cuando el navegador la admite. Safari/iOS no ofrece `navigator.vibrate()`.
- **Mantener pantalla encendida** usa Wake Lock durante una sesión visible. El sistema puede liberarlo, y no evita un bloqueo manual.
- Las notificaciones son opcionales y requieren permiso. Se intentan cuando el temporizador termina con la página oculta pero todavía en ejecución.
- **No existe una garantía de alarma puntual con pantalla bloqueada, navegador cerrado o app suspendida.** El Service Worker prepara la caché y muestra notificaciones cuando recibe eventos; no se mantiene vivo mediante un contador. Si hubo suspensión, el contador reconoce el descanso vencido al volver. Las alarmas vencidas hace más de 15 segundos no producen un sonido tardío inesperado.

No hay un servicio push, API externa ni proceso nativo que despierte el teléfono. Este límite es deliberadamente visible en la interfaz.

## Organización del código

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Documento, metadatos, accesibilidad básica y carga de módulos |
| `css/styles.css` | Tema oscuro, controles táctiles y diseño adaptable |
| `js/app.js` | Pantallas, formularios, acciones y coordinación del estado |
| `js/core.js` | Modelo, validación de respaldos, historial y cálculos del temporizador |
| `js/clocks.js` | Duración de sesiones, totales, cuenta regresiva y cronómetro |
| `js/db.js` | IndexedDB, cola de escritura, transacciones y copia de recuperación |
| `js/alerts.js` | Audio generado localmente, vibración, notificaciones y Wake Lock |
| `js/pwa.js` | Registro del Service Worker, instalación y actualizaciones |
| `js/icons.js` | Iconos SVG locales de la interfaz |
| `sw.js` | Caché offline versionada y apertura desde notificaciones |
| `manifest.webmanifest` | Identidad, alcance, modo standalone e iconos de instalación |
| `icons/` | Iconos PNG y SVG, incluido maskable |
| `tests/` | Pruebas de lógica, persistencia y vista adaptable |
| `package.json` | Comando opcional de pruebas; no instala dependencias |
| `.nojekyll` | Publicación estática en GitHub Pages |

La base contiene `meta`, `routines`, `exercises`, `sessions`, `sessionExercises`, `sets`, `draftInputs` y `recovery`. Rutinas y días se almacenan como plantillas; sesiones y series son registros independientes. El respaldo lleva `appId`, `schemaVersion`, `appVersion`, `exportedAt` y `data`.

La estructura inicial fue `schemaVersion: 1`; la actual es 2 y acepta importar la anterior. Se rechazan versiones desconocidas sin alterar el registro. Una futura estructura debe añadir una migración explícita en `validateBackup` y, si cambia IndexedDB, incrementar su versión y gestionar `onupgradeneeded`; no se borra la base para actualizar.

## Ejecutar y probar localmente

No hace falta instalar paquetes. Con Python disponible, desde esta carpeta:

```sh
python -m http.server 8000
```

Abrí `http://localhost:8000/` en ese mismo equipo. Una dirección HTTP de la red local no es equivalente a localhost para las APIs seguras. Para probar la instalación en el celular, usá GitHub Pages por HTTPS.

Pruebas de lógica con Node.js 20 o posterior:

```sh
node --test tests/*.test.js
```

Pruebas reales de IndexedDB: abrí `tests/browser.html` desde el servidor y pulsá **Ejecutar pruebas**. Usan una base aislada con datos ficticios. La vista `tests/responsive.html` permite inspeccionar anchos de 320, 390 y 768 px; cerrá otras pestañas de la app antes de abrirla.

Consultá `QA.md` para el alcance de las verificaciones y la comprobación final en el dispositivo real.

## Publicar una actualización

1. Exportá un respaldo antes de cambios importantes.
2. Modificá los archivos necesarios.
3. Incrementá `VERSION` en `sw.js` y `APP_VERSION` en `js/core.js` con el mismo valor; actualizá también `package.json`.
4. Si agregás o renombrás un recurso necesario offline, actualizá `ASSETS` en `sw.js`.
5. Subí todos los archivos modificados a la misma rama y dirección.
6. La app ofrecerá **Actualizar** cuando el nuevo Service Worker esté listo. El botón espera a que se guarden las escrituras antes de recargar.

Las cachés de esta aplicación se renuevan sin borrar IndexedDB ni las cachés de otros proyectos en rutas distintas.

## Privacidad

La aplicación no envía entrenamientos, notas ni respaldos a servidores. GitHub Pages sirve el código público y recibe las solicitudes de carga y actualización como alojamiento. Los datos del entrenamiento están en el navegador. No hay analítica ni fuentes externas.

El código se entrega completo y editable. No incluye tus rutinas reales: las creás desde la interfaz.
