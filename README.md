# Backrooms

Juego de terror cooperativo en 3D, en primera persona, inspirado en
[los Backrooms](https://backrooms-wiki.wikidot.com/). Se juega en el navegador
con hasta 4 jugadores conectados directamente entre sí (P2P).

Has hecho *noclip* fuera de la realidad y has acabado en un laberinto de
pasillos amarillos, moqueta húmeda y fluorescentes que zumban. Hay que
atravesar tres niveles y encontrar la puerta de salida de cada uno:

| Nivel | Nombre | Cómo es |
|---|---|---|
| 0 | El Vestíbulo | Papel pintado amarillo, moqueta, sala de columnas y una gran zona a oscuras. |
| 1 | Zona Habitable | Almacén de hormigón con cajas, charcos y fluorescentes colgantes. |
| 2 | Tuberías | Laberinto estrecho de pasillos oscuros con tuberías y bombillas rojizas. |

## Mecánicas

- **Cordura**: baja con el tiempo, mucho más rápido a oscuras o cerca de un
  Smiler, y la mitad de rápido si tienes a un compañero cerca. Si llega a cero,
  te desmayas. El **agua de almendras** la recupera.
- **Linterna** (`F`): gasta pila. Las **pilas** que encuentres la recargan. Si
  apuntas a un Smiler con ella, se queda quieto.
- **Smilers**: viven en las zonas a oscuras (guaridas marcadas con `M` en el
  mapa). Persiguen al jugador más cercano por los pasillos oscuros, pero **no
  pueden entrar en la luz**.
- Si te atrapan, despiertas al principio del nivel.

## Controles

`WASD` moverse · `Shift` correr · ratón mirar · `F` linterna · `E` coger
objetos y abrir puertas · `Esc` soltar el ratón.

## Cómo jugar con amigos

1. Uno pulsa **Crear sala** y comparte el código de 5 letras (o el enlace con
   «Copiar enlace»).
2. Los demás escriben el código y pulsan **Unirse**.

## Editar los mapas

Los mapas están en [`src/maps.ts`](src/maps.ts), dibujados con caracteres.
Cada carácter es una casilla de 1,25 m:

| Carácter | Significado |
|---|---|
| `#` | pared |
| `.` | suelo con luz (los fluorescentes se colocan solos) |
| `,` | suelo a oscuras |
| `S` | punto de inicio |
| `A` | agua de almendras |
| `B` | pilas |
| `M` | guarida de un Smiler |
| `E` | puerta de salida (va en una pared) |
| `x` | caja |
| `w` | charco |

Todas las filas tienen que tener el mismo largo y el borde debe estar cerrado
con paredes. Los parámetros de cada nivel (altura, colores, velocidad de los
Smilers, etc.) están en `LEVELS`, en [`src/world.ts`](src/world.ts).

## Tecnología

- **Three.js** para el 3D, con iluminación precalculada (un mapa de luz que
  tiene en cuenta las sombras de las paredes) y postprocesado (resplandor,
  grano de película y distorsión cuando pierdes la cordura).
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
├── maps.ts       # los mapas de los tres niveles
├── world.ts      # niveles, colisiones, mapa de luz y búsqueda de caminos
├── level3d.ts    # construye la escena 3D de un nivel
├── models.ts     # jugadores, Smiler, objetos, puerta, linterna
├── lighting.ts   # materiales con la luz precalculada
├── textures.ts   # texturas dibujadas por código
├── post.ts       # postprocesado
├── game.ts       # bucle del juego en primera persona
├── authority.ts  # lógica del anfitrión (Smilers, objetos)
├── net.ts        # conexión P2P
├── protocol.ts   # mensajes de red
├── sound.ts      # sonido sintetizado
├── hud.ts        # interfaz
└── main.ts       # menú
```
