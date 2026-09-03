MONOPOLY: VILLANO'S EDITION — V8 MULTIJUGADOR ONLINE

QUÉ HACE
- Crear sala privada con código de 6 caracteres.
- Unirse desde otro celular/PC.
- 2 a 4 jugadores.
- El anfitrión inicia la partida.
- Solo el jugador de turno puede modificar el estado.
- Dinero, propiedades, hipotecas, mejoras, recursos, posición y turno se sincronizan.
- Si un jugador pierde conexión, la sala conserva su lugar mientras el servidor siga activo.
- Incluye también botón «Jugar modo local».

CÓMO PROBAR EN TU PC
1. Instala Node.js 20 o superior.
2. Abre una terminal dentro de esta carpeta.
3. Ejecuta:
       npm install
       npm start
4. Abre:
       http://localhost:3000
5. Para simular varios jugadores abre otras ventanas/navegadores.

CÓMO PONER V8 ONLINE
La V8 necesita un servidor porque usa WebSockets. No basta con arrastrarla a Netlify como la V7.

OPCIÓN SIMPLE: RENDER
1. Sube esta carpeta a un repositorio de GitHub.
2. En Render crea un nuevo Web Service y conecta el repositorio.
3. Render detectará render.yaml, o configura:
       Build Command: npm install
       Start Command: npm start
4. Al terminar tendrás una URL HTTPS pública.
5. Todos abren esa misma URL, uno crea sala y comparte el código.

IMPORTANTE
- Esta V8 usa un servidor en memoria. Si el servidor se reinicia, las salas online activas se pierden.
- Es adecuada como primera versión para jugar entre amigos.
- Una versión posterior puede usar una base de datos para recuperar partidas incluso después de reinicios.
- Las cinemáticas del jugador que ejecuta una acción siguen siendo locales; los demás reciben el resultado
  sincronizado al finalizar la acción. Esto evita que dos teléfonos intenten resolver la misma carta/dado.
