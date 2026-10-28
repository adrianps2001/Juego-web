# Backrooms

Juego de terror cooperativo en 3D, en primera persona, inspirado en
[los Backrooms](https://backrooms-wiki.wikidot.com/). Se juega en el navegador
con hasta 4 jugadores conectados directamente entre sí (P2P).

Has hecho *noclip* fuera de la realidad y has acabado en un laberinto de
pasillos amarillos, moqueta húmeda y fluorescentes que zumban. Hay que
atravesar tres niveles y encontrar la salida de cada uno:

| Nivel | Nombre | Qué hay |
|---|---|---|
| 0 | El Vestíbulo | Salas irregulares de papel amarillo, una sala de columnas con zona hundida, un pasillo de techo bajo, una sala altísima con escaleras que acaban en el techo y una puerta en lo alto de la pared, una gran zona a oscuras, **Las Caídas** (suelo a distintas alturas con agujeros que te dejan caer al Nivel 1), oficinas abandonadas con cubículos, máquina expendedora y dispensador de agua, paredes que fallan (una se puede atravesar) y la escalera de salida. |
| 1 | Zona Habitable | Almacén de hormigón con columnas, estanterías, palés, bidones y una carretilla; muelle de carga elevado con rampa y escaleras; **cajas de suministros**; el puesto de la M.E.G.; un sector a oscuras; un sótano inundado; niebla y **apagones** periódicos. |
| 2 | Tuberías | Túneles estrechos, calurosos (la energía se recupera más despacio) y llenos de tuberías, en dos alturas unidas por escaleras y un salto sin vuelta; sala de calderas y **escapes de vapor** que queman. |

## Criaturas

| Criatura | Dónde | Cómo se comporta |
|---|---|---|
| **Smiler** | Zonas oscuras de todos los niveles | Solo se mueve por la oscuridad (o por todas partes durante un apagón). Si le apuntas con la linterna se queda quieto. Su ataque es muy fuerte, y después se desvanece. |
| **Hound** | Niveles 1 y 2 | Te detecta si te ve o si te oye correr. Si huyes, te persigue más rápido de lo que andas; si le **plantas cara** (mirarle sin correr), gruñe y acaba retirándose. |
| **Faceling** | Nivel 1 | Humanoide sin cara que pasea sin molestar… salvo que le deslumbres con la linterna. |
| **Skin-Stealer** | Nivel 2 | Solo avanza cuando nadie le mira. Si apartas la vista, se acerca muy rápido. |

## Supervivencia

- **Salud**: la quitan las criaturas, las caídas altas y el vapor. Las
  **vendas** la recuperan. Si llega a cero, despiertas al principio del nivel.
- **Cordura**: baja con el tiempo, más rápido a oscuras o cerca de criaturas, y
  la mitad de rápido con un compañero cerca. El **agua de almendras** la
  recupera. Sin cordura, la salud empieza a bajar.
- **Energía**: correr la gasta. Si la vacías, **no puedes volver a correr hasta
  que se recupere la mitad**. La **barrita energética** la llena del todo.
- **Linterna**: gasta **pilas**.
- **Inventario**: 6 huecos (cada uno apila hasta 5 objetos iguales). Los objetos
  se guardan al cogerlos y se usan cuando tú quieras.

## Controles

`WASD` moverse · `Shift` correr · `Espacio` saltar · ratón mirar · `F`
linterna · `E` coger objetos, abrir cajas y puertas · `1`-`6` o rueda: elegir
objeto · clic izquierdo (o `Q`): usarlo · `Esc` pausa.

## Configuración

Desde el menú principal o desde la pausa (`Esc`) se puede ajustar el volumen
(general, ambiente y efectos), la sensibilidad del ratón, invertir el eje
vertical, el campo de visión, el brillo y el contador de FPS. Los ajustes se
guardan en el navegador. El juego se dibuja siempre a media resolución para que
vaya fluido (`PIXEL_RATIO` en `src/game.ts`).

## Cómo jugar con amigos

1. Uno pulsa **Crear sala** y comparte el código de 5 letras (o el enlace con
   «Copiar enlace»).
2. Los demás escriben el código y pulsan **Unirse**.

## Editar los niveles

Los niveles están en [`src/levels.ts`](src/levels.ts), escritos con un
constructor en metros (cada casilla mide 0,5 m). Algunos ejemplos:

```ts
b.open(20, 2, 26, 20, { ceil: 3.2 });            // sala de 26 × 20 m con techo a 3,2 m
b.open(27, 8, 12, 8, { floor: -0.75 });          // zona hundida
b.ramp(27, 6.5, 12, 1.5, 3, -0.75, 0, true);     // escalera que sube hacia el norte
b.pit(46, 46, 4, 3);                             // agujero (cae al nivel siguiente)
b.prop('desk', 12, 46, Math.PI, { solid: [1.6, 0.8] });
b.crate(44, 6, 0.3, ['agua', 'barrita']);        // caja de suministros
b.lair('hound', 48, 72);                         // guarida de una criatura
b.glitch(19.95, 33, -Math.PI / 2, 1.6, 2.2, true); // pared que se puede atravesar
```

Los parámetros de cada nivel (luces, niebla, cansancio, apagones…) están en
`LEVELS`, en ese mismo archivo.

## Tecnología

- **Three.js** para el 3D, con iluminación precalculada (un mapa de luz que
  tiene en cuenta las sombras de las paredes) y postprocesado (grano de
  película y distorsión cuando pierdes la cordura). No se usan luces
  de Three.js: las linternas (la tuya y las de tus compañeros) se calculan en
  el mismo shader que el mapa de luz, que es mucho más ligero.
- **PeerJS (WebRTC)** para el online. El jugador que crea la sala es el
  anfitrión: mueve a los Smilers y reenvía el estado a los demás.
- **TypeScript + Vite**. Todas las texturas y sonidos se generan por código; no
  hay archivos de recursos.

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
├── levels.ts     # diseño de los tres niveles
├── world.ts      # rejilla con alturas, constructor, colisiones, luz y caminos
├── level3d.ts    # construye la escena 3D de un nivel
├── props.ts      # muebles y objetos de decoración
├── models.ts     # jugadores, criaturas, objetos, puerta, linterna
├── inventory.ts  # inventario
├── lighting.ts   # materiales con la luz precalculada y las linternas
├── settings.ts   # ajustes guardados
├── settings-ui.ts # panel de configuración
├── textures.ts   # texturas dibujadas por código
├── post.ts       # postprocesado
├── game.ts       # bucle del juego en primera persona
├── authority.ts  # lógica del anfitrión (criaturas, apagones, objetos)
├── net.ts        # conexión P2P
├── protocol.ts   # mensajes de red
├── sound.ts      # sonido sintetizado
├── hud.ts        # interfaz
└── main.ts       # menú
```
