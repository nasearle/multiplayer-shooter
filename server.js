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

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const url = 'mongodb://localhost:27017';
const dbName = 'myGame';

const DEBUG = true;
const isValidPassword = async data => {
  let client;
  try {
    client = await MongoClient.connect(url);
    const db = client.db(dbName);
    const col = db.collection('account');
    let r;

    r = await col.find({ username: data.username, password: data.password }).toArray();
    assert.equal(1, r.length, 'The username and/or password is incorrect');
  } catch (err) {
    throw new Error(err.message);
  }
  client.close();
}
const isUsernameAvailable = async data => {
  let client;
  try {
    client = await MongoClient.connect(url);
    const db = client.db(dbName);
    const col = db.collection('account');
    let r;

    r = await col.find({ username: data.username }).toArray();
    assert.equal(0, r.length, `The username '${data.username}' is taken`);
  } catch (err) {
    throw new Error(err.message);
  }
  client.close();
}
const addUser = async data => {
  let client;
  try {
    client = await MongoClient.connect(url);
    const db = client.db(dbName);
    const col = db.collection('account');
    let r;

    r = await col.insertOne({ username: data.username, password: data.password });
    assert.equal(1, r.result.n, `Failed to create your profile. Check back later`);
  } catch (err) {
    throw new Error(err.message);
  }
  client.close();
}

const HITBOX = 30;
const hitboxSockets = {};
const PLAYERHP = 3
const POWERUPDURATION = 5000;
const RESPAWNTIME = 5000;

const players = {};
const arrBullets = [];
const star = {
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50,
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

  socket.on('signIn', async data => {
    try {
      await isValidPassword(data);
      console.log('password is valid');

      socket.emit('signInResponse', { success: true });
      // if the player doesn't already have an existing session, create a new player
      // (check prevents creating multiple ships when browser auto disconnects
      // and reconnects socket)
      if (!socket.handshake.session.ship_exists) {
        // create a new player and add it to our players object
        players[socket.id] = {
          rotation: 0,
          x: Math.floor(Math.random() * 700) + 50,
          y: Math.floor(Math.random() * 500) + 50,
          playerId: socket.id,
          hp: PLAYERHP,
          kills: 0
        };
        // send the players object to the new player
        socket.emit('currentPlayers', players);
        // send the star object to the new player
        socket.emit('starLocation', star);
        // send the current scores
        // socket.emit('scoreUpdate', players[socket.id].kills);
        // update all other players of the new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
        socket.handshake.session.ship_exists = true;
        socket.handshake.session.save();
      }
    } catch (err) {
      socket.emit('signInResponse', {
        success: false,
        message: err.message,
      });
    }
  });

  socket.on('signUp', async data => {
    try {
      await isUsernameAvailable(data);
      await addUser(data);
      socket.emit('signUpResponse', { success: true });
    } catch (err) {
      socket.emit('signUpResponse', { success: false, message: err.message });
    }
  });

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
    for (const id in players) {
      if (id in hitboxSockets) {
        hitboxSockets[id].emit('playerMoved', players[socket.id], HITBOX);
      } else {
        socket.broadcast.emit('playerMoved', players[socket.id]);
      }
    }
  });

  socket.on('starCollected', () => {
    io.emit('destroyStar');
    players[socket.id].poweredUp = true;
    setTimeout(() => {
      if (players[socket.id]) {
        players[socket.id].poweredUp = false;
      }
      star.x = Math.floor(Math.random() * 700) + 50;
      star.y = Math.floor(Math.random() * 500) + 50;
      io.emit('starLocation', star);
    }, POWERUPDURATION);
  });

  socket.on('shootBullet', (data) => {
    if (players[socket.id] == undefined) return;

    if (players[socket.id].poweredUp) {
      for (let i = -3; i < 3; i++) {
        let rotation = data.rotation;
        rotation = rotation + (0.1 * i);

        const speedX = Math.cos(rotation + Math.PI / 2) * 20;
        const speedY = Math.sin(rotation + Math.PI / 2) * 20;
        arrBullets.push({
          x: data.x,
          y: data.y,
          rotation: data.rotation,
          speedX: speedX,
          speedY: speedY,
          ownerId: socket.id
        });
      }
    } else {
      const speedX = Math.cos(data.rotation + Math.PI / 2) * 20;
      const speedY = Math.sin(data.rotation + Math.PI / 2) * 20;
      const newBullet = data;
      data.speedX = speedX;
      data.speedY = speedY;
      data.ownerId = socket.id; // Attach id of the player to the bullet
      arrBullets.push(newBullet);
    }
  });

  socket.on('sendMsgToServer', (data) => {
    const playerName = '' + socket.id;
    io.emit('addToChat', playerName + ': ' + data);
  });

  socket.on('evalServer', data => {
    if (!DEBUG) return;
    // const res = eval(data);
    if (data == 'showhitboxes') {
      socket.emit('showHitBoxes', players, HITBOX);
      hitboxSockets[socket.id] = socket;
    }
    if (data == 'hidehitboxes') {
      socket.emit('hideHitBoxes', players);
      delete hitboxSockets[socket.id];
    }
    // socket.emit('evalAnswer', res);
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
          arrBullets.splice(i, 1);
          players[id].hp -= 1;
          if (players[id].hp <= 0) {
            io.emit('disconnect', id);
            players[id].hp = PLAYERHP;
            players[id].x = Math.floor(Math.random() * 700) + 50;
            players[id].y = Math.floor(Math.random() * 500) + 50;
            setTimeout(() => {
              if (players[id]) {
                io.emit('respawn', players[id]);
              }
            }, RESPAWNTIME);
            players[bullet.ownerId].kills += 1
            io.emit('scoreUpdate', bullet.ownerId, players[bullet.ownerId].kills);
          }
          i--;
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