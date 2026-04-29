import { AnimatePresence, motion } from "framer-motion";
import { GameProvider, useGameStore } from "@/hooks/useGameStore";
import { LandingView } from "@/components/game/LandingView";
import { CharacterCreationView } from "@/components/game/CharacterCreationView";
import { GameView } from "@/components/game/GameView";

function Router() {
  const { state } = useGameStore();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state.gameState}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {state.gameState === "LANDING" && <LandingView />}
        {state.gameState === "CHARACTER_CREATION" && <CharacterCreationView />}
        {(state.gameState === "PLAYING" || state.gameState === "GAMEOVER") && <GameView />}
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
