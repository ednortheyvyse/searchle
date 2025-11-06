// App.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

// =========================
// CONFIG & WORD LIST
// =========================
const GAME_CONFIG = { TILE: 55, MAX_ATTEMPTS: 6, STORAGE_KEY: "searchle:v1" };

async function generatePuzzle(onProgress) {
  // 1. Fetch a random 6-letter word for the horizontal base
  onProgress({ current: 0, total: 7 });
  // Add ml (means like) to get more common English words.
  const horizRes = await fetch('https://api.datamuse.com/words?sp=??????&max=100&ml=love');
  const horizWords = await horizRes.json();
  if (horizWords.length === 0) throw new Error("Could not fetch horizontal word");
  const horizontalWord = horizWords[Math.floor(Math.random() * horizWords.length)].word.toUpperCase();
  onProgress({ current: 1, total: 7 }); // 1 for horizontal word

  let validVerticals = [];
  const usedWords = new Set([horizontalWord]);

  // Define the required lengths for vertical words and shuffle them
  const requiredVerticalLengths = [6, 5, 5, 4, 4, 4]; // 1x6, 2x5, 3x4
  requiredVerticalLengths.sort(() => 0.5 - Math.random()); // Shuffle for random assignment to intersection points

  // 2. For each letter, fetch a vertical word that intersects
  const promises = horizontalWord.split("").map(async (letter, index) => {
    const wordLength = requiredVerticalLengths[index]; // Use the assigned length for this intersection
    // Add ml to this query as well for better word quality
    const query = `?sp=${'?'.repeat(wordLength)}&max=50&sl=${letter}&ml=love`;
    const vertRes = await fetch(`https://api.datamuse.com/words${query}`);
    const vertWords = await vertRes.json();

    if (vertWords.length > 0) {
      // Filter out words already used and ensure they contain the letter
      const availableWords = vertWords
        .map(w => w.word.toUpperCase())
        .filter(w => w.includes(letter) && !usedWords.has(w));

      if (availableWords.length > 0) {
        const selectedWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        usedWords.add(selectedWord); // Add to used words for subsequent checks
        onProgress({ current: 1 + index + 1, total: 7 }); // Update progress (1 horiz + index completed verticals + 1 current)
        return { word: selectedWord, intersectIndex: index };
      }
    }
    onProgress({ current: 1 + index + 1, total: 7 }); // Update progress even if no word found
    return null; // No suitable word found for this intersection
  });

  const results = (await Promise.all(promises)).filter(Boolean); // Filter out nulls
  
  // Check if all horizontal letters have a vertical word
  if (results.length !== horizontalWord.length) {
    console.warn(`Puzzle generation failed: Not all horizontal letters have a vertical word. Retrying...`);
    return generatePuzzle(onProgress);
  }

  // Check if the required length distribution is met
  const counts = results.reduce((acc, v) => {
    acc[v.word.length] = (acc[v.word.length] || 0) + 1;
    return acc;
  }, {});

  const hasRequiredCounts =
    counts[6] === 1 &&
    counts[5] === 2 &&
    counts[4] === 3;

  if (!hasRequiredCounts) {
    console.warn(`Puzzle generation failed: Incorrect word length distribution. Retrying...`);
    return generatePuzzle(onProgress);
  }

  validVerticals = results; // All checks passed, assign results

  return {
    horizontal: { word: horizontalWord, x: 0, y: 4 },
    verticals: validVerticals,
  };
}

// =========================
// UTILS
// =========================
function getLetterPositions(p) {
  const cells = [];
  const { word: horizWord, x: startX, y: startY } = p.horizontal;

  // Horizontal
  horizWord.split("").forEach((ch, i) => {
    cells.push({ letter: ch, x: startX + i, y: startY });
  });

  // Verticals
  p.verticals.forEach(({ word, intersectIndex }) => {
    const anchorLetter = horizWord[intersectIndex];
    const anchorX = startX + intersectIndex;
    const anchorY = startY;
    const intersectYIndex = word.indexOf(anchorLetter);
    if (intersectYIndex === -1) return;

    word.split("").forEach((ch, i) => {
      const posY = anchorY - (intersectYIndex - i);
      const posX = anchorX;
      cells.push({ letter: ch, x: posX, y: posY });
    });
  });

  const unique = new Map();
  cells.forEach((c) => unique.set(`${c.x},${c.y}`, c));
  return Array.from(unique.values());
}

// =========================
// OPTIONAL: SENTRY (Monitoring)
// =========================
// Uncomment if you want Sentry
// import * as Sentry from "@sentry/react";
// import { BrowserTracing } from "@sentry/tracing";
// Sentry.init({
//   dsn: "https://YOUR_DSN_HERE",
//   integrations: [new BrowserTracing()],
//   tracesSampleRate: 1.0,
// });

// Minimal AWS/Lambda-style logger (swap `/api/log` for your endpoint)
async function logClientEvent(event) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...event,
        ts: Date.now(),
        ua: navigator.userAgent,
        url: window.location.href,
      }),
    });
  } catch {
    // swallow
  }
}

// Global error hooks
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    logClientEvent({ type: "error", message: e.message, stack: e.error?.stack });
  });
  window.addEventListener("unhandledrejection", (e) => {
    logClientEvent({ type: "unhandledrejection", reason: String(e.reason) });
  });
}

// =========================
// KEYBOARD COMPONENT
// =========================
const Keyboard = React.memo(function Keyboard({ onKeyPress, keyStates }) {
  const keyboardLayout = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Backspace"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "ArrowUp", "Enter"],
    ["Z", "X", "C", "V", "B", "N", "M", "ArrowLeft", "ArrowDown", "ArrowRight"]
  ];

  const getKeyColor = useCallback((key) => {
    const state = keyStates[key];
    switch (state) {
      case "correct":
        return "bg-green-500 text-white";
      case "present":
        return "bg-yellow-500 text-white";
      case "incorrect":
        return "bg-gray-100 text-gray-800"; // Default color for incorrect, keeping the red X overlay
      default:
        return "bg-gray-100 text-gray-800";
    }
  }, [keyStates]);

  return (
    <div className="flex flex-col items-center w-full max-w-2xl">
      {keyboardLayout.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center my-0.5">
          {row.map((key) => (
            <button
              key={key}
              className={`relative flex items-center justify-center h-10 mx-px text-sm font-bold uppercase rounded border border-gray-400 ${getKeyColor(key)}`}
              style={{ width: key.length > 1 ? '55px' : '40px' }} // Adjust width for special keys
              onClick={() => onKeyPress({ key: key, preventDefault: () => {} })} // Pass mock event with preventDefault
            >
              {key === "Backspace" ? "⌫" :
               key === "ArrowLeft" ? "←"
               : key === "ArrowRight" ? "→"
               : key === "ArrowUp" ? "↑"
               : key === "ArrowDown" ? "↓"
               : key
              }
              {keyStates[key] === 'incorrect' && (
                <div className="absolute inset-0 flex items-center justify-center text-red-500 font-black text-2xl" style={{pointerEvents: 'none'}}>
                  X
                </div>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
});

// =========================
// HELP MODAL COMPONENT
// =========================
const HelpModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-2xl font-bold"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Aoboshi One', cursive: true }}>How to Play</h2>
        <div className="space-y-4 text-gray-700">
          <p>Guess the hidden words. There is 1 horizontal word and the rest are vertical, all interconnected, sharing letters.</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Click on a tile and type letters (A-Z). Use your keyboard or the on-screen one. Backspace clears a tile.</li>
            <li>When you're ready, hit the "Submit" button to check your guesses.</li>
            <li>You can use Tab/Shift+Tab or the arrow keys to move between tiles.</li>
          </ul>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-500 text-white flex items-center justify-center font-bold rounded">L</div>
            <span><b>Green</b>: The letter is in the word and in the correct spot.</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-yellow-500 text-white flex items-center justify-center font-bold rounded">E</div>
            <span><b>Yellow</b>: The letter is in the word but in the wrong spot.</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gray-100 border border-gray-400 flex items-center justify-center font-bold rounded">T</div>
            <span><b>Grey</b>: The letter is not in the word.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================
// CELL (Memoized for perf)
// =========================
const Cell = React.memo(function Cell({
  x, y, offsetX, offsetY, TILE, isActive, onClick, value, state, revealIndex
}) {
  // Animation variants
  const flip = {
    initial: { rotateX: 0 },
    reveal: { rotateX: [0, 90, 0] },
  };

  // Color by state
  const bg =
    state === "correct"
      ? "bg-green-500" // Matches keyboard correct
      : state === "present"
      ? "bg-yellow-500" // Matches keyboard present
      : "bg-gray-100"; // Incorrect and default (unguessed) blocks are light grey

  return (
   <motion.div
       onClick={onClick}
      className={`absolute flex items-center justify-center border font-bold shadow-sm cursor-pointer transition-all ${
        isActive ? "bg-blue-200 border-blue-400" : `border-gray-400 ${bg}`
      }`}
      style={{
        // Inset the tile slightly to create a gap
        left: `${(x - offsetX) * TILE + 2}px`,
        top: `${(y - offsetY) * TILE + 2}px`,
        width: `${TILE - 4}px`,
        height: `${TILE - 4}px`,
        fontSize: "1.25rem",
        textTransform: "uppercase",
        perspective: 600,
      }}
      // bounce a tiny bit on type
      animate={{ scale: value ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20, mass: 0.5 }}
    >
      <AnimatePresence>
        <motion.div
          key={`${state}-${revealIndex ?? "idle"}`}
          variants={flip}
          initial="initial"
          animate={state ? "reveal" : "initial"}
          transition={{ duration: 0.35, delay: (revealIndex ?? 0) * 0.07 }}
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
             placeItems: "center",
            backfaceVisibility: "hidden",
            borderRadius: "0",
          }}
        >
          {value}
         </motion.div>
      </AnimatePresence>
    </motion.div>
  );
});

// =========================
// MAIN APP
// =========================
export default function App() {
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [displayProgress, setDisplayProgress] = useState({ current: 0, total: 0 });
  const [showHelp, setShowHelp] = useState(false);

  // Effect to animate the progress counter
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        // Use a functional update to get the latest state
        setDisplayProgress(currentDisplay => {
          if (currentDisplay.current < progress.current) {
            return { ...currentDisplay, current: currentDisplay.current + 1, total: progress.total };
          }
          return { ...currentDisplay, total: progress.total }; // Ensure total is up-to-date
        });
      }, 100); // Update display every 100ms
      return () => clearInterval(interval);
    }
  }, [loading, progress]);

  // Initial puzzle generation (and subsequent new games)
  useEffect(() => {
    const getNewPuzzle = async () => {
      setLoading(true);
      setProgress({ current: 0, total: 7 }); // Initialize progress
      setDisplayProgress({ current: 0, total: 7 }); // Reset display progress
      try {
        const newPuzzle = await generatePuzzle(setProgress); // Pass setProgress callback
        setPuzzle(newPuzzle);
      } catch (error) {
        console.error("Failed to generate puzzle:", error);
        // Handle error, maybe show a message to the user
      }
      setLoading(false);
    };
    getNewPuzzle();
  }, []);

  const initialCells = useMemo(() => puzzle ? getLetterPositions(puzzle) : [], [puzzle]);
  const TILE = GAME_CONFIG.TILE;
  const MAX_ATTEMPTS = GAME_CONFIG.MAX_ATTEMPTS;

  const offsetX = useMemo(() => Math.min(...initialCells.map((c) => c.x)), [initialCells]);
  const offsetY = useMemo(() => Math.min(...initialCells.map((c) => c.y)), [initialCells]);
  const width = useMemo(
    () => (Math.max(...initialCells.map((c) => c.x)) - offsetX + 1) * TILE,
    [initialCells, offsetX, TILE]
  );
  const height = useMemo(
    () => (Math.max(...initialCells.map((c) => c.y)) - offsetY + 1) * TILE,
    [initialCells, offsetY, TILE]
  );

  // Tab order
  const sortedCells = useMemo(() => {
    return [...initialCells].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  }, [initialCells]);

  // ======= PERSISTENCE (3) =======
  const [entries, setEntries] = useState({});
  const [attempts, setAttempts] = useState(0);

  const [activeCell, setActiveCell] = useState(null);
  const [cellStates, setCellStates] = useState({}); // 'correct' | 'present' | 'incorrect'
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [revealTick, setRevealTick] = useState(0); // bump to retrigger reveal anim

  // Load game state from localStorage when puzzle is available
  useEffect(() => {
    if (puzzle) {
      try {
        const raw = localStorage.getItem(GAME_CONFIG.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const currentPuzzleKey = getLetterPositions(puzzle).map((c) => c.letter).join("");

          if (parsed.puzzleKey === currentPuzzleKey) {
            setEntries(parsed.entries ?? {});
            setAttempts(parsed.attempts ?? 0);
            // Note: cellStates are not restored here. They will be re-evaluated on next submit.
            // If you need to restore visual state (colors) immediately, you'd need to re-run
            // the handleSubmit logic or a similar evaluation here.
          } else {
            // If puzzle key doesn't match, clear old data
            localStorage.removeItem(GAME_CONFIG.STORAGE_KEY);
            setEntries({}); // Ensure current entries are also cleared
            setAttempts(0);
          }
        }
      } catch (e) {
        console.error("Failed to load game state from localStorage:", e);
      }
    }
  }, [puzzle]); // Depend on puzzle to ensure it's loaded

  // save
  useEffect(() => {
    if (puzzle) try {
      const puzzleKey = getLetterPositions(puzzle).map((c) => c.letter).join("");
      localStorage.setItem(
        GAME_CONFIG.STORAGE_KEY,
        JSON.stringify({ entries, attempts, puzzleKey })
      );
    } catch { /* ignore */ }
  }, [entries, attempts, puzzle]);

  // ======= VALIDATION EFFICIENCY (8) =======
  const horizontalWord = puzzle?.horizontal.word ?? '';
  const horizontalSet = useMemo(() => new Set(horizontalWord.split("")), [horizontalWord]);
  const verticalSets = useMemo(
    () => puzzle?.verticals.map((v) => new Set(v.word.split(""))) ?? [],
    [puzzle]
  ); // Note: This should depend on `puzzle.verticals` if they can change.

  // Derived key states for the virtual keyboard
  const keyboardKeyStates = useMemo(() => {
    return Object.values(cellStates).reduce((acc, cellState) => {
      const letter = cellState.letter;
      if (!letter) return acc;

      const currentState = acc[letter];
      const newState = cellState.state;

      // Prioritize correct > present > incorrect
      if (newState === "correct") {
        acc[letter] = "correct";
      } else if (newState === "present" && currentState !== "correct") {
        acc[letter] = "present";
      } else if (newState === "incorrect" && currentState !== "correct" && currentState !== "present") {
        acc[letter] = "incorrect";
      }
      return acc;
    }, {});
  }, [cellStates]);

  // ======= INPUT HANDLERS (optimized / stable) =======
  const clearActive = useCallback(() => {
    if (!activeCell || gameOver) return;
    setEntries((prev) => {
      if (!prev[activeCell]) return prev;
      const next = { ...prev };
      next[activeCell] = "";
      return next;
    });
  }, [activeCell, gameOver]);

  const setActiveValue = useCallback(
    (key, val) => {
      if (gameOver) return;
      setEntries((prev) => {
        if (prev[key] === val) return prev;
        return { ...prev, [key]: val };
      });
    },
    [gameOver]
  );

  const handleSubmit = useCallback(() => {
    if (gameOver) return;

    let newCellStates = {};
    const newAttempts = attempts + 1;

    // Win condition
    const isWin = initialCells.every((cell) => {
      const key = `${cell.x},${cell.y}`;
      return (entries[key] || "") === cell.letter;
    });

    // Horizontal check using Set
    for (let i = 0; i < horizontalWord.length; i++) {
      const key = `${puzzle.horizontal.x + i},${puzzle.horizontal.y}`;
      const letter = entries[key] || "";
      if (letter === horizontalWord[i]) newCellStates[key] = { state: "correct", letter };
      else if (letter && horizontalSet.has(letter)) newCellStates[key] = { state: "present", letter };
      else newCellStates[key] = { state: "incorrect", letter };
    }

    // Vertical check using individual Sets
    puzzle.verticals.forEach((vert, idx) => {
      const vertWord = vert.word;
      const vertSet = verticalSets[idx] ?? new Set();
      const ix = puzzle.horizontal.x + vert.intersectIndex;
      const iy = puzzle.horizontal.y;
      const intersectIndex = vertWord.indexOf(puzzle.horizontal.word[vert.intersectIndex]);

      for (let i = 0; i < vertWord.length; i++) {
        const key = `${ix},${iy - (intersectIndex - i)}`;
        const letter = entries[key] || "";
        if (letter === vertWord[i]) newCellStates[key] = { state: "correct", letter };
        else if (letter && vertSet.has(letter)) newCellStates[key] = { state: "present", letter };
        else newCellStates[key] = { state: "incorrect", letter };
      }
    });
    // This part was previously outside handleSubmit, but belongs inside
    setAttempts(newAttempts);
    setCellStates((prev) => ({ ...prev, ...newCellStates }));
    setRevealTick((t) => t + 1); // retrigger flip animations

    if (isWin) {
      setGameWon(true);
      setGameOver(true);
      logClientEvent({ type: "game_win", attempts: newAttempts });
      return;
    }

    if (!isWin && newAttempts >= MAX_ATTEMPTS) {
      setGameOver(true);
      // Reveal solution on loss
      const solutionEntries = {};
      initialCells.forEach((cell) => (solutionEntries[`${cell.x},${cell.y}`] = cell.letter));
      setEntries(solutionEntries);
      logClientEvent({ type: "game_over", attempts: newAttempts });
    }
  }, [
    attempts,
    entries,
    gameOver,
    horizontalWord,
    horizontalSet,
    puzzle,
    setAttempts, setCellStates, setRevealTick, setGameWon, setGameOver, logClientEvent, setEntries, // Added state setters
   initialCells,
    verticalSets,
    MAX_ATTEMPTS,
  ]);

  // ======= GLOBAL KEY PRESS HANDLER =======
  const handleGlobalKeyPress = useCallback((e) => {
    const handleKey = (e) => {
      if (!activeCell || gameOver) return;

      if (e.key === "Backspace") {
        clearActive();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        // If the event comes from the virtual keyboard, it won't have shiftKey
        // We assume physical keyboard for shiftKey behavior.
        // For virtual keyboard, we just move forward.
        const isShiftKey = e.shiftKey;
        const idx = sortedCells.findIndex((c) => `${c.x},${c.y}` === activeCell);
        const nextIdx = e.shiftKey
          ? (idx - 1 + sortedCells.length) % sortedCells.length
          : (idx + 1) % sortedCells.length;
        const next = sortedCells[nextIdx];
        setActiveCell(`${next.x},${next.y}`);
        return;
      }
      // OPTIONAL: arrow keys to move
      const [ax, ay] = activeCell.split(",").map(Number);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const delta = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        }[e.key];
        const nx = ax + delta[0];
        const ny = ay + delta[1];
        const hasCell = initialCells.some((c) => c.x === nx && c.y === ny);
        if (hasCell) setActiveCell(`${nx},${ny}`);
        return;
      }

      const key = e.key.toUpperCase();
      if (key.length === 1 && key >= "A" && key <= "Z") {
        setActiveValue(activeCell, key);
      }
    };
    handleKey(e); // Process the event
  }, [activeCell, sortedCells, gameOver, clearActive, handleSubmit, setActiveValue, initialCells]); // handleSubmit is a dependency here

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyPress);
    return () => window.removeEventListener("keydown", handleGlobalKeyPress);
  }, [handleGlobalKeyPress]); // Only handleGlobalKeyPress is needed here as it already has its own dependencies


  // ======= NEW GAME HANDLER =======
  const handleNewGame = useCallback(() => {
    const getNewPuzzle = async () => {
      setLoading(true);
      setDisplayProgress({ current: 0, total: 7 }); // Reset display progress on new game
      setPuzzle(null); // Clear old puzzle
      setEntries({});
      setAttempts(0);
      setCellStates({});
      setGameOver(false);
      setGameWon(false);
      setActiveCell(null);
      localStorage.removeItem(GAME_CONFIG.STORAGE_KEY);
      try { // Pass setProgress callback
        const newPuzzle = await generatePuzzle(setProgress);
        setPuzzle(newPuzzle);
      } catch (error) {
        console.error("Failed to generate puzzle:", error);
      }
      setLoading(false);
    };
    getNewPuzzle();
  }, []);

  
  // =========================
  // RENDER
  // =========================
  if (loading || !puzzle) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 space-y-4">
        <div className="w-16 h-16 animate-spin border border-gray-400"></div>
        <div className="text-center">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Aoboshi One', cursive: true }}>Gathering Words!</h1>
          {displayProgress.total > 0 && (
            <p className="text-xl font-bold text-gray-700">{displayProgress.current}/{displayProgress.total}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 relative">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <button
        onClick={() => setShowHelp(true)}
        className="absolute top-4 right-4 w-8 h-8 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center font-bold text-xl hover:bg-gray-300 z-10"
        aria-label="How to play"
      >
        i
      </button>

      <div className="flex-grow overflow-y-auto flex flex-col items-center">
        <div className="text-center mb-4 mt-8">
          <h1 className="text-5xl font-bold" style={{ fontFamily: 'Aoboshi One', cursive: true }}>🔍 Searchle</h1>
          <p className="text-gray-600">Attempts: {attempts}/{MAX_ATTEMPTS}</p>
          <div className="h-8 mt-2"> {/* Reserve space for the message */}
            {gameWon && <p className="text-2xl font-bold text-green-600">You won!</p>}
            {gameOver && !gameWon && (
              <p className="text-2xl font-bold text-red-600">Game Over!</p>
            )}
          </div>
        </div>

        <div className="relative my-auto" style={{ width, height }}>
          {initialCells.map((cell, i) => {
            const key = `${cell.x},${cell.y}`;
            const isActive = activeCell === key;
            const entered = entries[key] || "";
            // sequential reveal index for nicer cascade
            const revealIndex = sortedCells.findIndex((c) => c.x === cell.x && c.y === cell.y);

            return (
            <Cell
                key={`${cell.x},${cell.y}`}
                x={cell.x}
                y={cell.y}
                offsetX={offsetX}
                offsetY={offsetY}
                TILE={TILE}
                isActive={isActive}
                onClick={() => !gameOver && setActiveCell(key)}
                value={entered}
                state={cellStates[key]?.state}
                revealIndex={revealTick ? revealIndex : undefined}
                // (6) NOTE: memoized Cell prevents rerender storms
                // (5) flip/bounce handled inside Cell
              />
            );
          })}
        </div>
      </div>

      {/* Fixed footer for buttons and keyboard */}
      <div className="flex flex-col items-center pb-4"> {/* Added pb-4 for some padding at the very bottom */}
        <div className="mt-2 mb-4 flex justify-center space-x-2">
          <button
            onClick={handleNewGame}
            className="px-4 py-2 bg-purple-500 text-white rounded border border-gray-400 hover:bg-purple-700"
          >
            New Game
          </button>
          <button
            onClick={() => activeCell && !gameOver && clearActive()}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded border border-gray-400 hover:bg-gray-400 disabled:opacity-50"
            disabled={gameOver}
          >
            Clear
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded border border-gray-400 hover:bg-blue-700 disabled:opacity-50"
            disabled={gameOver}
          >
            Submit
          </button>
        </div>
        <Keyboard onKeyPress={handleGlobalKeyPress} keyStates={keyboardKeyStates} />
      </div>
    </div>
  );
}
