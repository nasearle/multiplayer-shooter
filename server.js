const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);
const session = require('express-session')({
  secret: 'ship game',
  resave: true,
  saveUninitialized: true
});
const sharedsession = require('express-socket.io-session');

const DEBUG = true;
const HITBOX = 30;

const players = {};
const arrBullets = [];
const star = {
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50,
};
const scores = {
  blue: 0,
  red: 0,
};

app.use(express.static(__dirname + '/public'));

app.use(session);
io.use(sharedsession(session));

app.get('/', (req, res) => {
  req.session.ship_exists = false;
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', socket => {
  console.log('a user connected');

  // if the player doesn't already have an existing session, create a new player
  // (check prevents creating multiple ships when browser auto disconnects
  // and reconnects socket)
  if (!socket.handshake.session.ship_exists) {
    // create a new player and add it to our players object
    players[socket.id] = { rotation: 0, x: Math.floor(Math.random() * 700) + 50, y: Math.floor(Math.random() * 500) + 50, playerId: socket.id, team: Math.floor(Math.random() * 2) == 0 ? 'red' : 'blue' };
    // send the players object to the new player
    socket.emit('currentPlayers', players);
    // send the star object to the new player
    socket.emit('starLocation', star);
    // send the current scores
    socket.emit('scoreUpdate', scores);
    // update all other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.handshake.session.ship_exists = true;
    socket.handshake.session.save();
  }

  socket.on('disconnect', () => {
    console.log('user disconnected');
    // remove this player from our players object
    delete players[socket.id];
    // emit a message to all players to remove this player
    io.emit('disconnect', socket.id);
  });

  // when a player moves, update the player data
  socket.on('playerMovement', movementData => {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].rotation = movementData.rotation;
    // emit a message to all players about the player that moved
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('starCollected', () => {
    if (players[socket.id].team === 'red') {
      scores.red += 10;
    } else {
      scores.blue += 10;
    }
    star.x = Math.floor(Math.random() * 700) + 50;
    star.y = Math.floor(Math.random() * 500) + 50;
    io.emit('starLocation', star);
    io.emit('scoreUpdate', scores);
  });

  socket.on('shootBullet', (data) => {
    if (players[socket.id] == undefined) return;

    const speedX = Math.cos(data.rotation + Math.PI / 2) * 20;
    const speedY = Math.sin(data.rotation + Math.PI / 2) * 20;
    const newBullet = data;
    data.speedX = speedX;
    data.speedY = speedY;
    data.ownerId = socket.id; // Attach id of the player to the bullet
    arrBullets.push(newBullet);
  });

  socket.on('sendMsgToServer', (data) => {
    const playerName = '' + socket.id;
    io.emit('addToChat', playerName + ': ' + data);
  });

  socket.on('evalServer', data => {
    if (!DEBUG) return;
    const res = eval(data);
    socket.emit('evalAnswer', res);
  });
});

server.listen(8081, () => {
  console.log(`Listening on ${server.address().port}`);
});


// Update the bullets 60 times per frame and send updates
function ServerGameLoop() {
  for (let i = 0; i < arrBullets.length; i++) {
    const bullet = arrBullets[i];
    bullet.x += bullet.speedX;
    bullet.y += bullet.speedY;

    // Check if this bullet is close enough to hit any player
    for (const id in players) {
      if (bullet.ownerId != id) {
        // And your own bullet shouldn't kill you
        const dx = players[id].x - bullet.x;
        const dy = players[id].y - bullet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < HITBOX) {
          io.emit('playerHit', id); // Tell everyone this player got hit
        }
      }
    }

    // Remove if it goes too far off screen
    if (bullet.x < -10 || bullet.x > 1000 || bullet.y < -10 || bullet.y > 1000) {
      arrBullets.splice(i, 1);
      i--;
    }
  }

  io.emit('bulletsUpdate', arrBullets);
}

setInterval(ServerGameLoop, 16);