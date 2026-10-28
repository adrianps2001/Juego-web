# Juego Web 3D

Juego 3D en el navegador con multijugador online P2P para hasta 4 jugadores.

- **Three.js**: gráficos 3D
- **PeerJS (WebRTC)**: conexión directa entre jugadores, sin servidor de juego propio
- **TypeScript + Vite**: lenguaje y herramienta de desarrollo

## Cómo jugar

1. Un jugador pulsa **Crear sala** y comparte el código de 5 letras (o el enlace con «Copiar enlace»).
2. Los demás escriben el código y pulsan **Unirse** (máximo 4 jugadores).
3. Controles: clic para capturar el ratón y mover la cámara · **WASD** o flechas para moverse · **Espacio** para saltar · **Esc** para soltar el ratón.

## Desarrollo

```bash
npm install
npm run dev
```

Abre la dirección que muestra Vite. Para probar en local, abre dos pestañas: una crea la sala y la otra se une.

## Cómo funciona el online

- El jugador que crea la sala es el **anfitrión**: los demás se conectan a él por WebRTC.
- Cada jugador envía su posición al anfitrión 20 veces por segundo y el anfitrión reenvía a todos el estado completo.
- Para que los navegadores se encuentren se usa el servidor público y gratuito de PeerJS (`0.peerjs.com`). Solo sirve para iniciar la conexión: los datos de la partida van directos entre jugadores.
- Si el anfitrión cierra la pestaña, la sala se cierra para todos.

### Servidor de señalización propio (opcional)

Si el servidor público falla, puedes ejecutar uno propio (`npx peer --port 9000`) y compilar con:

```bash
VITE_PEER_HOST=mi-servidor.com VITE_PEER_PORT=443 npm run build
```

También admite `VITE_PEER_PATH` y `VITE_PEER_SECURE=false` (para HTTP sin TLS).

### Si dos jugadores no consiguen conectarse

WebRTC atraviesa la mayoría de routers usando servidores STUN, pero algunas redes muy restrictivas (redes de empresa, ciertos 4G o CG-NAT) necesitan además un servidor **TURN**. Se pueden añadir en las opciones de `Peer` (`config.iceServers`) en `src/net.ts`.

## Publicación

Cada push a `main` se publica automáticamente en GitHub Pages con el workflow `.github/workflows/deploy.yml`. Antes hay que activarlo una vez en **Settings → Pages → Source: GitHub Actions**.

## Estructura

```
src/
├── main.ts      # menú, HUD y arranque
├── game.ts      # escena 3D, movimiento, cámara e interpolación
├── net.ts       # conexión P2P (anfitrión / invitado)
├── protocol.ts  # tipos de mensajes y constantes compartidas
└── style.css
```
