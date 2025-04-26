// Node.js Console Snake Game - Full Code with Colors (Designed for interactive terminal)

// Game Constants
const boardWidth = 20;
const boardHeight = 10;
const snakeHead = '●';
const snakeBody = '○';
const foodChar = '★';
const emptyChar = '.';
const gameSpeed = 200; // Milliseconds per game tick

// ANSI Color Codes
const colorReset = '\x1b[0m';
const colorGreen = '\x1b[32m'; // Green foreground for snake
const colorRed = '\x1b[31m';  // Red foreground for food
const colorCyan = '\x1b[36m'; // Cyan foreground for empty space (optional)

// Game State Variables
let snake = [{ x: Math.floor(boardWidth / 2), y: Math.floor(boardHeight / 2) }, { x: Math.floor(boardWidth / 2) - 1, y: Math.floor(boardHeight / 2) }];
let food = { x: 5, y: 5 }; // Initial food position
let direction = 'right'; // Current movement direction
let nextDirection = 'right'; // Buffer for next direction from input
let score = 0;
let gameInterval = null; // To hold the interval timer
let isGameOver = false;

// Function to build the board array from current snake and food state
function buildBoardFromState() {
    let board = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(emptyChar));

    // Place food first
    if (food.y >= 0 && food.y < boardHeight && food.x >= 0 && food.x < boardWidth) {
        board[food.y][food.x] = foodChar;
    }

    // Place snake segments
    snake.forEach((segment, index) => {
        // Check if segment is within bounds before placing
        if (segment.y >= 0 && segment.y < boardHeight && segment.x >= 0 && segment.x < boardWidth) {
            board[segment.y][segment.x] = (index === 0) ? snakeHead : snakeBody;
        }
    });

    return board;
}

// Function to render the board (clears console and prints)
function renderBoard(boardToRender) {
    // ANSI escape code to clear console and move cursor to top-left (\x1Bc or \x1B[2J\x1B[H)
    process.stdout.write('\x1Bc'); // Clear console and reset cursor
    // process.stdout.write('\x1B[2J\x1B[H'); // Alternative: Clear screen and home cursor

    console.log("--- Console Snake Game ---");
    for (let y = 0; y < boardHeight; y++) {
        let rowString = '';
        for (let x = 0; x < boardWidth; x++) {
            const cell = boardToRender[y][x];
            switch(cell) {
                case snakeHead:
                case snakeBody:
                    rowString += colorGreen + cell + colorReset;
                    break;
                case foodChar:
                    rowString += colorRed + cell + colorReset;
                    break;
                case emptyChar:
                    rowString += colorCyan + cell + colorReset; // Apply color to empty spaces
                    break;
                default:
                    rowString += cell; // Should not happen with current logic
            }
        }
        console.log(rowString);
    }
    console.log("Score:", score);
    console.log("--------------------------");
    console.log("Direction:", direction, "| Next Direction:", nextDirection);
    if (isGameOver) {
      console.log("GAME OVER! Press Ctrl+C to exit.");
    } else {
      console.log("Use WASD or Arrow keys to move. Press Ctrl+C to exit.");
    }
}

// --- Game Logic Functions ---

// Function to update snake position based on current direction
function updateSnake() {
    // Use the buffered direction
    direction = nextDirection;

    // Calculate the new head position
    let newHead = { x: snake[0].x, y: snake[0].y };

    if (direction === 'up') newHead.y--;
    else if (direction === 'down') newHead.y++;
    else if (direction === 'left') newHead.x--;
    else if (direction === 'right') newHead.x++;

    // Add the new head to the front of the snake array
    snake.unshift(newHead);

    // Check if food is eaten
    const foodWasEaten = (newHead.x === food.x && newHead.y === food.y);

    if (foodWasEaten) {
        score++;
        generateFood(); // Generate new food
        // Tail is NOT removed if food was eaten
    } else {
        // Remove the tail ONLY if food was NOT eaten
        snake.pop();
    }

    // Collision check will happen after update in the game loop
}

// Function to check for collisions (walls or self)
function checkCollisions() {
    const head = snake[0];

    // Check for wall collision
    if (head.x < 0 || head.x >= boardWidth || head.y < 0 || head.y >= boardHeight) {
        return true; // Collided with wall
    }

    // Check for self-collision (start check from the second segment)
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true; // Collided with body
        }
    }

    return false; // No collision
}

// Function to generate new food position (avoid snake body)
function generateFood() {
    let newFoodPos;
    let foodOnSnakeOrOccupied;

    do {
        // Randomly pick x, y within bounds
        newFoodPos = {
            x: Math.floor(Math.random() * boardWidth),
            y: Math.floor(Math.random() * boardHeight)
        };
        // Check if the chosen spot is occupied by the snake
        foodOnSnakeOrOccupied = snake.some(segment => segment.x === newFoodPos.x && segment.y === newFoodPos.y);
        // Could also check if it's on the *current* food spot, though less likely needed if called after eating.
    } while (foodOnSnakeOrOccupied); // Loop until a valid position is found

    food = newFoodPos; // Update the global food position
}


// --- Input Handling ---

// This section sets up process.stdin for raw mode and handles asynchronous key press events.

process.stdin.setRawMode(true); // Needed for key presses without Enter
process.stdin.resume(); // Start listening
process.stdin.setEncoding('utf8'); // Get keys as strings

process.stdin.on('data', (key) => {
    // Handle key presses here to update the 'nextDirection' variable.
    // This buffer helps prevent quick double-taps from causing issues.

    // Mapping common keys (WASD and Arrows) to directions
    let pressedKey = key.toLowerCase(); // Normalize input

    if (pressedKey === '\u0003') { // Ctrl+C to exit
        console.log("\nExiting game.");
        if (gameInterval) clearInterval(gameInterval); // Stop the game loop
        process.exit(); // Terminate the script
    }

    let newDirection = direction; // Start with current direction

    // Update newDirection based on key, preventing direct reversal
    if ((pressedKey === 'w' || pressedKey === '\x1B[A') && direction !== 'down') { // Up or Up Arrow
        newDirection = 'up';
    } else if ((pressedKey === 's' || pressedKey === '\x1B[B') && direction !== 'up') { // Down or Down Arrow
        newDirection = 'down';
    } else if ((pressedKey === 'a' || pressedKey === '\x1B[D') && direction !== 'right') { // Left or Left Arrow
        newDirection = 'left';
    } else if ((pressedKey === 'd' || pressedKey === '\x1B[C') && direction !== 'left') { // Right or Right Arrow
        newDirection = 'right';
    }

    // Only update the nextDirection buffer if a valid move key was pressed
    if (newDirection !== direction) {
        nextDirection = newDirection;
    }
});


// --- Game Loop ---

// This is the main loop that updates the game state and renders.
// It runs repeatedly using setInterval.

function gameTick() {
    if (isGameOver) return; // Stop if game is over

    updateSnake(); // Move the snake

    if (checkCollisions()) {
        isGameOver = true;
        clearInterval(gameInterval); // Stop the loop
        const finalBoard = buildBoardFromState(); // Build final board state (e.g., with snake in wall)
        renderBoard(finalBoard); // Render one last time
        console.log("GAME OVER! Your final score is:", score);
        process.exit(); // Terminate the script
        return;
    }

    // Food collision check and handling is now inside updateSnake

    const currentBoard = buildBoardFromState(); // Rebuild board state with updated positions
    renderBoard(currentBoard); // Render the updated board
}


// --- Initialization and Starting the Game ---

console.log("Preparing Snake Game with Colors...");
console.log("This script is designed for an interactive terminal that supports ANSI colors.");

// Generate initial food position
generateFood();

// Start the game loop
gameInterval = setInterval(gameTick, gameSpeed);

// Input handling is set up above.

// The game loop and input handler will now run continuously in a suitable environment.
// In THIS environment (Baio), it will likely not display interactive output correctly.

