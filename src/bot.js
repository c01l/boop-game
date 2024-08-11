import { GameSimulator, Player } from './game.js'

/**
 * @typedef {import('./game.js').GameState} GameState
 * @typedef {import('./game.js').Piece} Piece
 * @typedef {import('./game.js').LocatedPiece} LocatedPiece
 * @typedef {import('./game.js').Replacement} Replacement
 */

/**
 *
 * @param {string} type
 * @return {Player}
 */
export function generateBot (type) {
  switch (type) {
    case 'random':
      return generateBot(randomElem(['stupid', 'simple']))
    case 'stupid':
      return new StupidBot()
    case 'simple':
      return new SimpleBot()
    default:
      throw new Error(`Unknown bot type: ${type}`)
  }
}

function arraySum (arr) {
  return arr.reduce((acc, size) => acc + size, 0)
}

async function delay (func, ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(func())
    }, ms)
  })
}

function randomElem (arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

class BotPlayer extends Player {
  constructor (name, delayMs = 1000) {
    super(
      Math.random().toString(),
      name,
      async (gameState) => await delay(() => this.botPlacePiece(gameState), delayMs),
      async (replacements) => await delay(() => this.botReplace(replacements), delayMs),
    )
  }

  /**
   * @param {GameState} gameState
   * @return {{x:number, y:number, piece:Piece}}
   */
  botPlacePiece (gameState) {
    throw new Error('Not implemented')
  }

  /**
   * @param {Replacement[]} replacements
   * @return {string} id of the selected replacement
   */
  botReplace (replacements) {
    throw new Error('Not implemented')
  }
}

class StupidBot extends BotPlayer {
  constructor (delayMs = 1000) {
    super(
      'Stupid Bot',
      delayMs,
    )
  }

  async botReplace (replacements) {
    return replacements[0].id
  }

  async botPlacePiece (gameState) {
    const pos = randomElem(gameState.gameboard.getFreePositions())
    return { x: pos.x, y: pos.y, piece: randomElem(this.hand) }
  }
}

class SimpleBot extends BotPlayer {
  constructor (delayMs = 1000) {
    super(
      'Simple Bot',
      delayMs
    )
  }

  botReplace (replacements) {
    replacements = replacements.sort((a, b) => arraySum(a.pieces.map(piece => piece.size)) - arraySum(b.pieces.map(piece => piece.size)))
    return replacements[0].id
  }

  botPlacePiece (gameState) {
    // use large pieces first (this is not the smartest after all...)
    const smallPiece = this.hand.find(piece => piece.size === 1)
    const bigPiece = this.hand.find(piece => piece.size === 2)
    const pieceOptions = [bigPiece, smallPiece].filter(piece => piece)
    const allPositions = gameState.gameboard.getFreePositions()
    const allOptions = []
    allPositions.forEach(pos => {
      pieceOptions.forEach(piece => {
        allOptions.push({ x: pos.x, y: pos.y, piece, rating: 100, locatedPiece: piece.toLocatedPiece(pos.x, pos.y) })
      })
    })
    const simulator = new GameSimulator(gameState.clone())

    // if you have a winning move, do it
    const winningMove = doesPlayerHaveWinningMove(this, gameState)
    if (winningMove) {
      return winningMove
    }

    // remove options where opponent would have a winning move
    // there needs to be two large pieces next to each other, the third space must be free and the player needs to have a large piece in his hand after your move
    let options = allOptions.filter(option => {
      simulator.placePiece(option.locatedPiece)
      const resultingState = simulator.gameState
      simulator.rollback()
      const winner = resultingState.getWinningPlayer()
      if (winner && winner.id !== this.id) {
        // we would push the opponent to a win
        return false
      }

      let replacements
      while ((replacements = resultingState.gameboard.getReplacements()).length > 0) {
        const chosenReplacement = this.botReplace(replacements) // assume others choose the same way...
        const replacement = replacements.find(replacement => replacement.id === chosenReplacement)
        resultingState.applyReplacement(replacement)
      }

      const nextPlayer = resultingState.getNextPlayer()
      if (doesPlayerHaveWinningMove(nextPlayer, resultingState.clone())) {
        // opponent would have a winning move
        return false
      }

      return true
    })

    // rate remaining options
    for (const option of options) {
      // if you are further away from the wall than that is better
      option.rating += this.calculateDistanceToWall(option.x, option.y, gameState)

      simulator.placePiece(option.locatedPiece)
      const nextState = simulator.gameState.clone()
      simulator.rollback()

      const kickedOut = getKickedOutPieces(gameState, nextState)
      kickedOut.forEach(piece => {
        if (piece.owner === this.id) {
          // kicking out cats from yourself is bad
          option.rating -= 10 * piece.size
        } else {
          // kicking out cats from opponents is good
          option.rating += 10 * piece.size
        }
      })

      // getting a replacement is good
      getBestReplacement(this.id, nextState)?.pieces.forEach(piece => {
        option.rating += 100 * piece.size
      })
      // giving a replacement is bad
      getBestReplacement(gameState.getNextPlayer().id, nextState)?.pieces.forEach(piece => {
        option.rating -= 100 * piece.size
      })
    }

    // pick best option
    const sortedOptions = options.sort((a, b) => b.rating - a.rating)
    const option = sortedOptions[0] ?? randomElem(allOptions) // there is no good options -> just pick a random one
    return { x: option.x, y: option.y, piece: option.piece }
  }

  calculateDistanceToWall (x, y, gameState) {
    return Math.min(x, y, gameState.gameboard.width - x, gameState.gameboard.height - y)
  }
}

function doesPlayerHaveWinningMove (player, gameState) {
  const simulator = new GameSimulator(gameState.clone())
  const piece = player.hand.find(piece => piece.size === 2)
  if (!piece) {
    return false
  }
  for (const pos of simulator.gameState.gameboard.getFreePositions()) {
    const locatedPiece = piece.toLocatedPiece(pos.x, pos.y)
    simulator.placePiece(locatedPiece)
    if (simulator.gameState.getWinningPlayer()?.id === player.id) {
      return { x: pos.x, y: pos.y, piece }
    }
    simulator.rollback()
  }
  return false
}

function getBestReplacement (player, gameState) {
  const replacements = gameState.gameboard.getReplacements().filter(r => r.pieces[0].owner === player)
  if (replacements.length === 0) {
    return null
  }

  const sortedByReplacedSize = replacements.sort((a, b) => arraySum(b.pieces.map(piece => piece.size)) - arraySum(a.pieces.map(piece => piece.size)));
  return sortedByReplacedSize[sortedByReplacedSize.length - 1]
}

function getKickedOutPieces(gameState1, gameState2) {
  const pieces1 = gameState1.gameboard.getActivePieces()
  const pieces2 = gameState2.gameboard.getActivePieces()
  return pieces1.filter(piece1 => !pieces2.find(piece2 => piece1.id === piece2.id))
}

function getKickedOutPiecesForPlayer(player, gameState1, gameState2) {
  return getKickedOutPieces(gameState1, gameState2).filter(piece => piece.owner === player)
}