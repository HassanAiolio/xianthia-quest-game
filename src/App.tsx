import { AnimatePresence, motion } from "framer-motion";
import { GameProvider, useGameStore } from "@/hooks/useGameStore";
import { LandingView } from "@/components/game/LandingView";
import { CharacterCreationView } from "@/components/game/CharacterCreationView";
import { GameView } from "@/components/game/GameView";

const IN_GAME = new Set(["PLAYING", "COMBAT", "GAMEOVER", "VICTORY"]);

function Router() {
  const { state } = useGameStore();
  // Moving between in-game modes (combat, game over…) must not remount the game screen.
  const screen = IN_GAME.has(state.gameState) ? "GAME" : state.gameState;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
        {screen === "LANDING" && <LandingView />}
        {screen === "CHARACTER_CREATION" && <CharacterCreationView />}
        {screen === "GAME" && <GameView />}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  );
}
