import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GameManager } from './game-manager.js'
import { Player } from './game.js'
import { generateBot } from './bot.js'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log(__dirname)

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

app.get('/client.js', (req, res) => {
  res.sendFile(__dirname + '/client.js')
})

app.get('/bootstrap.js', (req, res) => {
  res.sendFile(resolve(__dirname + '/../node_modules/bootstrap/dist/js/bootstrap.min.js'))
})

app.get('/bootstrap.css', (req, res) => {
  res.sendFile(resolve(__dirname + '/../node_modules/bootstrap/dist/css/bootstrap.min.css'))
})

app.get('/confetti.js', (req, res) => {
  res.sendFile(resolve(__dirname + '/../node_modules/@tsparticles/confetti/tsparticles.confetti.bundle.min.js'))
})

const gameManager = new GameManager()
const playerIdToSocketMap = new Map()

io.on('connection', (socket) => {
  console.log('a user connected')
  socket.on('disconnect', () => {
    console.log('user disconnected')
  })
  socket.on('create-game', () => {
    const game = gameManager.createGame()
    console.log('create-game: ' + game.id)
    io.emit('game-created', game.id)
    gameManager.addSpectator(game, socket)
    socket.currentGame = game
  })
  socket.on('join-game', (gameCode) => {
    console.log('joining-game: ' + gameCode)
    const game = gameManager.findGame(gameCode)
    if (game) {
      socket.currentGame = game
      io.emit('game-joined', { success: true, gameState: game.state })
    } else {
      io.emit('game-joined', { success: false, message: 'Game not found' })
    }
  })
  socket.on('add-player', async ({id, name}) => {
    console.log("adding player", id, name)
    if (socket.currentGame) {
      const player = new Player(
        id,
        name,
        (gameState) => {
          return new Promise((resolve, reject) => {
            const gameStateExported = socket.currentGame.getExportedGameState()
            socket.emit('select-piece-placement', gameStateExported)
            socket.once('piece-placement-selected', (placement) => {
              if (typeof placement !== "object" || typeof placement.piece !== "object" || typeof placement.x !== "number" || typeof placement.y !== "number" || typeof placement.piece.id !== "string" || typeof placement.piece.size !== "number" || typeof placement.piece.owner !== "string") {
                reject('Invalid placement: ' + JSON.stringify(placement))
              }
              resolve(placement)
            })
          })
        },
        (replacements) => {
          socket.emit('select-replacement', replacements)
          return new Promise((resolve, reject) => {
            socket.once('replacement-selected', (replacement) => {
              resolve(replacement.id)
            })
          })
        }
        )
      playerIdToSocketMap.set(id, socket)
      await socket.currentGame.addPlayer(player)
      io.emit('player-added', player)

    } else {
      console.error('add-player: no current game')
    }
  })

  socket.on('add-demo-bot', async ({type}) => {
    console.log("adding bot of type", type)
    if (socket.currentGame) {
      const player = generateBot(type)
      playerIdToSocketMap.set(player.id, socket)
      await socket.currentGame.addPlayer(player)
      io.emit('player-added', player)
    } else {
      console.error('add-demo-bot: no current game')
    }
  })

  socket.on('get-game-state', () => {
    if (socket.currentGame) {
      socket.emit('game-state', socket.currentGame.getExportedGameState())
    } else {
      console.error('get-game-state: no current game')
    }
  })

  socket.on('start-game', async () => {
    if (socket.currentGame) {
      try {
        await socket.currentGame.startGame()
      } catch (e) {
        console.error('start-game:', e)
        return
      }
      let i = 0
      while(await socket.currentGame.nextRound()) {
        i++
        console.log('round', i)
      }
    } else {
      console.error('start-game: no current game')
    }
  })
})

server.listen(3000, () => {
  console.log('listening on *:3000')
})