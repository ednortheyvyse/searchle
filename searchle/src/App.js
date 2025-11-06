// App.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

// =========================
// CONFIG & SAMPLE PUZZLE
// =========================
const GAME_CONFIG = { TILE: 55, MAX_ATTEMPTS: 6, STORAGE_KEY: "searchle:v1" };

const puzzle = {
  horizontal: { word: "CREATE", x: 0, y: 4 },
  verticals: [
    { word: "FACT", intersectIndex: 0 },  // C
    { word: "RIVER", intersectIndex: 1 }, // R
    { word: "EASY", intersectIndex: 2 },  // E
    { word: "APPLE", intersectIndex: 3 }, // A
    { word: "TRAP", intersectIndex: 4 },  // T
    { word: "EVER", intersectIndex: 5 },  // E
  ],
};

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
      ? "bg-green-200"
      : state === "present"
      ? "bg-yellow-200"
      : state === "incorrect"
      ? "bg-red-200"
      : "bg-white";

  return (
    <motion.div
      onClick={onClick}
      className={`absolute flex items-center justify-center border font-bold rounded shadow-sm cursor-pointer transition-all ${
        isActive ? "bg-blue-200 border-blue-400" : `border-gray-400 ${bg}`
      }`}
      style={{
        left: `${(x - offsetX) * TILE}px`,
        top: `${(y - offsetY) * TILE}px`,
        width: `${TILE}px`,
        height: `${TILE}px`,
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
          key={`${value}-${state}-${revealIndex ?? "idle"}`}
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
            borderRadius: "0.25rem",
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
  const initialCells = useMemo(() => getLetterPositions(puzzle), []);
  const TILE = GAME_CONFIG.TILE;
  const MAX_ATTEMPTS = GAME_CONFIG.MAX_ATTEMPTS;

  // Grid bounds
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
  // load
  const [entries, setEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // crude check the same puzzle (based on all letters)
      const currentKey = initialCells.map((c) => c.letter).join("");
      if (parsed.puzzleKey !== currentKey) return {};
      return parsed.entries ?? {};
    } catch {
      return {};
    }
  });
  const [attempts, setAttempts] = useState(() => {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.STORAGE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return parsed.attempts ?? 0;
    } catch {
      return 0;
    }
  });

  const [activeCell, setActiveCell] = useState(null);
  const [cellStates, setCellStates] = useState({}); // 'correct' | 'present' | 'incorrect'
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [revealTick, setRevealTick] = useState(0); // bump to retrigger reveal anim

  // save
  useEffect(() => {
    try {
      const puzzleKey = initialCells.map((c) => c.letter).join("");
      localStorage.setItem(
        GAME_CONFIG.STORAGE_KEY,
        JSON.stringify({ entries, attempts, puzzleKey })
      );
    } catch { /* ignore */ }
  }, [entries, attempts, initialCells]);

  // ======= VALIDATION EFFICIENCY (8) =======
  const horizontalWord = puzzle.horizontal.word;
  const horizontalSet = useMemo(() => new Set(horizontalWord.split("")), [horizontalWord]);
  const verticalSets = useMemo(
    () => puzzle.verticals.map((v) => new Set(v.word.split(""))),
    []
  );

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

  useEffect(() => {
    const handleKey = (e) => {
      if (!activeCell || gameOver) return;

      if (e.key === "Backspace") {
        clearActive();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
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
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, sortedCells, gameOver, clearActive, setActiveValue, initialCells]);

  // ======= SUBMIT / CHECK with reveal animation (5 & 8) =======
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
      const entered = entries[key] || "";
      if (entered === horizontalWord[i]) newCellStates[key] = "correct";
      else if (entered && horizontalSet.has(entered)) newCellStates[key] = "present";
      else newCellStates[key] = "incorrect";
    }

    // Vertical check using individual Sets
    puzzle.verticals.forEach((vert, idx) => {
      const vertWord = vert.word;
      const vertSet = verticalSets[idx];
      const ix = puzzle.horizontal.x + vert.intersectIndex;
      const iy = puzzle.horizontal.y;
      const intersectIndex = vertWord.indexOf(puzzle.horizontal.word[vert.intersectIndex]);

      for (let i = 0; i < vertWord.length; i++) {
        const key = `${ix},${iy - (intersectIndex - i)}`;
        const entered = entries[key] || "";
        if (entered === vertWord[i]) newCellStates[key] = "correct";
        else if (entered && vertSet.has(entered)) newCellStates[key] = "present";
        else newCellStates[key] = "incorrect";
      }
    });

    setAttempts(newAttempts);
    setCellStates(newCellStates);
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
    horizontalSet,
    initialCells,
    verticalSets,
    MAX_ATTEMPTS,
  ]);

  const getTileColor = useCallback((key) => {
    return cellStates[key] === "correct"
      ? "bg-green-200"
      : cellStates[key] === "present"
      ? "bg-yellow-200"
      : cellStates[key] === "incorrect"
      ? "bg-red-200"
      : "bg-white";
  }, [cellStates]);

  // =========================
  // RENDER
  // =========================
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold">🔍 Searchle</h1>
        <p className="text-gray-600">Attempts: {attempts}/{MAX_ATTEMPTS}</p>
        {gameWon && <p className="text-2xl font-bold text-green-600 mt-2">You won!</p>}
        {gameOver && !gameWon && (
          <p className="text-2xl font-bold text-red-600 mt-2">Game Over!</p>
        )}
      </div>

      <div className="relative" style={{ width, height }}>
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
              state={cellStates[key]}
              revealIndex={revealTick ? revealIndex : undefined}
              // (6) NOTE: memoized Cell prevents rerender storms
              // (5) flip/bounce handled inside Cell
              className={getTileColor(key)}
            />
          );
        })}
      </div>

      <div className="mt-4 flex space-x-2">
        <button
          onClick={() => activeCell && !gameOver && clearActive()}
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 disabled:opacity-50"
          disabled={gameOver}
        >
          Clear
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          disabled={gameOver}
        >
          Submit
        </button>
      </div>

      <p className="mt-6 text-gray-600 italic">
        Click a tile and type letters (A–Z). Backspace clears. Use Tab/Shift+Tab or arrow keys to move.
      </p>
    </div>
  );
}
