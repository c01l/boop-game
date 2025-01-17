let inGame = false
let selectPieceLocationForCurrentPlayer = false
let playerPlacementMode = new Map()
const playerColors = new Map()

function getPiecePlacementMode (playerId) {
  if (!playerPlacementMode.has(playerId)) {
    playerPlacementMode.set(playerId, 1)
  }
  return playerPlacementMode.get(playerId)
}

function renderPiece(piece) {
  const cell = document.querySelector(`.game-cell[data-x="${piece.x}"][data-y="${piece.y}"]`)
  const pieceEl = document.createElement('div')
  pieceEl.classList.add('game-piece')
  pieceEl.style.backgroundColor = playerColors.get(piece.owner)
  pieceEl.style.setProperty('--size', piece.size.toString())
  cell.dataset.pieceId = piece.id
  cell.appendChild(pieceEl)
  cell.setAttribute('disabled', 'disabled')
}


const gameboard = document.querySelector('.game-board')
const playerStats = document.querySelector('.player-stats')

const animationQueue = []

let lastGameState = null
function renderGameState (gameState, store = false) {
  console.log('Render gamestate: ', gameState)
  gameboard.innerHTML = ''
  playerStats.innerHTML = ''

  gameboard.style.setProperty('--gameboard-width', gameState.gameboard.width.toString())
  gameboard.style.setProperty('--gameboard-height', gameState.gameboard.height.toString())

  for (let x = 0; x < gameState.gameboard.width; x++) {
    for (let y = 0; y < gameState.gameboard.height; y++) {
      const cell = document.createElement('button')
      cell.classList.add('game-cell')
      cell.dataset.x = x.toString()
      cell.dataset.y = y.toString()
      gameboard.appendChild(cell)
    }
  }

  const gameInfo = document.createElement('div')
  gameInfo.innerText = `Gamestate: ${gameState.state}`
  if ((gameState.state === 'not-started' || gameState.state === 'game-over') && gameState.players.length > 1) {
    const startGameBtn = document.createElement('button')
    startGameBtn.innerText = gameState.state === 'not-started' ? 'Start Game' : 'Reset game'
    startGameBtn.addEventListener('click', () => {
      socket.emit('start-game')
    })
    gameInfo.appendChild(startGameBtn)
  }
  playerStats.appendChild(gameInfo)

  gameState.players.forEach((player, i) => {
    playerColors.set(player.id, player.color)

    const isCurrentPlayer = gameState.currentPlayerIndex === i

    const playerInfo = document.createElement('div')
    const playerInfoName = document.createElement('div')
    playerInfoName.innerText = player.name + (isCurrentPlayer ? ' (Current)' : '')
    playerInfo.appendChild(playerInfoName)
    const playerPieceInfo = document.createElement('div')
    const placementMode = getPiecePlacementMode(player.id)
    playerPieceInfo.innerHTML = `<span${placementMode === 1 ? ' class="fw-bold"' : ''}>Small: ${player.hand.filter(piece => piece.size === 1).length}</span>, <span${placementMode === 2 ? ' class="fw-bold"' : ''}>Big: ${player.hand.filter(piece => piece.size === 2).length}</span>`
    playerPieceInfo.addEventListener('click', () => {
      playerPlacementMode.set(player.id, placementMode === 1 ? 2 : 1)
      renderGameState(gameState)
    })
    playerInfo.appendChild(playerPieceInfo)
    playerStats.appendChild(playerInfo)
  })

  gameState.gameboard.pieces.forEach(piece => {
    renderPiece(piece)
  })

  document.querySelectorAll('.game-cell:not(:disabled)').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      let currentPlayer = gameState.players[gameState.currentPlayerIndex]
      if (selectPieceLocationForCurrentPlayer) {
        const x = parseInt(e.target.closest('[data-x]').dataset.x)
        const y = parseInt(e.target.closest('[data-y]').dataset.y)
        socket.emit('piece-placement-selected', {
          x,
          y,
          piece: currentPlayer.hand.find(piece => piece.size === getPiecePlacementMode(currentPlayer.id)) ?? currentPlayer.hand[0]
        })
        selectPieceLocationForCurrentPlayer = false
      }
    })
  })

  if (store) {
    console.log("Last state:", lastGameState)
    if(!lastGameState || JSON.stringify(lastGameState.gameboard.pieces) !== JSON.stringify(gameState.gameboard.pieces)) {
      saveState(gameState)
    }
    lastGameState = gameState
  }
}

const startNewGameBtn = document.getElementById('create-game-btn')
const joinGameBtn = document.getElementById('join-game-btn')
const gameCodeInput = document.getElementById('game-code-input')
const gameCodeDisplay = document.getElementById('game-code-display')
const addBrowserPlayerBtn = document.getElementById('add-player-btn')
const addBotBtn = document.getElementById('add-bot-btn')

const socket = io()

function updateUI () {
  const joinSection = document.getElementById('join-section')
  if (inGame) {
    joinSection.style.display = 'none'
    addBrowserPlayerBtn.style.display = 'block'
  } else {
    joinSection.style.display = 'block'
    addBrowserPlayerBtn.style.display = 'none'
  }
}

updateUI()

socket.on('disconnect', () => {
  inGame = false
  updateUI()
})

startNewGameBtn.addEventListener('click', e => {
  e.preventDefault()
  socket.emit('create-game')
  socket.once('game-created', (gameCode) => {
    console.log('Game created with code:', gameCode)
    gameCodeDisplay.innerText = gameCode
    inGame = true
    updateUI()
  })
})

joinGameBtn.addEventListener('click', e => {
  e.preventDefault()
  const gameCode = gameCodeInput.value
  socket.emit('join-game', gameCode)
  socket.once('game-joined', (resp) => {
    if (resp.success) {
      console.log('Joined game with code:', gameCode)
      gameCodeDisplay.innerText = gameCode
      inGame = true
      updateUI()
    } else {
      alert('Failed to join game: ' + resp.message)
    }
  })
})

addBrowserPlayerBtn.addEventListener('click', e => {
  e.preventDefault()
  socket.emit('add-player', { id: Math.random().toString(), name: window.prompt('Name') })
  socket.once('player-added', (player) => {
    console.log('Added player:', player)
  })
})

addBotBtn.addEventListener('click', e => {
  e.preventDefault()
  socket.emit('add-demo-bot', { type: 'simple' })
})

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

socket.on('game-state', (gameState) => {
  if (inGame) {
    animationQueue.push(() => renderGameState(gameState, true))
  }
})

function requestCurrentGameState () {
  socket.emit('get-game-state')
}

socket.on('game-event', (event) => {
  if (event.type === 'player-placed-piece') {
    animationQueue.push(() => {
      renderPiece(event.locatedPiece)
      if(lastGameState) {
        lastGameState.players.forEach(player => {
          player.hand = player.hand.filter(piece => piece.id !== event.locatedPiece.id)
        })
        lastGameState.gameboard.pieces.push(event.locatedPiece)
        saveState(lastGameState)
      }
      requestCurrentGameState()
    })
  }
  if (event.type === 'player-added') {
    requestCurrentGameState()
  }
  if (event.type === 'player-won') {
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.6 },
    });
    const winnerBanner = document.createElement('div')
    winnerBanner.classList.add('position-fixed', 'top-50', 'start-50', 'translate-middle', 'p-5', 'bg-white', 'border', 'border-dark', 'rounded')
    winnerBanner.innerText = `${event.player.name} has won!`
    document.body.appendChild(winnerBanner)
    document.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      document.body.removeChild(winnerBanner)
    }, {once: true, capture: true})
  }
})

socket.on('select-piece-placement', (gameState) => {
  console.log('Need to select piece')
  selectPieceLocationForCurrentPlayer = true
  animationQueue.push(() => renderGameState(gameState, true))
})

let lastPaint = Date.now()
setInterval(() => {
  if (lastPaint + 1000 > Date.now()) {
    return
  }
  if (animationQueue.length > 0) {
    animationQueue.shift()()
    lastPaint = Date.now()
  }
}, 10)

const selectReplacementModal = document.getElementById('select-replacement-modal')
const bsSelectReplacementModal = new bootstrap.Modal(selectReplacementModal)
const replacementSelector = document.getElementById('replacement-selector')

socket.on('select-replacement', (replacements) => {
  console.log('Need to select replacement')

  replacementSelector.innerHTML = ''
  for (const replacement of replacements) {
    const row = document.createElement('div')
    row.addEventListener('mouseover', () => {
      document.querySelectorAll('.game-cell').forEach(cell => {
        cell.style.backgroundColor = ''
      })
      replacement.pieces.forEach(piece => {
        const cell = document.querySelector(`.game-cell[data-x="${piece.x}"][data-y="${piece.y}"]`)
        if (cell) {
          cell.style.backgroundColor = 'yellow'
        }
      })
    })
    const desc = document.createElement('span')
    desc.innerText = replacement.pieces.map(piece => `${piece.x}/${piece.y} (${piece.size === 1 ? 'small' : 'big'})`).join(', ')
    row.appendChild(desc)
    const replacementEl = document.createElement('button')
    replacementEl.innerText = 'Select'
    replacementEl.addEventListener('click', () => {
      socket.emit('replacement-selected', replacement)
      bsSelectReplacementModal.hide()
    })
    row.appendChild(replacementEl)
    replacementSelector.appendChild(row)
  }

  bsSelectReplacementModal.show()
})

let saveIndex = 0
function saveState(gameState) {
  localStorage.setItem('game-state-' + saveIndex, JSON.stringify(gameState))
  console.log("Storing state:", saveIndex)
  gameboard.dataset.currentId = saveIndex.toString()
  saveIndex++
}

function getVisibleStateId() {
  return gameboard.hasAttribute("data-current-id") ? parseInt(gameboard.dataset.currentId) : saveIndex - 1
}
function showPreviousState() {
  const visibleStateId = getVisibleStateId()
  console.log("Goto state:", visibleStateId - 1, "from", visibleStateId)
  if (visibleStateId <= 0) {
    return
  }
  const state = JSON.parse(localStorage.getItem('game-state-' + (visibleStateId - 1)))
  if (state) {
    renderGameState(state, false)
    gameboard.dataset.currentId = (visibleStateId - 1).toString()
  }
}

function showNextState() {
  const visibleStateId = getVisibleStateId()
  if (visibleStateId >= saveIndex - 1) {
    return
  }
  const state = JSON.parse(localStorage.getItem('game-state-' + (visibleStateId + 1)))
  if (state) {
    renderGameState(state, false)
    gameboard.dataset.currentId = (visibleStateId + 1).toString()
  }
}

document.getElementById('prev-state-btn').addEventListener('click', showPreviousState)
document.getElementById('next-state-btn').addEventListener('click', showNextState)