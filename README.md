# Backrooms

Juego de terror cooperativo en 3D, en primera persona, inspirado en
[los Backrooms](https://backrooms-wiki.wikidot.com/). Se juega en el navegador
con hasta 4 jugadores conectados directamente entre sí (P2P).

Has hecho *noclip* fuera de la realidad. Los tres primeros niveles siguen el
lore de la wiki de los Backrooms:

| Nivel | Nombre | Qué hay |
|---|---|---|
| 0 | El Umbral | Un **laberinto** de papel amarillo y moqueta húmeda en **dos plantas**: salas pequeñas, pasillos estrechos y anchos que se tuercen, callejones sin salida y salas raras (puertas falsas, una cama sola, escaleras que acaban en el techo, techos bajísimos…). Paredes que **cambian cuando nadie mira**. Piezas: la sala de columnas, la sala de los agujeros con una pasarela encima, **la caída infinita** (un pozo con pisos y pisos hacia abajo: si caes, despiertas en otra parte), el pasillo larguísimo, la sala altísima, zonas de arcos, oficinas y apagón, y las **Habitaciones Rojas**. |
| 1 | La Zona Habitable | Laberinto de **hormigón** en dos plantas: almacenes, cuartos con cajas, charcos y goteras. Piezas: la Sala Manila, la **Base Alpha** de la M.E.G. (zona segura), el **pasillo que no acaba**, el sector en obras con **trabajadores sombra**, el almacén **Gild**, el sector **gótico**, un aparcamiento bajo, los pasillos seguros y el **depósito inundado**. **Parpadeos**: apagones totales. |
| 2 | Pipe Dreams | Laberinto de **túneles** estrechos y calurosos en dos alturas, con tuberías, rejillas sueltas que caen a los túneles de abajo, luces **en serie**, violetas de emergencia, puertas de acero y ventanas al final de los túneles. Piezas: sala de máquinas, sala de calderas con pasarela, campamento abandonado y un pozo sin fondo. Algunas puertas llevan a sitios sueltos: un almacén, un pasillo que vuelve a la misma puerta y **el Vacío**. |

Los niveles se generan con un **laberinto con semilla fija** (todos los
jugadores ven el mismo): salas pequeñas, pasillos, bucles y callejones, en dos
plantas unidas por escaleras, suelos rotos y puertas que dan a una sala sin
suelo (caes a la de abajo). Las salas míticas son piezas hechas a mano.

**Salidas:** cada nivel tiene 6 puertas de salida posibles repartidas por el
mapa, lejos del inicio. En cada partida solo 2, al azar (las mismas para todos
los jugadores), tienen el cartel verde de **SALIDA** encendido y dejan bajar al
nivel siguiente; las demás están cerradas con llave. Las salidas abiertas
**zumban** con un tono grave distinto al de los fluorescentes: se oye al
acercarse y desde su lado.

**Orientarse:** cada 30-40 m hay un **código de sector** pintado con plantilla
en la pared (`D-4`, `K-2`…), todos distintos, para reconocer por dónde se ha
pasado. Con `T` se marca la pared de delante con **tiza** (con `A`/`D`, una
flecha a ese lado); las marcas las ven todos los jugadores, también los que
entran más tarde.

**Director de tensión:** el anfitrión mide cuánto miedo pasa cada jugador y
dosifica la partida. Tras un susto fuerte da un respiro (menos criaturas
nuevas durante un rato); si alguien lleva mucho tiempo tranquilo, suena algo
cerca (pasos, golpes, gruñidos, susurros…) y despiertan más criaturas; y a
quien va mal de salud o cordura le repone algún objeto cerca, donde no lo vea
aparecer.

## Criaturas

| Criatura | Cómo se comporta | Qué hacer |
|---|---|---|
| **Figura oscura** (N0, la única del Nivel 0) | Te acecha desde lejos y se acerca cuando no miras. | Mírala: desaparece. |
| **Smiler** (N1, N2) | Le atraen la luz y el ruido. Si corres o gritas cerca, ataca. | Apaga la linterna, mírale y aléjate despacio. Lanza una **bengala** para atraerlo lejos. |
| **Hound** (N1, N2) | Hostil en cuanto te ve o te oye. | Mírale a los ojos y **grita** (`G`): huye un rato. |
| **Skin-Stealer** (N1) | Parece alguien que llora y pide ayuda. Imita voces. | No te acerques ni le des la espalda; aléjate con calma. |
| **Duller** (N1) | Espera dentro de las paredes. | Si oyes arañar, apártate de la pared. |
| **Clump** (N1, N2) | Ciego: caza por el sonido. | **Agáchate** (`C`) y no hagas ruido. |
| **Faceling** (N2) | Pasea en grupo; se enfada con la luz o si te pegas a él. | Linterna apagada y distancia. |

## Supervivencia

- **Salud**: la quitan las criaturas, las caídas, el vapor y los cristales de
  algunas cajas. **Vendas** y **latas de conserva** la recuperan.
- **Cordura**: baja con el tiempo, mucho más a oscuras, en las Habitaciones
  Rojas o en el Vacío; sube en las zonas seguras. El **agua de almendras** la
  recupera.
- **Energía**: correr la gasta; si la vacías no puedes volver a correr hasta
  recuperar la mitad. **Barrita** y **lata** la reponen.
- **Ruido**: correr, gritar o chapotear te delata; agachado casi no haces ruido.
- **Linterna**: gasta **pilas**, y atrae a los Smilers.
- **Inventario**: hasta 6 huecos (5 objetos iguales en cada uno). La barra solo aparece cuando llevas algo y solo muestra los huecos ocupados.
- **Notas**: hay notas de otros exploradores con pistas (`E` para leerlas).
- **Caer y levantarse**: si mueres con un compañero en pie en el mismo nivel,
  **caes** en vez de morir: tiene 30 s para llegar y levantarte manteniendo
  `E` 3 segundos (vuelves con 35 de salud). Si nadie llega (o te rindes con
  `Espacio`), o si juegas solo, **despiertas en otra parte del nivel**, no al
  principio.
- **Sonido**: las criaturas suenan desde su lado; cuando algo corre hacia ti
  se oyen sus pisadas y el zumbido de las luces se corta.
- **Screamers**: si una criatura te alcanza, si te asomas a la ventana
  equivocada o si deambulas a oscuras con poca cordura, una cara te salta a la
  pantalla con un chillido agudo. Se pueden desactivar en la configuración.

## Controles

`WASD` moverse · `Shift` correr · `C`/`Ctrl` agacharse · `G` gritar ·
`Espacio` saltar · ratón mirar · `F` linterna · `E` coger, abrir, leer y
hablar (mantener junto a un compañero caído: levantarle) · `T` tiza (con
`A`/`D`: flecha) · `1`-`6` o rueda: elegir objeto · clic izquierdo (o `Q`):
usarlo (la bengala se lanza) · `Esc` pausa.

## Configuración

Desde el menú principal o desde la pausa (`Esc`) se puede ajustar el volumen
(general, ambiente y efectos), la sensibilidad del ratón, invertir el eje
vertical, el campo de visión, el brillo, el contador de FPS y el **chat de
voz**. Los ajustes se guardan en el navegador. El juego se dibuja a media
resolución para que vaya fluido y, si el equipo no llega a unos 40 FPS, la
baja solo un poco más (`PIXEL_RATIO` y `MIN_PIXEL_RATIO` en `src/game.ts`).
Las texturas se generan en un hilo aparte (`src/texworker.ts`) para que
cambiar de nivel no congele el juego.

**Si va lento**: casi siempre es que Chrome no está usando la tarjeta gráfica.
En `chrome://gpu`, la línea *WebGL* debe decir *Hardware accelerated*; si dice
*Software only*, activa la aceleración gráfica en `chrome://settings/system`,
actualiza el controlador de la tarjeta o, si Chrome la tiene en su lista
negra, activa `chrome://flags/#ignore-gpu-blocklist`.

**Chat de voz por proximidad**: al activarlo se pide el micrófono. A cada
compañero se le oye según la distancia (a unos 24 m ya no), desde su lado,
ahogado si hay paredes en medio y nada si está en otro nivel. Las voces van
directas entre navegadores (WebRTC), sin pasar por el anfitrión.

## Cómo jugar con amigos

1. Uno pulsa **Crear sala** y comparte el código de 5 letras (o el enlace con
   «Copiar enlace»).
2. Los demás escriben el código y pulsan **Unirse**.

## Editar los niveles

Los niveles están en [`src/levels.ts`](src/levels.ts). Cada uno tiene:

- **Estilos** de laberinto (`Style`): paredes y suelos, altura de los techos,
  anchos de pasillo y de puerta, cuántas salas, cuántas a oscuras, desniveles y
  qué decoración llevan las salas y los callejones (ver
  [`src/decor.ts`](src/decor.ts)).
- **Piezas** hechas a mano en bloques reservados, con el constructor en metros
  (cada casilla mide 0,5 m), y las **puertas** (`ports`) por las que el
  laberinto entra en ellas.
- **Escaleras** entre plantas (`stairwell`) y la elección de **suelos rotos y
  salas sin suelo** (`vertical`).
- La **semilla** (`makeRng`): cámbiala para tener otro laberinto.

El generador está en [`src/maze.ts`](src/maze.ts). Ejemplos del constructor:

```ts
b.open(20, 2, 26, 20, { ceil: 3.2 });            // sala de 26 × 20 m con techo a 3,2 m
b.ramp(27, 6.5, 12, 1.5, 3, -0.75, 0, true);     // escalera que sube hacia el norte
b.pit(46, 46, 4, 3);                             // agujero
b.zone('abyss', 55, 55, 6, 6);                   // caída infinita (se despierta en otro sitio)
b.storey(1);                                     // pasa a construir la planta de arriba
b.hole(44, 36, 26, 20);                          // hueco que cae a la planta de abajo
b.exit(153, 143.5, 0, 'NIVEL 1', true);          // salida al andar por ella
```

Los parámetros de cada nivel (luces, niebla, cansancio, apagones…) están en
`LEVELS`, en ese mismo archivo.

## Tecnología

- **Three.js** para el 3D, con iluminación precalculada (un mapa de luz que
  tiene en cuenta las sombras de las paredes) y postprocesado (grano de
  película y distorsión cuando pierdes la cordura). Un segundo mapa suavizado
  guarda la humedad y el rojo de cada zona, y una variación de color a gran
  escala que disimula la repetición de las texturas. No se usan luces
  de Three.js: las linternas (la tuya y las de tus compañeros) se calculan en
  el mismo shader que el mapa de luz, que es mucho más ligero.
- **PeerJS (WebRTC)** para el online. El jugador que crea la sala es el
  anfitrión: mueve a las criaturas, decide los apagones y los cambios del
  laberinto, lleva el director de tensión y reenvía el estado a los demás. La
  voz va en llamadas directas entre jugadores.
- **TypeScript + Vite**. Todas las texturas y sonidos se generan por código; no
  hay archivos de recursos. Las texturas usan ruido periódico, así que se
  repiten sin que se note el corte.

## Desarrollo

```bash
npm install
npm run dev
```

Para probar en local, abre dos pestañas: una crea la sala y la otra se une.

### Servidor de señalización propio (opcional)

Por defecto se usa el servidor público y gratuito de PeerJS (`0.peerjs.com`),
que solo sirve para que los navegadores se encuentren; la partida va directa
entre jugadores. Si falla, puedes ejecutar uno propio (`npx peer --port 9000`)
y compilar con:

```bash
VITE_PEER_HOST=mi-servidor.com VITE_PEER_PORT=443 npm run build
```

También admite `VITE_PEER_PATH` y `VITE_PEER_SECURE=false`.

Algunas redes muy restrictivas (de empresa, ciertos 4G) necesitan además un
servidor **TURN** para conectar; se añade en las opciones de `Peer`
(`config.iceServers`) en `src/net.ts`.

## Publicación

Cada push a `main` se publica en GitHub Pages con
`.github/workflows/deploy.yml`. Hay que activarlo una vez en
**Settings → Pages → Source: GitHub Actions**.

## Estructura

```
src/
├── levels.ts     # diseño de los tres niveles (estilos, piezas, escaleras)
├── maze.ts       # generador de laberintos con semilla
├── decor.ts      # decoración de salas y callejones
├── world.ts      # rejilla con alturas, constructor, colisiones, luz y caminos
├── level3d.ts    # construye la escena 3D de un nivel
├── props.ts      # muebles y objetos de decoración
├── models.ts     # jugadores, criaturas, objetos, puerta, linterna
├── inventory.ts  # inventario
├── lighting.ts   # materiales con la luz precalculada y las linternas
├── settings.ts   # ajustes guardados
├── settings-ui.ts # panel de configuración
├── textures.ts   # texturas dibujadas por código
├── texworker.ts  # genera las texturas en otro hilo
├── post.ts       # postprocesado
├── screamer.ts   # sustos a pantalla completa
├── game.ts       # bucle del juego en primera persona
├── authority.ts  # lógica del anfitrión (criaturas, director de tensión, apagones, objetos)
├── net.ts        # conexión P2P
├── voice.ts      # chat de voz por proximidad
├── protocol.ts   # mensajes de red
├── sound.ts      # sonido sintetizado
├── hud.ts        # interfaz
└── main.ts       # menú
```

## Créditos

El lore (niveles, entidades, la M.E.G., las notas) está basado en la
[Backrooms Wiki](https://backrooms-wiki.wikidot.com/), cuyo contenido se
publica bajo licencia [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
