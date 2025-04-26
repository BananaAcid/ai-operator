// Node.js Console Tetris Game - Full Code with Next Piece Preview (Designed for interactive terminal)

// Requires the 'readline' module for input (built-in)

const readline = require('readline');
const process = require('process');

// --- Game Constants ---
const boardWidth = 10;
const boardHeight = 20;
const emptyChar = '.';
const filledChar = '#'; // Character for landed blocks
const borderChar = '|';
const bottomChar = '-';
const gameSpeed = 300; // Milliseconds per block drop
const keyInterval = 50; // Milliseconds for key repeat handling

// ANSI Color Codes (Optional - ensure terminal supports them)
const colorReset = '\x1b[0m';
const colorRed = '\x1b[31m';
const colorGreen = '\x1b[32m';
const colorYellow = '\x1b[33m';
const colorBlue = '\x1b[34m';
const colorMagenta = '\x1b[35m';
const colorCyan = '\x1b[36m';
const colorWhite = '\x1b[37m';

const colors = [
    colorCyan, colorYellow, colorMagenta, colorGreen,
    colorRed, colorBlue, colorWhite
];

// Tetromino shapes (minos) - represented as 4x4 grids
const tetrominoes = [
    // I-shape (Cyan)
    [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // O-shape (Yellow)
    [
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // T-shape (Magenta)
    [
        [0, 1, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // S-shape (Green)
    [
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // Z-shape (Red)
    [
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // J-shape (Blue)
    [
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // L-shape (White)
    [
        [0, 0, 1, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ]
];

// --- Game State Variables ---
let board = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(emptyChar));
let currentTetromino = null;
let nextTetromino = null; // Variable to store the next piece
let currentTetrominoX = 0;
let currentTetrominoY = 0;
let score = 0;
let gameInterval = null;
let isGameOver = false;
let gamePaused = false;
let linesCleared = 0;
let level = 1; // Basic level

// --- Helper Functions ---

// Get a random tetromino
function getRandomTetromino() {
    const randomIndex = Math.floor(Math.random() * tetrominoes.length);
    return {
        shape: tetrominoes[randomIndex],
        color: colors[randomIndex] // Assign corresponding color
    };
}

// Rotate a matrix (for tetromino rotation)
function rotateMatrix(matrix) {
    const N = matrix.length;
    const rotated = Array(N).fill(null).map(() => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            rotated[j][N - 1 - i] = matrix[i][j];
        }
    }
    return rotated;
}

// Check for collision
function checkCollision(shape, offsetX, offsetY) {
    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x] !== 0) {
                const boardX = offsetX + x;
                const boardY = offsetY + y;

                // Check bounds
                if (boardX < 0 || boardX >= boardWidth || boardY >= boardHeight) {
                    return true; // Collided with wall or bottom
                }
                 // Check collision with landed blocks (avoid checking above board top)
                if (boardY >= 0 && board[boardY][boardX] !== emptyChar) {
                    return true; // Collided with a filled cell
                }
            }
        }
    }
    return false; // No collision
}

// Lock current tetromino onto the board
function lockTetromino() {
     if (!currentTetromino) return;

    const shape = currentTetromino.shape;
    const color = currentTetromino.color;

    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x] !== 0) {
                const boardX = currentTetrominoX + x;
                const boardY = currentTetrominoY + y;

                 // Only lock if within board bounds (should be guaranteed by checkCollision, but good practice)
                if (boardY >= 0 && boardY < boardHeight && boardX >= 0 && boardX < boardWidth) {
                     // Store color information directly on the board or use a separate color board
                    board[boardY][boardX] = color + filledChar + colorReset; // Store char with color codes
                }
            }
        }
    }
    currentTetromino = null; // Tetromino is now part of the board
}


// Clear completed lines
function clearLines() {
    let linesClearedThisTurn = 0;
    for (let y = boardHeight - 1; y >= 0; y--) {
        // Check if the line is full (doesn't contain the base emptyChar)
        const isLineFull = board[y].every(cell => !cell.includes(emptyChar)); // Check if the cell is NOT the raw empty char

        if (isLineFull) {
            // Remove the full line
            board.splice(y, 1);
            // Add a new empty line at the top
            board.unshift(Array(boardWidth).fill(emptyChar));
            linesClearedThisTurn++;
            y++; // Check the new line that moved down into this position
        }
    }
    linesCleared += linesClearedThisTurn;
    updateScore(linesClearedThisTurn);
    return linesClearedThisTurn; // Return number of lines cleared
}

// Update score based on lines cleared
function updateScore(lines) {
    // Simple scoring system (e.g., Tetris Guidelines)
    const scoreMultiplier = [0, 40, 100, 300, 1200]; // Points for 0, 1, 2, 3, 4 lines
    score += scoreMultiplier[lines] * level;

    // Basic level progression (e.g., level up every 10 lines)
    const newLevel = Math.floor(linesCleared / 10) + 1;
    if (newLevel > level) {
        level = newLevel;
        // Increase game speed (optional, adds challenge)
        // clearInterval(gameInterval);
        // gameInterval = setInterval(gameTick, Math.max(50, gameSpeed - (level - 1) * 20)); // Example speed increase
    }
}


// --- Game Rendering ---

// Function to render the board
function renderBoard() {
    // ANSI escape code to clear console and move cursor to top-left
    process.stdout.write('\x1Bc'); // Clear console and reset cursor

    console.log("--- Console Tetris ---");
    console.log("Score:", score, "| Level:", level, "| Lines:", linesCleared);
    console.log("----------------------");

    // Create a temporary board including the current falling tetromino
    const displayBoard = board.map(row => [...row]); // Deep copy

     if (currentTetromino) {
         const shape = currentTetromino.shape;
         const color = currentTetromino.color;
         for (let y = 0; y < shape.length; y++) {
             for (let x = 0; x < shape[y].length; x++) {
                 if (shape[y][x] !== 0) {
                     const boardX = currentTetrominoX + x;
                     const boardY = currentTetrominoY + y;
                     // Only draw tetromino if within board bounds
                     if (boardY >= 0 && boardY < boardHeight && boardX >= 0 && boardX < boardWidth) {
                          // Apply color directly to the character for display
                         displayBoard[boardY][boardX] = color + filledChar + colorReset;
                     }
                 }
             }
         }
     }


    // Print the board with borders and colors
    for (let y = 0; y < boardHeight; y++) {
        let rowString = borderChar;
        for (let x = 0; x < boardWidth; x++) {
            const cell = displayBoard[y][x];
            if (cell === emptyChar) {
                 rowString += colorCyan + emptyChar + colorReset; // Color empty space (optional)
            } else {
                 // Cell contains character with color codes (from locked blocks or current piece)
                 rowString += cell;
             }
        }
        rowString += borderChar;

        // Add next piece preview to the right side
        if (y >= 0 && y < (nextTetromino ? nextTetromino.shape.length : 0) + 2) { // Add some space
             rowString += "   Next:";
             if (nextTetromino) {
                 if (y > 0 && y <= nextTetromino.shape.length) { // Print shape rows
                      rowString += " " + borderChar + " ";
                      for(let px = 0; px < nextTetromino.shape[y-1].length; px++) {
                          if(nextTetromino.shape[y-1][px] !== 0) {
                              rowString += nextTetromino.color + filledChar + colorReset;
                          } else {
                              rowString += " "; // Empty space in preview
                          }
                      }
                       rowString += " " + borderChar;
                 } else if (y === (nextTetromino.shape.length + 1)) { // Print bottom border for preview
                      rowString += " " + bottomChar.repeat(nextTetromino.shape[0].length + 2);
                 }
             }
        }


        console.log(rowString);
    }

    // Print the bottom border of the main board
    console.log(bottomChar.repeat(boardWidth + 2)); // +2 for borders

    // Print messages below the board
    if (isGameOver) {
        console.log("GAME OVER! Final Score:", score, "| Lines:", linesCleared, "| Level:", level);
        console.log("Press Ctrl+C to exit.");
    } else if (gamePaused) {
         console.log("Game Paused. Press P to resume.");
    } else {
        console.log("Controls: Left/Right Arrows - Move, Up Arrow - Rotate, Down Arrow - Soft Drop, Space - Hard Drop, P - Pause, Ctrl+C - Exit.");
    }
}


// --- Game Logic ---

// Spawn a new tetromino
function spawnTetromino() {
    // Use the next tetromino as the current one
    currentTetromino = nextTetromino;
    // Generate the *next* next tetromino
    nextTetromino = getRandomTetromino();

    currentTetrominoX = Math.floor(boardWidth / 2) - Math.floor(currentTetromino.shape[0].length / 2);
    currentTetrominoY = 0; // Start at the top

    // Check for immediate game over (spawn collision)
    if (checkCollision(currentTetromino.shape, currentTetrominoX, currentTetrominoY)) {
        isGameOver = true;
        if (gameInterval) clearInterval(gameInterval);
        renderBoard(); // Render final state
        console.log("Game Over! Spawn collision.");
        process.exit(); // Exit on game over
    }
}

// Attempt to move or rotate the tetromino
function moveTetromino(deltaX, deltaY, rotate = false) {
    if (!currentTetromino || isGameOver || gamePaused) return false;

    const originalShape = currentTetromino.shape;
    let newShape = originalShape;

    if (rotate) {
        newShape = rotateMatrix(originalShape);
        // Basic wall kick (simple check, doesn't handle all cases like SRS)
        // Check collision at the attempted rotated position
        if (checkCollision(newShape, currentTetrominoX + deltaX, currentTetrominoY + deltaY)) {
             let moved = false;
             // Try shifting right
             if (!checkCollision(newShape, currentTetrominoX + deltaX + 1, currentTetrominoY + deltaY)) {
                 currentTetrominoX += 1;
                 moved = true;
             }
             // Try shifting left (only if shifting right didn't work)
             else if (!checkCollision(newShape, currentTetrominoX + deltaX - 1, currentTetrominoY + deltaY)) {
                 currentTetrominoX -= 1;
                 moved = true;
             }
             // More complex wall kicks might be needed here for full Tetris rules
             // If rotation still collides after simple shifts, the rotation is invalid
             if (checkCollision(newShape, currentTetrominoX + deltaX, currentTetrominoY + deltaY) && !moved) {
                 return false; // Rotation not possible even with simple kicks
             }
        }
        // If rotation is valid (either initially or after kick)
        currentTetromino.shape = newShape; // Update shape if rotated
         return true; // Rotation successful (even if didn't move position due to kick)
    }

    // Check if the new position is valid for movement
    if (!checkCollision(newShape, currentTetrominoX + deltaX, currentTetrominoY + deltaY)) {
        // Move is valid
        currentTetrominoX += deltaX;
        currentTetrominoY += deltaY;
        return true; // Move successful
    } else {
        // Move is not valid (collided)
        if (deltaY > 0 && !rotate) { // If colliding downwards and not rotating, lock the piece
             lockTetromino();
             const lines = clearLines(); // Check and clear lines after locking
             spawnTetromino(); // Spawn the next piece
        }
        return false; // Move failed
    }
}

// Hard drop
function hardDrop() {
    if (!currentTetromino || isGameOver || gamePaused) return;

    while (moveTetromino(0, 1)) {
        // Keep moving down until collision
    }
     // moveTetromino(0, 1) will return false on collision and call lockTetromino/clearLines/spawnTetromino
    // so we don't need explicit lock/clear/spawn here if moveTetromino handles it.
    renderBoard(); // Render immediately after hard drop finishes
}


// Game loop tick
function gameTick() {
    if (isGameOver || gamePaused) return;

    // Attempt to move the piece down
    if (!moveTetromino(0, 1)) {
        // If move down failed, it means it collided, lock handled in moveTetromino
        // No need to lock/clear/spawn here explicitly if moveTetromino does it.
    }
    renderBoard(); // Render the board after the tick
}

// Toggle pause state
function togglePause() {
    gamePaused = !gamePaused;
    if (gamePaused) {
        if (gameInterval) clearInterval(gameInterval);
        renderBoard(); // Render board with pause message
    } else {
        // Resume game loop
        gameInterval = setInterval(gameTick, gameSpeed);
        renderBoard(); // Render board after resuming
    }
}

// --- Input Handling ---

// Set up the readline interface for single key presses
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true); // Needed for key presses without Enter

process.stdin.on('keypress', (str, key) => {
    if (isGameOver) return; // Ignore input if game over

    // Ctrl+C to exit
    if (key.sequence === '\u0003') {
        console.log("\nExiting game.");
        if (gameInterval) clearInterval(gameInterval); // Stop the game loop
        process.exit(); // Terminate the script
    }

    if (key.name === 'p' || key.name === 'P') {
        togglePause();
        return; // Stop processing other keys if pausing/unpausing
    }

    if (gamePaused) return; // Ignore other input if paused


    // Handle movement and rotation keys
    if (key.name === 'left' || str === 'a' || str === 'A') {
        moveTetromino(-1, 0); // Move left
    } else if (key.name === 'right' || str === 'd' || str === 'D') {
        moveTetromino(1, 0); // Move right
    } else if (key.name === 'up' || str === 'w' || str === 'W') {
        moveTetromino(0, 0, true); // Rotate
    } else if (key.name === 'down' || str === 's' || str === 'S') {
        moveTetromino(0, 1); // Soft drop
    } else if (key.name === 'space') {
        hardDrop(); // Hard drop
    }

    renderBoard(); // Re-render after handling input
});


// --- Initialization and Starting the Game ---

console.log("Preparing Tetris Game with Next Piece Preview...");
console.log("This script is designed for an interactive terminal.");
console.log("Run 'node tetris.js' in a standard terminal to play.");


// Generate the first *two* tetrominoes (current and next)
currentTetromino = getRandomTetromino();
nextTetromino = getRandomTetromino();


// Initial spawn (uses the first generated piece)
spawnTetromino(); // This will set current from next and generate a new next


// Start the game loop
gameInterval = setInterval(gameTick, gameSpeed);

// Input handling is set up above.

// The game loop and input handler will now run continuously in a suitable environment.
// In THIS environment (Baio), it will likely not display interactive output correctly.

// Initial render (will be cleared by first gameTick, but good for immediate feedback in terminal)
renderBoard();

