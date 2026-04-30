import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getLocationImageUrl, getEnemyImageUrl } from "@/services/imageService"; 
import {
  Eye,
  Hand,
  LogOut,
  Moon,
  Package,
  Scroll,
  Send,
  Skull,
  Sword,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGameStore } from "@/hooks/useGameStore";
import { processAction } from "@/services/gameEngine";
import { VitalBar } from "@/components/game/VitalBar";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { label: "Scan", icon: Eye, command: "scan the area" },
  { label: "Interact", icon: Hand, command: "interact with the nearest object" },
  { label: "Combat Stance", icon: Sword, command: "ready combat stance" },
  { label: "Rest", icon: Moon, command: "rest and meditate" },
] as const;

export function GameView() {
  const { state, addLog, applyEffects, setGameState, reset, setLocation, addItem, removeItem, addQuest, updateQuest, setEnemy } = useGameStore(); // <-- Added setEnemy
  const { player, inventory, gameLog, currentLocation, quests, currentEnemy } = state; 
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [enemyImage, setEnemyImage] = useState<string | null>(null);
  const [locationImage, setLocationImage] = useState<string | null>(null);

  useEffect(() => {
    if (currentEnemy) {
      getEnemyImageUrl(currentEnemy.imageDescription)
        .then(setEnemyImage)
        .catch(() => setEnemyImage(null));
    } else {
      setEnemyImage(null);
    }
  }, [currentEnemy?.imageDescription]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [gameLog.length, thinking]);

  if (!player) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Button onClick={() => setGameState("CHARACTER_CREATION")}>
          Create a character
        </Button>
      </div>
    );
  }

  async function send(commandText: string) {
    const text = commandText.trim();
    if (!text || thinking || !player) return;
    setInput("");
    
    addLog({
      id: `log-${Date.now()}-p`,
      sender: "PLAYER",
      text,
      timestamp: Date.now(),
    });
    
    setThinking(true);
    try {
      // Pass currentEnemy and state.gameState to processAction
      const result = await processAction(text, player, gameLog, inventory, currentLocation, quests, currentEnemy, state.gameState);
      
      addLog(result.message);
      if (result.effects) applyEffects(result.effects);
      if (result.locationChange?.name) setLocation(result.locationChange);
      
      if (result.inventoryChanges?.add) result.inventoryChanges.add.forEach(item => addItem(item));
      if (result.inventoryChanges?.remove) result.inventoryChanges.remove.forEach(id => removeItem(id));
      
      if (result.questChanges?.add) {
         result.questChanges.add.forEach(q => addQuest(q));
      }
      if (result.questChanges?.update) {
         result.questChanges.update.forEach(q => updateQuest(q.id, q.status));
      }

      // === NEW LOGIC ===
      // Handle Enemy State
      if (result.enemyChange === "clear") setEnemy(null);
      else if (result.enemyChange) setEnemy(result.enemyChange);

      // Handle Game State (switching in and out of COMBAT)
      if (result.stateChange) setGameState(result.stateChange);
      
    } catch (error) {
      console.error(error);
      addLog({
        id: `log-${Date.now()}-err`,
        sender: "SYSTEM",
        text: "[WARNING: Aether-Core connection severed. Please try again.]",
        timestamp: Date.now(),
      });
    } finally {
      setThinking(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    // 1. Added lg:h-screen and flex/flex-col to lock it to the viewport on desktop
    <div className="relative flex min-h-screen flex-col px-3 py-4 sm:px-6 sm:py-6 lg:h-screen lg:overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-aurora)" }}
      />

      {/* 2. Added flex-1 and lg:min-h-0 to let the grid fill remaining height */}
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 lg:grid lg:min-h-0 lg:grid-cols-[280px_1fr_320px]">
        {/* LEFT — Vitals */}
        <aside className="glass-strong order-2 flex flex-col gap-4 rounded-2xl p-4 lg:order-1 lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
          {/* Portrait */}
          <div className="relative aspect-square overflow-hidden rounded-xl border border-glass-border bg-gradient-to-br from-[oklch(0.2_0.05_270)] to-[oklch(0.12_0.03_290)]">
            <div className="absolute inset-0 scanlines opacity-30 z-10 pointer-events-none" />
            
            {/* Show AI Image if it exists, otherwise fallback to Icon */}
            {player.portraitUrl ? (
              <img 
                src={player.portraitUrl} 
                alt={player.name} 
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <User className="h-16 w-16 text-cyan/60" />
              </div>
            )}
            
            <div
              className="absolute inset-x-0 top-0 h-px z-20"
              style={{ background: "var(--gradient-cyan)" }}
            />
          </div>

          <div>
            <div className="font-display text-lg leading-tight">{player.name}</div>
            <div className="text-xs uppercase tracking-wider text-cyan">
              Lv {player.level} · {player.class}
            </div>
          </div>

          <div className="space-y-2.5">
            <VitalBar label="HP" value={player.hp} max={player.maxHp} variant="hp" />
            <VitalBar label="MP" value={player.mp} max={player.maxMp} variant="mp" />
            <VitalBar
              label="XP"
              value={player.xp % 100}
              max={100}
              variant="xp"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            {(["str", "int", "dex", "lck"] as const).map((s) => (
              <div
                key={s}
                className="rounded-lg border border-border bg-black/20 py-2"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s}
                </div>
                <div className="font-display text-lg text-foreground">
                  {player.stats[s]}
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-auto justify-start text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              reset();
              setGameState("LANDING");
            }}
          >
            <LogOut className="mr-2 h-3 w-3" /> Abandon Run
          </Button>
        </aside>

        {/* CENTER — World */}
        <main className="order-1 flex flex-col gap-4 lg:order-2 lg:min-h-0">
          {/* Visualizer */}
          <div className="glass-strong relative shrink-0 overflow-hidden rounded-2xl">
            {/* <div className="aspect-[16/7] relative bg-gradient-to-br from-[oklch(0.18_0.05_280)] via-[oklch(0.14_0.04_260)] to-[oklch(0.12_0.06_320)]"> */}
            <div className="aspect-[21/9] lg:aspect-[3/1] relative bg-gradient-to-br from-[oklch(0.18_0.05_280)] via-[oklch(0.14_0.04_260)] to-[oklch(0.12_0.06_320)]">  
              <div className="absolute inset-0 scanlines opacity-25" />
              {locationImage && (
                <img
                  src={locationImage}
                  alt={currentLocation.name}
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cyan">Current Location</div>
                <div className="font-display text-xl">{currentLocation.name}</div>
                <div className="mt-1 line-clamp-2 max-w-2xl text-xs text-muted-foreground">
                  {currentLocation.description}
                </div>
              </div>
            </div>
          </div>

          {/* Narrative log */}
          <div className="glass-strong flex flex-1 flex-col overflow-hidden rounded-2xl min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-glass-border px-4 py-2.5">
              <div className="text-xs uppercase tracking-[0.3em] text-cyan">
                Narrative Log
              </div>
              <div className="text-[10px] text-muted-foreground">
                {gameLog.length} entries
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div ref={logRef} className="max-h-[40vh] overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  {gameLog.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm leading-relaxed",
                        m.sender === "PLAYER" &&
                          "ml-10 border-[var(--gold)]/40 bg-[color-mix(in_oklch,var(--gold)_8%,transparent)] text-[oklch(0.95_0.08_88)]",
                        m.sender === "AI" &&
                          "mr-10 border-cyan/30 bg-[color-mix(in_oklch,var(--cyan)_5%,transparent)] text-foreground",
                        m.sender === "SYSTEM" &&
                          "border-dashed border-muted-foreground/30 bg-transparent text-center text-xs italic text-muted-foreground"
                      )}
                    >
                      {m.sender !== "SYSTEM" && (
                        <div
                          className={cn(
                            "mb-0.5 text-[10px] uppercase tracking-wider",
                            m.sender === "PLAYER"
                              ? "text-[var(--gold)]"
                              : "text-cyan"
                          )}
                        >
                          {m.sender === "PLAYER" ? player.name : "Xianthia"}
                        </div>
                      )}
                      {m.text}
                    </motion.div>
                  ))}
                  <AnimatePresence>
                    {thinking && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mr-10 flex items-center gap-2 rounded-lg border border-cyan/30 bg-[color-mix(in_oklch,var(--cyan)_5%,transparent)] px-3 py-2 text-sm italic text-muted-foreground"
                      >
                        <span className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full bg-cyan"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                delay: i * 0.2,
                              }}
                            />
                          ))}
                        </span>
                        The world is reacting…
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </ScrollArea>

            {/* Command input */}
            <div className="shrink-0 border-t border-glass-border p-3">
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUICK_ACTIONS.map((a) => (
                  <Button
                    key={a.label}
                    variant="outline"
                    size="sm"
                    disabled={thinking}
                    onClick={() => void send(a.command)}
                    className="h-9 border-glass-border bg-[var(--glass)] text-xs hover:border-cyan/50 hover:bg-[color-mix(in_oklch,var(--cyan)_10%,transparent)] hover:text-cyan"
                  >
                    <a.icon className="mr-1.5 h-3.5 w-3.5" />
                    {a.label}
                  </Button>
                ))}
              </div>
              <form onSubmit={onSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="What do you do?"
                  disabled={thinking}
                  className="h-11 flex-1 border-glass-border bg-[var(--input)] focus-visible:ring-[var(--gold)]"
                />
                <Button
                  type="submit"
                  disabled={thinking || !input.trim()}
                  className="h-11 bg-gradient-to-r from-[var(--gold)] to-[oklch(0.92_0.18_90)] px-4 font-display tracking-wider text-[var(--gold-foreground)] hover:opacity-95"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </main>

        {/* RIGHT - Data-Pad / Enemy View */}
        <aside className="glass-strong order-3 flex flex-col gap-4 rounded-2xl p-4 lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
          
          {/* ENEMY CARD (Only visible in COMBAT) */}
          {state.gameState === "COMBAT" && currentEnemy && (
            <div className="shrink-0 flex flex-col animate-fade-up border border-destructive/50 bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] p-4 rounded-xl shadow-[0_0_24px_color-mix(in_oklch,var(--destructive)_20%,transparent)]">
              <div className="text-xs uppercase tracking-[0.3em] text-destructive animate-pulse mb-3 text-center font-bold">
                Combat Initiated
              </div>
              
              <div className="relative aspect-square overflow-hidden rounded-xl border border-destructive/40 mb-4 bg-black/40">
                <div className="absolute inset-0 scanlines opacity-50 z-10 pointer-events-none" />
                {enemyImage && (
                  <img 
                    src={enemyImage} 
                    alt={currentEnemy.name} 
                    className="absolute inset-0 h-full w-full object-cover opacity-90"
                  />
                )}
              </div>
              
              <div className="font-display text-xl text-destructive mb-3 text-center shadow-destructive drop-shadow-md">
                {currentEnemy.name}
              </div>
              
              <div className="mt-auto">
                <VitalBar label="Enemy HP" value={currentEnemy.hp} max={currentEnemy.maxHp} variant="hp" />
              </div>
            </div>
          )}

          {/* DATA-PAD TABS (Always visible) */}
          <Tabs defaultValue="inventory" className="flex flex-1 flex-col min-h-0">
            <TabsList className="grid w-full shrink-0 grid-cols-2 bg-black/30">
              <TabsTrigger value="inventory" className="data-[state=active]:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] data-[state=active]:text-[var(--gold)]">
                <Package className="mr-1.5 h-3.5 w-3.5" /> Inventory
              </TabsTrigger>
              <TabsTrigger value="quests" className="data-[state=active]:bg-[color-mix(in_oklch,var(--cyan)_15%,transparent)] data-[state=active]:text-cyan">
                <Scroll className="mr-1.5 h-3.5 w-3.5" /> Quests
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="inventory" className="mt-3 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
              <div className="grid grid-cols-3 gap-2">
                {inventory.map((item) => (
                  <div
                    key={item.id}
                    title={`${item.name} - ${item.description}`}
                    className="group relative aspect-square rounded-lg border border-glass-border bg-black/30 p-2 transition-colors hover:border-[var(--gold)]/60 hover:bg-[color-mix(in_oklch,var(--gold)_8%,transparent)]"
                  >
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Package className="h-5 w-5 text-cyan/70 group-hover:text-[var(--gold)]" />
                      <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground group-hover:text-foreground">
                        {item.name}
                      </div>
                    </div>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 9 - inventory.length) }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg border border-dashed border-border/40 bg-black/10"
                    />
                  )
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="quests" className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2 [&::-webkit-scrollbar]:hidden">
              {quests.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-glass-border bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display text-sm">{q.title}</div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider",
                        q.status === "active"
                          ? "bg-cyan/15 text-cyan"
                          : "bg-[var(--gold)]/15 text-[var(--gold)]"
                      )}
                    >
                      {q.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {q.description}
                  </p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Game Over overlay */}
      <AnimatePresence>
        {state.gameState === "GAMEOVER" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-strong max-w-md rounded-2xl p-8 text-center"
            >
              <Skull className="mx-auto h-12 w-12 text-destructive" />
              <h2 className="text-gradient-gold mt-4 font-display text-3xl">
                The Rift Claims You
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your story ends here, {player.name}. But the Rift remembers.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    reset();
                    setGameState("LANDING");
                  }}
                >
                  Return to Gates
                </Button>
                <Button
                  onClick={() => {
                    reset();
                    setGameState("CHARACTER_CREATION");
                  }}
                  className="bg-gradient-to-r from-[var(--gold)] to-[var(--cyan)] text-[var(--gold-foreground)]"
                >
                  Forge Anew
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
