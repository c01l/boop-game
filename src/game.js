import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {string} PlayerId
 */

/**
 * @typedef {string} PieceId
 */

/**
 * @typedef {string} ReplacementId
 */

const playerColors = [
  '#FF0000',
  '#00FF00',
  '#0000FF',
]

export class Piece {
  /**
   * @param {PieceId} id
   * @param {number} size
   * @param {PlayerId} owner
   */
  constructor (id, size, owner) {
    this.id = id
    this.size = size
    this.owner = owner
  }

  toLocatedPiece (x, y) {
    return new LocatedPiece(this.id, this.size, this.owner, x, y)
  }

  clone () {
    return new Piece(this.id, this.size, this.owner)
  }
}

export class LocatedPiece extends Piece {
  /**
   * @param {PieceId} id
   * @param {number} size
   * @param {PlayerId} owner
   * @param {number} x
   * @param {number} y
   */
  constructor (id, size, owner, x, y) {
    super(id, size, owner)
    this.x = x
    this.y = y
  }

  toUnlocatedPiece () {
    return new Piece(this.id, this.size, this.owner)
  }

  clone () {
    return new LocatedPiece(this.id, this.size, this.owner, this.x, this.y)
  }
}

export class Replacement {
  /**
   * @param {ReplacementId} id
   * @param {LocatedPiece[]} pieces
   */
  constructor (id, pieces) {
    this.id = id
    this.pieces = pieces
  }
}

/**
 * @typedef {Object} ExportedGameboard
 * @property {number} width
 * @property {number} height
 * @property {LocatedPiece[]} pieces
 */

export class Gameboard {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor (width, height) {
    this.width = width
    this.height = height
    this.field = []
    this.resetField()
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {boolean}
   */
  isOnBoard (x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  isFree (x, y) {
    return this.getPiece(x, y) === null
  }

  resetField () {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        this.clearPiece(x, y)
      }
    }
  }

  /**
   * @param {LocatedPiece|null} piece
   */
  setPiece (piece) {
    this.field[piece.x * this.width + piece.y] = piece
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {Piece|null}
   */
  getPiece (x, y) {
    if (!this.isOnBoard(x, y)) {
      return null
    }
    return this.field[x * this.width + y]
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  clearPiece (x, y) {
    this.field[x * this.width + y] = null
  }

  /**
   * @return {LocatedPiece[]}
   */
  getActivePieces () {
    return this.field.map((piece, index) => {
      if (piece !== null) {
        return piece.toLocatedPiece(Math.floor(index / this.width), index % this.width)
      }
      return null
    }).filter(piece => piece !== null)
  }

  getFreePositions () {
    const freePositions = []
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.isFree(x, y)) {
          freePositions.push({ x, y })
        }
      }
    }
    return freePositions
  }

  /**
   * Returns all options for replacements for all players
   * @return {Replacement[]}
   */
  getReplacements () {
    const piecesByCurrentPlayer = this.getActivePieces()

    const replacements = []
    // three pieces in a row can be replaced
    for (const piece of piecesByCurrentPlayer) {
      // check for all directions
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) {
            continue
          }
          const nextPiece = this.getPiece(piece.x + dx, piece.y + dy)
          const nextNextPiece = this.getPiece(piece.x + dx * 2, piece.y + dy * 2)

          // are there 3 pieces in a row?
          if (!nextPiece || !nextNextPiece) {
            continue
          }

          // are those pieces owned by the player?
          if (nextPiece.owner !== piece.owner || nextNextPiece.owner !== piece.owner) {
            continue
          }

          // do we already have the replacement in our findings?
          if (replacements.some(replacement => {
            const pieceList = new Set(replacement.pieces.map(piece => piece.id))
            pieceList.add(piece.id)
            pieceList.add(nextPiece.id)
            pieceList.add(nextNextPiece.id)
            return pieceList.size === 3
          })) {
            continue
          }

          const replacement = new Replacement(uuidv4(), [piece, nextPiece, nextNextPiece])
          replacements.push(replacement)
        }
      }
    }
    return replacements
  }

  /**
   * @return {ExportedGameboard}
   */
  toExport () {
    return {
      width: this.width,
      height: this.height,
      pieces: this.getActivePieces()
    }
  }

  static fromExport (exported) {
    const gameboard = new Gameboard(exported.width, exported.height)
    for (const piece of exported.pieces) {
      gameboard.setPiece(piece)
    }
    return gameboard
  }
}

export const State = {
  NOT_STARTED: 'not-started',
  CHOOSING_PLACE: 'choosing-place',
  GAME_OVER: 'game-over'
}

export class GameState {
  /**
   *
   * @param {string} state
   * @param {Gameboard} gameboard
   * @param {number} currentPlayerIndex
   * @param {Player[]} players
   */
  constructor (state, gameboard, currentPlayerIndex, players = []) {
    this.state = state
    this.gameboard = gameboard
    this.currentPlayerIndex = currentPlayerIndex
    this.players = players
  }

  /**
   *
   * @param {PlayerId} id
   * @return {Player|null}
   */
  getPlayerById (id) {
    return this.players.find(player => player.id === id)
  }

  getCurrentPlayer () {
    return this.players[this.currentPlayerIndex]
  }

  getNextPlayer () {
    return this.players[(this.currentPlayerIndex + 1) % this.players.length]
  }

  getWinningPlayer () {
    const replacements = this.gameboard.getReplacements()
    for (const r of replacements) {
      if (r.pieces.length === 3 && r.pieces.every(piece => piece.size === 2)) {
        return this.getPlayerById(r.pieces[0].owner)
      }
    }
  }

  gotoInitialState () {
    this.gameboard.resetField()
    this.state = State.CHOOSING_PLACE
    for (const p of this.players) {
      p.hand = []
      for (let i = 0; i < 8; i++) {
        p.hand.push(new Piece(uuidv4(), 1, p.id))
      }
    }
  }

  itsNextsPlayerTurn () {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
  }

  applyReplacement (replacement) {
    for (const piece of replacement.pieces) {
      this.gameboard.clearPiece(piece.x, piece.y)
      if (piece.size === 1) {
        piece.size += 1
      }
      this.getPlayerById(replacement.pieces[0].owner).hand.push(piece.toUnlocatedPiece())
    }
  }

  /**
   * @return {ExportedGameState}
   */
  toExport () {
    return {
      state: this.state,
      players: this.players.map(player => {
        return {
          id: player.id,
          name: player.name,
          color: player.color,
          hand: player.hand
        }
      }),
      gameboard: this.gameboard.toExport(),
      currentPlayerIndex: this.currentPlayerIndex,
    }
  }

  /**
   * @param {ExportedGameState} exported
   * @return {GameState}
   */
  static fromExport (exported) {
    return new GameState(
      exported.state,
      Gameboard.fromExport(exported.gameboard),
      exported.currentPlayerIndex,
      exported.players.map(player => {
        const p = new Player(
          player.id,
          player.name,
          async () => {throw new Error('Not implemented for reconstruction from export')},
          async () => {throw new Error('Not implemented for reconstruction from export')}
        )
        p.color = player.color
        p.hand = player.hand.map(piece => piece.clone())
        return p
      }),
    )
  }

  clone () {
    return GameState.fromExport(this.toExport())
  }
}

/**
 * @callback Player~selectWhereToPlaceWhichPiece
 * @param {GameState} gameState
 * @returns {{piece: Piece, x: number, y:number}|Promise<{piece: Piece, x: number, y:number}>}
 */

/**
 * @callback Player~selectReplacement
 * @param {Replacement[]} replacements
 * @returns {ReplacementId|Promise<ReplacementId>}
 */

export class Player {
  /**
   * @param {PlayerId} id
   * @param {string} name
   * @param {Player~selectWhereToPlaceWhichPiece} selectWhereToPlaceWhichPiece
   * @param {Player~selectReplacement} selectReplacement
   */
  constructor (id, name, selectWhereToPlaceWhichPiece, selectReplacement) {
    this.id = id
    this.name = name
    this.color = null
    this.hand = []
    this.selectWhereToPlaceWhichPiece = selectWhereToPlaceWhichPiece
    this.selectReplacement = selectReplacement
  }

  /**
   * @param {GameState} gameState
   * @returns {Promise<LocatedPiece>}
   */
  async whereToPlaceWhichPiece (gameState) {
    const { piece, x, y } = await ((this.selectWhereToPlaceWhichPiece)(gameState))
    if (!gameState.gameboard.isFree(x, y)) {
      throw new Error('Cannot place a piece where another piece is')
    }
    if (!gameState.gameboard.isOnBoard(x, y)) {
      throw new Error('Cannot place a piece outside of the board (' + x + ' / ' + y + ')')
    }
    const storedPiece = this.hand.find(p => p.id === piece.id)
    if (!storedPiece) {
      throw new Error('Piece not owned')
    }
    if (storedPiece.size !== piece.size || storedPiece.owner !== piece.owner) {
      throw new Error('Invalid piece')
    }
    return new LocatedPiece(piece.id, piece.size, this.id, x, y)
  }

  /**
   *
   * @param {Replacement[]} replacements
   * @returns {Promise<Replacement>}
   */
  async chooseReplacement (replacements) {
    console.log('Choosing from replacements because we got so many...', replacements)
    const replacementId = await ((this.selectReplacement)(replacements))
    const replacement = replacements.find(r => r.id === replacementId)
    if (!replacement) {
      throw new Error('Invalid replacement')
    }
    return replacement
  }
}

export class GameEvent {
  /**
   * @param {string} type
   */
  constructor (type) {
    this.type = type
  }

  toString () {
    return 'GameEvent(' + this.type + ')'
  }
}

export class PlayerAddedEvent extends GameEvent {
  /**
   * @param {Player} player
   */
  constructor (player) {
    super('player-added')
    this.player = player
  }

  toString () {
    return 'Player ' + this.player.name + ' has been added'
  }
}

export class GameStartEvent extends GameEvent {
  constructor () {
    super('game-start')
  }

  toString () {
    return 'The game has started'
  }
}

export class PlayerPlacedPieceEvent extends GameEvent {
  /**
   * @param {LocatedPiece} locatedPiece
   */
  constructor (locatedPiece) {
    super('player-placed-piece')
    this.locatedPiece = locatedPiece
  }

  toString () {
    return 'Player placed a piece (size = ' + this.locatedPiece.size + ') at (' + this.locatedPiece.x + ', ' + this.locatedPiece.y + ') by ' + this.locatedPiece.owner
  }
}

export class PlayerWonEvent extends GameEvent {
  /**
   * @param {Player} player
   */
  constructor (player) {
    super('player-won')
    this.player = player
  }

  toString () {
    return 'Player ' + this.player.name + ' has won'
  }
}

/**
 * @typedef {Object} ExportedPlayer
 * @property {PlayerId} id
 * @property {string} name
 * @property {string} color
 * @property {Piece[]} hand
 */

/**
 * @typedef {Object} ExportedGameState
 * @property {string} state
 * @property {ExportedPlayer[]} players
 * @property {ExportedGameboard} gameboard
 * @property {number} currentPlayerIndex
 */

export class BoopGame {
  /** @type {Gameboard} */
  #gameBoard
  /** @type {GameState} */
  #gameState
  /** @type {((GameEvent) => void)[]} */
  #eventListeners = []

  constructor (id, options = {}) {
    this.id = id
    const width = options.width || 6
    const height = options.height || 6
    this.#gameBoard = new Gameboard(width, height)
    this.#gameState = new GameState(
      State.NOT_STARTED,
      this.#gameBoard,
      0
    )
  }

  /**
   * @return {ExportedGameState}
   */
  getExportedGameState () {
    return this.#gameState.toExport()
  }

  addEventListener (cb) {
    this.#eventListeners.push(cb)
  }

  /**
   * @param {GameEvent} event
   */
  async emitEvent (event) {
    for (const listener of this.#eventListeners) {
      await listener(event)
    }
  }

  /**
   * @param {Player} player
   * @return {Promise<void>}
   */
  async addPlayer (player) {
    player.color = playerColors[this.#gameState.players.length]
    this.#gameState.players.push(player)
    await this.emitEvent(new PlayerAddedEvent(player))
  }

  async startGame () {
    if (this.#gameState.players.length < 2) {
      throw new Error('Not enough players')
    }
    this.#gameState.gotoInitialState()
    await this.emitEvent(new GameStartEvent())
  }

  async nextRound () {
    switch (this.#gameState.state) {
      case State.NOT_STARTED:
        throw new Error('Game not started')
      case State.CHOOSING_PLACE:
        const player = this.#gameState.getCurrentPlayer()
        const piece = await player.whereToPlaceWhichPiece(this.#gameState)
        if (this.#gameBoard.getPiece(piece.x, piece.y) !== null) {
          throw new Error('Cannot put a piece where another piece is')
        }
        const gameSimulator = new GameSimulator(this.#gameState)
        gameSimulator.placePieceAsPlayer(piece, player)
        await this.emitEvent(new PlayerPlacedPieceEvent(piece))

        const winningPlayer = this.#gameState.getWinningPlayer()
        if (winningPlayer) {
          await this.emitEvent(new PlayerWonEvent(winningPlayer))
          this.#gameState.state = State.GAME_OVER
          return false
        }
        const replacements = this.#gameBoard.getReplacements()
        if (player.hand.length === 0) {
          const possibleReplacements = this.#gameBoard.getActivePieces()
            .filter(p => p.owner === player.id)
            .map(piece => new Replacement(uuidv4(), [piece]))

          await this.#performReplacement(player, possibleReplacements)
        }
        if (replacements.length > 0) {
          let playerIterator = this.#gameState.currentPlayerIndex
          let first = true
          while (playerIterator !== this.#gameState.currentPlayerIndex || first) {
            const iteratedPlayer = this.#gameState.players[playerIterator]
            const possibleReplacements = this.#gameBoard.getReplacements()
              .filter(r => r.pieces[0].owner === iteratedPlayer.id)
            if (possibleReplacements.length > 0) {
              await this.#performReplacement(iteratedPlayer, possibleReplacements)
            }
            playerIterator = (playerIterator + 1) % this.#gameState.players.length
            first = false
          }
        }
        this.#gameState.itsNextsPlayerTurn()
        return true
      case State.GAME_OVER:
        return false
    }
  }

  async #performReplacement (player, replacements) {
    if (replacements.length === 0) {
      throw new Error('Invalid game state')
    }
    const replacement = replacements.length === 1
      ? replacements[0]
      : await player.chooseReplacement(replacements)
    this.#gameState.applyReplacement(replacement)
  }
}

export class GameSimulator {
  #stack
  /**
   * @param {GameState} gameState
   */
  constructor (gameState) {
    this.gameState = gameState
    this.#stack = []
  }

  rollback () {
    if (this.#stack.length === 0) {
      throw new Error('Cannot rollback')
    }
    this.gameState = this.#stack.pop()
  }

  /**
   * @param {LocatedPiece} piece
   * @param {Player} player
   */
  placePieceAsPlayer (piece, player) {
    player.hand = player.hand.filter(p => p.id !== piece.id)
    this.placePiece(piece)
  }

  /**
   * @param {LocatedPiece} piece
   * @return {void}
   */
  placePiece (piece) {
    this.#stack.push(this.gameState.clone())

    if (this.gameState.gameboard.getPiece(piece.x, piece.y) !== null) {
      throw new Error('Cannot put a piece where another piece is')
    }

    this.gameState.gameboard.setPiece(piece)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        this.#pushPiece(piece.x + dx, piece.y + dy, piece.size, dx, dy)
      }
    }
  }

  #pushPiece (x, y, strength, dx, dy) {
    const piece = this.gameState.gameboard.getPiece(x, y)
    if (!piece) {
      return
    }

    if (piece.size > strength) {
      // cannot push a piece that is larger
      return
    }

    const targetX = x + dx
    const targetY = y + dy

    if (!this.gameState.gameboard.isOnBoard(targetX, targetY)) {
      // remove from board and return into players hand
      this.gameState.gameboard.clearPiece(x, y)
      this.gameState.getPlayerById(piece.owner).hand.push(piece)
      return
    }

    const nextPiece = this.gameState.gameboard.getPiece(targetX, targetY)
    if (nextPiece !== null) {
      // cannot push somewhere another piece is
      return
    }

    this.gameState.gameboard.clearPiece(x, y)
    this.gameState.gameboard.setPiece(piece.toLocatedPiece(targetX, targetY))
  }
}