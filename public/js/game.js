import { chatJS } from './chat.js';

const config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

function preload() {
  this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.image('otherPlayer', 'assets/enemyBlack5.png');
  this.load.image('star', 'assets/star_gold.png');
  this.load.image('bullet', 'assets/bullet.png');
}

function create() {
  const self = this;
  this.socket = io();
  this.hitbox = 0;
  chatJS(this, this.socket);
  this.otherPlayers = this.physics.add.group();
  // this.bullets = this.physics.add.group();
  this.arrBullets = [];

  this.socket.on('currentPlayers', players => {
    Object.keys(players).forEach(id => {
      if (players[id].playerId === self.socket.id) {
        addPlayer(self, players[id]);
      } else {
        addOtherPlayers(self, players[id]);
      }
    });
  });

  this.socket.on('newPlayer', playerInfo => {
    addOtherPlayers(self, playerInfo);
  });

  this.socket.on('disconnect', playerId => {
    self.otherPlayers.getChildren().forEach(otherPlayer => {
      if (playerId === otherPlayer.playerId) {
        otherPlayer.destroy();
      }
    });
  });

  this.cursors = this.input.keyboard.createCursorKeys();
  this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  this.spaceKey.repeats = 1;

  this.socket.on('playerMoved', (playerInfo, radius) => {
    self.otherPlayers.getChildren().forEach(otherPlayer => {
      if (playerInfo.playerId === otherPlayer.playerId) {
        otherPlayer.setRotation(playerInfo.rotation);
        otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        if (radius) {
          self['graphics-' + otherPlayer.playerId].clear();
          self['graphics-' + otherPlayer.playerId].strokeCircle(otherPlayer.x, otherPlayer.y, radius);
        }
      }
    });
  });

  this.socket.on('bulletsUpdate', arrServerBullets => {
    for (let i = 0; i < arrServerBullets.length; i++) {
      if (self.arrBullets[i] == undefined) {
        self.arrBullets[i] = self.add
          .sprite(arrServerBullets[i].x, arrServerBullets[i].y, 'bullet')
          .setDisplaySize(10, 10);
      } else {
        //Otherwise, just update it!
        self.arrBullets[i].x = arrServerBullets[i].x;
        self.arrBullets[i].y = arrServerBullets[i].y;
      }
    }
    // Otherwise if there's too many, delete the extra
    for (let i = arrServerBullets.length; i < self.arrBullets.length; i++) {
      self.arrBullets[i].destroy();
      self.arrBullets.splice(i, 1);
      i--;
    }
  });

  // Listen for any player hit events and make that player flash
  this.socket.on('playerHit', id => {
    if (id == this.socket.id) {
      self.ship.alpha = 0;
    } else {
      self.otherPlayers.getChildren().forEach(otherPlayer => {
        if (otherPlayer.playerId === id) {
          otherPlayer.alpha = 0;
        }
      });
    }
  });

  this.blueScoreText = this.add.text(16, 16, '', { fontSize: '32px', fill: '#0000FF' });
  this.redScoreText = this.add.text(584, 16, '', { fontSize: '32px', fill: '#FF0000' });

  this.socket.on('scoreUpdate', scores => {
    self.blueScoreText.setText('Blue: ' + scores.blue);
    self.redScoreText.setText('Red: ' + scores.red);
  });

  this.socket.on('starLocation', starLocation => {
    if (self.star) self.star.destroy();
    self.star = self.physics.add.image(starLocation.x, starLocation.y, 'star');
    self.physics.add.overlap(self.ship, self.star, () => {
      self.star.destroy();
      this.socket.emit('starCollected');
    }, null, self);
  })

  this.socket.on('showHitBoxes', (players, radius) => {
    self.hitbox = radius;
    Object.keys(players).forEach(id => {
      const graphicsId = 'graphics-' + id;
      self[graphicsId] = self.add.graphics(0, 0);
      self[graphicsId].lineStyle(1, 0xff00ff, 1.0);
      self[graphicsId].strokeCircle(players[id].x, players[id].y, radius);
    });
  });
}

function update() {
  if (this.ship) {
    if (this.cursors.left.isDown) {
      this.ship.setAngularVelocity(-150);
    } else if (this.cursors.right.isDown) {
      this.ship.setAngularVelocity(150);
    } else {
      this.ship.setAngularVelocity(0);
    }

    if (this.cursors.up.isDown) {
      this.physics.velocityFromRotation(this.ship.rotation + 1.5, 100, this.ship.body.acceleration);
    } else {
      this.ship.setAcceleration(0);
    }

    this.physics.world.wrap(this.ship, 5);

    // emit player movement
    const x = this.ship.x;
    const y = this.ship.y;
    const r = this.ship.rotation;
    if (this.ship.oldPosition && (x !== this.ship.oldPosition.x || y !== this.ship.oldPosition.y || r !== this.ship.oldPosition.rotation)) {
      this.socket.emit('playerMovement', { x: this.ship.x, y: this.ship.y, rotation: this.ship.rotation });
      if (this.hitbox) {
        this['graphics-' + this.socket.id].clear();
        this['graphics-' + this.socket.id].strokeCircle(this.ship.x, this.ship.y, this.hitbox);
      }
    }

    // save old position data
    this.ship.oldPosition = {
      x: this.ship.x,
      y: this.ship.y,
      rotation: this.ship.rotation
    };

    if (this.spaceKey.isDown && !this.shot) {
      this.shot = true;
      this.socket.emit('shootBullet', { x: this.ship.x, y: this.ship.y, rotation: this.ship.rotation });
    }
    if (!this.spaceKey.isDown) this.shot = false;

    if (this.ship.alpha < 1) {
      this.ship.alpha += (1 - this.ship.alpha) * 0.16;
    } else {
      this.ship.alpha = 1;
    }
  }

  this.otherPlayers.getChildren().forEach(otherPlayer => {
    if (otherPlayer.alpha < 1) {
      otherPlayer.alpha += (1 - otherPlayer.alpha) * 0.16;;
    } else {
      otherPlayer.alpha = 1;
    }
  });
}

function addPlayer(self, playerInfo) {
  self.ship = self.physics.add
    .image(playerInfo.x, playerInfo.y, 'ship')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);
  if (playerInfo.team === 'blue') {
    self.ship.setTint(0x0000ff);
  } else {
    self.ship.setTint(0xff0000);
  }
  self.ship.setDrag(100);
  self.ship.setAngularDrag(100);
  self.ship.setMaxVelocity(200);
}

function addOtherPlayers(self, playerInfo) {
  const otherPlayer = self.add
    .sprite(playerInfo.x, playerInfo.y, 'otherPlayer')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);
  if (playerInfo.team === 'blue') {
    otherPlayer.setTint(0x0000ff);
  } else {
    otherPlayer.setTint(0xff0000);
  }
  otherPlayer.playerId = playerInfo.playerId;
  self.otherPlayers.add(otherPlayer);
}

export const socket = game.socket;