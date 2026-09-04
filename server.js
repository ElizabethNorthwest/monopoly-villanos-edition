const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

function ensureBundledGame(){
  const indexPath = path.join(__dirname,'public','index.html');
  if(fs.existsSync(indexPath)) return;
  const bundleDir = path.join(__dirname,'bundle');
  const parts = [
    'v8.part01.b64',
    'v8.part02a.b64','v8.part02b.b64',
    'v8.part03a.b64','v8.part03b.b64',
    'v8.part04.b64','v8.part05.b64','v8.part06.b64','v8.part07.b64'
  ];
  for(const name of parts){
    if(!fs.existsSync(path.join(bundleDir,name))) throw new Error(`Falta ${name} del paquete V8.`);
  }
  const b64 = parts.map(name => fs.readFileSync(path.join(bundleDir,name),'utf8').trim()).join('');
  const zipPath = path.join(__dirname,'.villanos-v8.zip');
  fs.writeFileSync(zipPath,Buffer.from(b64,'base64'));
  new AdmZip(zipPath).extractAllTo(__dirname,true);
  fs.unlinkSync(zipPath);
  if(!fs.existsSync(indexPath)) throw new Error('No se pudo reconstruir public/index.html.');
  console.log('✅ Interfaz completa de Villano’s Edition V8 reconstruida.');
}

function patchMultiplayerClient(){
  const indexPath = path.join(__dirname,'public','index.html');
  if(!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath,'utf8');

  // La V8 original mezclaba el script externo de Socket.IO con el bloque
  // multijugador dentro de la misma etiqueta. Separamos ambos scripts.
  html = html.replace(
    '<script src="/socket.io/socket.io.js">',
    '<script src="/socket.io/socket.io.js"></script>\n<script>'
  );

  // El bloque online debe ejecutarse después del motor principal del juego.
  const marker = '<script>\n// ===== V8 · MULTIJUGADOR ONLINE =====';
  const start = html.indexOf(marker);
  const headEnd = html.indexOf('</head>');
  if(start >= 0 && headEnd >= 0 && start < headEnd){
    const close = html.indexOf('</script>', start);
    if(close >= 0 && close < headEnd){
      const end = close + '</script>'.length;
      const block = html.slice(start,end);
      html = html.slice(0,start) + html.slice(end);
      html = html.replace('</body>', `${block}\n</body>`);
      console.log('✅ Bloque multijugador movido después del motor del juego.');
    }
  }

  fs.writeFileSync(indexPath,html,'utf8');
}

ensureBundledGame();
patchMultiplayerClient();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  pingTimeout: 20000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const TOKENS = ['🎒','☕','📱','🚐'];

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders(res,filePath){
    if(filePath.endsWith('index.html')) res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  }
}));
app.get('/health', (_req,res)=>res.json({ok:true,rooms:rooms.size}));

function roomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let tries=0;tries<50;tries++){
    let code='';
    for(let i=0;i<6;i++)code+=chars[Math.floor(Math.random()*chars.length)];
    if(!rooms.has(code))return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}
function playerKey(){ return crypto.randomBytes(16).toString('hex'); }
function publicRoom(r){
  return {
    code:r.code,
    started:r.started,
    hostIndex:r.hostIndex,
    players:r.players.map((p,i)=>({index:i,name:p.name,token:p.token,connected:!!p.socketId}))
  };
}
function findPlayerBySocket(socketId){
  for(const room of rooms.values()){
    const idx=room.players.findIndex(p=>p.socketId===socketId);
    if(idx>=0)return {room,idx};
  }
  return null;
}
function broadcastRoom(room){ io.to(room.code).emit('room:update', publicRoom(room)); }
function normalizeName(name){
  const n=String(name||'Estudiante').trim().replace(/\s+/g,' ').slice(0,24);
  return n || 'Estudiante';
}

io.on('connection', socket => {
  socket.on('room:create', ({name,playerKey:existingKey}={}, ack=()=>{}) => {
    const code=roomCode();
    const key=existingKey || playerKey();
    const room={code,started:false,hostIndex:0,state:null,createdAt:Date.now(),players:[{name:normalizeName(name),key,socketId:socket.id,token:TOKENS[0]}]};
    rooms.set(code,room); socket.join(code);
    ack({ok:true,code,playerIndex:0,playerKey:key,host:true,room:publicRoom(room)});
    broadcastRoom(room);
  });

  socket.on('room:join', ({name,code,playerKey:existingKey}={}, ack=()=>{}) => {
    code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    const room=rooms.get(code);
    if(!room)return ack({ok:false,error:'La sala no existe o ya expiró.'});
    let idx=existingKey ? room.players.findIndex(p=>p.key===existingKey) : -1;
    if(idx>=0){
      room.players[idx].socketId=socket.id;
      room.players[idx].name=normalizeName(name||room.players[idx].name);
      socket.join(code);
      ack({ok:true,code,playerIndex:idx,playerKey:room.players[idx].key,host:idx===room.hostIndex,room:publicRoom(room)});
      broadcastRoom(room);
      if(room.started){
        socket.emit('room:started',publicRoom(room));
        if(room.state)socket.emit('state:sync',{code,state:room.state});
      }
      return;
    }
    if(room.started)return ack({ok:false,error:'La partida ya empezó.'});
    if(room.players.length>=4)return ack({ok:false,error:'La sala ya tiene 4 jugadores.'});
    const key=playerKey(); idx=room.players.length;
    room.players.push({name:normalizeName(name),key,socketId:socket.id,token:TOKENS[idx]||'🎓'});
    socket.join(code);
    ack({ok:true,code,playerIndex:idx,playerKey:key,host:false,room:publicRoom(room)});
    broadcastRoom(room);
  });

  socket.on('room:start', ({code}={}, ack=()=>{}) => {
    const found=findPlayerBySocket(socket.id);
    if(!found||found.room.code!==code)return ack({ok:false,error:'No perteneces a esa sala.'});
    const {room,idx}=found;
    if(idx!==room.hostIndex)return ack({ok:false,error:'Solo el anfitrión puede iniciar.'});
    if(room.players.filter(p=>p.socketId).length<2)return ack({ok:false,error:'Se necesitan al menos 2 jugadores conectados.'});
    room.started=true;
    const data=publicRoom(room);
    io.to(room.code).emit('room:started',data);
    broadcastRoom(room);
    ack({ok:true});
  });

  socket.on('state:update', ({code,state}={}, ack=()=>{}) => {
    const found=findPlayerBySocket(socket.id);
    if(!found||found.room.code!==code)return ack({ok:false,error:'Sala inválida.'});
    const {room,idx}=found;
    if(!room.started)return ack({ok:false,error:'La partida no ha empezado.'});
    if(!state||!Array.isArray(state.players)||!Array.isArray(state.spaces))return ack({ok:false,error:'Estado inválido.'});
    const expected = room.state ? Number(room.state.currentPlayer) : 0;
    if(idx!==expected)return ack({ok:false,error:'No es tu turno para modificar la partida.'});
    room.state=state;
    socket.to(room.code).emit('state:sync',{code:room.code,state:room.state});
    ack({ok:true});
  });

  socket.on('room:leave', ({code}={}) => {
    const room=rooms.get(code);
    if(!room)return;
    const idx=room.players.findIndex(p=>p.socketId===socket.id);
    if(idx<0)return;
    const leaving=room.players[idx];
    leaving.socketId=null;
    socket.leave(code);
    io.to(code).emit('player:left',{name:leaving.name,index:idx});
    if(!room.started){
      room.players.splice(idx,1);
      room.players.forEach((p,i)=>p.token=TOKENS[i]||'🎓');
      if(room.players.length===0){rooms.delete(code);return;}
      if(idx===room.hostIndex)room.hostIndex=0;
      broadcastRoom(room);
    }else broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const found=findPlayerBySocket(socket.id);
    if(!found)return;
    const {room,idx}=found;
    room.players[idx].socketId=null;
    broadcastRoom(room);
  });
});

setInterval(()=>{
  const now=Date.now();
  for(const [code,room] of rooms){
    const connected=room.players.some(p=>p.socketId);
    if(!connected && now-room.createdAt>1000*60*60*6)rooms.delete(code);
  }
},1000*60*15).unref();

server.listen(PORT,()=>console.log(`Villano's Edition V8 escuchando en puerto ${PORT}`));
