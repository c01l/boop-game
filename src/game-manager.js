import { v4 as uuidv4 } from 'uuid'
import { BoopGame } from './game.js'

export class GameManager {
  constructor () {
    this.games = []
  }

  createGame () {
    const game = new BoopGame(uuidv4())
    this.games.push(game)
    return game
  }

  findGame (gameCode) {
    return this.games.find(game => game.id === gameCode)
  }

  addSpectator(game, socket) {
    socket.emit('game-state', game.getExportedGameState())
    game.addEventListener(event => {
      socket.emit('game-event', event)
    })
  }
}