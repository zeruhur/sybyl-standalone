import { useState } from "react";
import { DeckSession, DeckType } from "../lib/toolkit/cardEngine";
import { WORD_CATEGORIES } from "../lib/toolkit/wordGenerators";
import { TableFile } from "../lib/toolkit/tables";
import { ORACLE_LIKELIHOODS } from "../lib/toolkit/oracleEngine";
import { CustomDeckSession, DeckFolder } from "../lib/toolkit/customDeckEngine";
import { CutUpMode } from "../lib/toolkit/cutup";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d%"];

type ToolkitTab = "dice" | "oracle" | "cards" | "custom-deck" | "words" | "cutup" | "tables";

const TOOLKIT_TABS: { id: ToolkitTab; label: string }[] = [
  { id: "dice", label: "Dice" },
  { id: "oracle", label: "Oracle" },
  { id: "cards", label: "Cards" },
  { id: "custom-deck", label: "Custom Deck" },
  { id: "words", label: "Words" },
  { id: "cutup", label: "Cut-up" },
  { id: "tables", label: "Tables" }
];

interface ToolkitPanelProps {
  deckSession: DeckSession | null;
  tableFiles: TableFile[];
  canInsert: boolean;
  onRollDice: (expr: string) => string | undefined;
  onDrawCard: () => string | undefined;
  onReshuffleDeck: () => void;
  onSetDeckType: (type: DeckType) => void;
  onGenerateWord: (categoryId: string) => string | undefined;
  onRollTable: (path: string) => Promise<string | undefined>;
  onRefreshTables: () => void;
  onInsert: (text: string) => void;
  chaosFactor: number;
  onSetChaosFactor: (n: number) => void;
  onAskOracle: (likelihoodId: string) => string | undefined;
  deckFolders: DeckFolder[];
  customDeckSession: CustomDeckSession | null;
  onRefreshDeckFolders: () => void;
  onSetCustomDeck: (folder: DeckFolder) => void;
  onDrawCustomCard: () => Promise<{ path: string; dataUri: string } | undefined>;
  onReshuffleCustomDeck: () => void;
  onCutUp: (text: string, mode: CutUpMode) => string | undefined;
  onLoadTableText: (path: string) => Promise<string | undefined>;
}

export default function ToolkitPanel({
  deckSession,
  tableFiles,
  canInsert,
  onRollDice,
  onDrawCard,
  onReshuffleDeck,
  onSetDeckType,
  onGenerateWord,
  onRollTable,
  onRefreshTables,
  onInsert,
  chaosFactor,
  onSetChaosFactor,
  onAskOracle,
  deckFolders,
  customDeckSession,
  onRefreshDeckFolders,
  onSetCustomDeck,
  onDrawCustomCard,
  onReshuffleCustomDeck,
  onCutUp,
  onLoadTableText
}: ToolkitPanelProps) {
  const [diceExpr, setDiceExpr] = useState("2d6+2");
  const [diceResult, setDiceResult] = useState<string | undefined>(undefined);
  const [cardResult, setCardResult] = useState<string | undefined>(undefined);
  const [wordCategory, setWordCategory] = useState(WORD_CATEGORIES[0].id);
  const [wordResult, setWordResult] = useState<string | undefined>(undefined);
  const [tablePath, setTablePath] = useState("");
  const [tableResult, setTableResult] = useState<string | undefined>(undefined);
  const [oracleLikelihood, setOracleLikelihood] = useState("fifty_fifty");
  const [oracleResult, setOracleResult] = useState<string | undefined>(undefined);
  const [customDeckPath, setCustomDeckPath] = useState("");
  const [customCardDraw, setCustomCardDraw] = useState<{ path: string; dataUri: string } | undefined>(undefined);
  const [cutupText, setCutupText] = useState("");
  const [cutupMode, setCutupMode] = useState<CutUpMode>("words");
  const [cutupSourceTable, setCutupSourceTable] = useState("");
  const [cutupResult, setCutupResult] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ToolkitTab>("dice");

  function rollDice(expr: string) {
    const result = onRollDice(expr);
    setDiceResult(result);
  }

  function drawCard() {
    setCardResult(onDrawCard());
  }

  function generateWord() {
    setWordResult(onGenerateWord(wordCategory));
  }

  async function rollTable() {
    if (!tablePath) return;
    setTableResult(await onRollTable(tablePath));
  }

  function askOracle() {
    setOracleResult(onAskOracle(oracleLikelihood));
  }

  function setCustomDeck(path: string) {
    setCustomDeckPath(path);
    setCustomCardDraw(undefined);
    const folder = deckFolders.find((f) => f.path === path);
    if (folder) onSetCustomDeck(folder);
  }

  async function drawCustomCard() {
    setCustomCardDraw(await onDrawCustomCard());
  }

  function cutUp() {
    setCutupResult(onCutUp(cutupText, cutupMode));
  }

  async function loadTableText() {
    if (!cutupSourceTable) return;
    const text = await onLoadTableText(cutupSourceTable);
    if (text !== undefined) setCutupText(text);
  }

  return (
    <div className="toolkit-panel">
      <div className="toolkit-tabs">
        {TOOLKIT_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`toolkit-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dice" && (
      <div className="toolkit-section">
        <h4>Dice</h4>
        <div className="toolkit-row">
          {QUICK_DICE.map((die) => (
            <button key={die} onClick={() => { setDiceExpr(die); rollDice(die); }}>{die}</button>
          ))}
        </div>
        <div className="toolkit-row">
          <input
            value={diceExpr}
            onChange={(e) => setDiceExpr(e.target.value)}
            placeholder="2d6+2, 4d6kh3, 5d10>=7"
          />
          <button onClick={() => rollDice(diceExpr)}>Roll</button>
        </div>
        {diceResult && (
          <div className="toolkit-result">
            <span>{diceResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(diceResult)}>Insert</button>
          </div>
        )}
      </div>
      )}

      {activeTab === "oracle" && (
      <div className="toolkit-section">
        <h4>Oracle</h4>
        <div className="toolkit-row">
          <select value={oracleLikelihood} onChange={(e) => setOracleLikelihood(e.target.value)}>
            {ORACLE_LIKELIHOODS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <label>
            CF
            <input
              type="number"
              min={1}
              max={9}
              value={chaosFactor}
              onChange={(e) => onSetChaosFactor(Number(e.target.value))}
              style={{ width: "3em", marginLeft: "0.25em" }}
            />
          </label>
          <button onClick={askOracle}>Ask</button>
        </div>
        {oracleResult && (
          <div className="toolkit-result">
            <span style={{ whiteSpace: "pre-line" }}>{oracleResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(oracleResult)}>Insert</button>
          </div>
        )}
      </div>
      )}

      {activeTab === "cards" && (
      <div className="toolkit-section">
        <h4>Cards</h4>
        <div className="toolkit-row">
          <select value={deckSession?.type ?? "standard"} onChange={(e) => onSetDeckType(e.target.value as DeckType)}>
            <option value="standard">Standard</option>
            <option value="standard-jokers">Standard + Jokers</option>
            <option value="tarot">Tarot</option>
          </select>
          <button onClick={drawCard}>Draw</button>
          <button onClick={onReshuffleDeck}>Reshuffle</button>
        </div>
        {deckSession && (
          <div className="toolkit-deck-counts">
            Draw pile: {deckSession.drawPile.length} · Discard: {deckSession.discardPile.length}
          </div>
        )}
        {cardResult && (
          <div className="toolkit-result">
            <span>{cardResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(cardResult)}>Insert</button>
          </div>
        )}
      </div>
      )}

      {activeTab === "custom-deck" && (
      <div className="toolkit-section">
        <h4>Custom Deck</h4>
        {deckFolders.length === 0 ? (
          <div className="toolkit-empty">
            No decks found. Add folders of images to <code>decks/&lt;name&gt;/</code> in your vault.
            <button onClick={onRefreshDeckFolders}>Refresh</button>
          </div>
        ) : (
          <>
            <div className="toolkit-row">
              <select value={customDeckPath} onChange={(e) => setCustomDeck(e.target.value)}>
                <option value="">Choose a deck...</option>
                {deckFolders.map((f) => (
                  <option key={f.path} value={f.path}>{f.name}</option>
                ))}
              </select>
              <button onClick={drawCustomCard} disabled={!customDeckSession}>Draw</button>
              <button onClick={onReshuffleCustomDeck} disabled={!customDeckSession}>Reshuffle</button>
              <button onClick={onRefreshDeckFolders}>Refresh</button>
            </div>
            {customDeckSession && (
              <div className="toolkit-deck-counts">
                Draw pile: {customDeckSession.drawPile.length} · Discard: {customDeckSession.discardPile.length}
              </div>
            )}
            {customCardDraw && (
              <div className="toolkit-result">
                <img src={customCardDraw.dataUri} alt="Drawn card" style={{ maxWidth: "120px", maxHeight: "160px" }} />
              </div>
            )}
          </>
        )}
      </div>
      )}

      {activeTab === "words" && (
      <div className="toolkit-section">
        <h4>Words</h4>
        <div className="toolkit-row">
          <select value={wordCategory} onChange={(e) => setWordCategory(e.target.value)}>
            {WORD_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          <button onClick={generateWord}>Generate</button>
        </div>
        {wordResult && (
          <div className="toolkit-result">
            <span>{wordResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(wordResult)}>Insert</button>
          </div>
        )}
      </div>
      )}

      {activeTab === "cutup" && (
      <div className="toolkit-section">
        <h4>Cut-up</h4>
        <textarea
          value={cutupText}
          onChange={(e) => setCutupText(e.target.value)}
          placeholder="Paste or type a block of text to cut up..."
          rows={3}
          style={{ width: "100%" }}
        />
        {tableFiles.length > 0 && (
          <div className="toolkit-row">
            <select value={cutupSourceTable} onChange={(e) => setCutupSourceTable(e.target.value)}>
              <option value="">Load from table...</option>
              {tableFiles.map((t) => (
                <option key={t.path} value={t.path}>{t.name}</option>
              ))}
            </select>
            <button onClick={loadTableText} disabled={!cutupSourceTable}>Load</button>
          </div>
        )}
        <div className="toolkit-row">
          <select value={cutupMode} onChange={(e) => setCutupMode(e.target.value as CutUpMode)}>
            <option value="words">Words</option>
            <option value="lines">Lines</option>
          </select>
          <button onClick={cutUp} disabled={!cutupText.trim()}>Cut Up</button>
        </div>
        {cutupResult && (
          <div className="toolkit-result">
            <span style={{ whiteSpace: "pre-line" }}>{cutupResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(cutupResult)}>Insert</button>
          </div>
        )}
      </div>
      )}

      {activeTab === "tables" && (
      <div className="toolkit-section">
        <h4>Tables</h4>
        {tableFiles.length === 0 ? (
          <div className="toolkit-empty">
            No tables found. Add .md/.txt files to <code>tables/</code> in your vault.
            <button onClick={onRefreshTables}>Refresh</button>
          </div>
        ) : (
          <div className="toolkit-row">
            <select value={tablePath} onChange={(e) => setTablePath(e.target.value)}>
              <option value="">Choose a table...</option>
              {tableFiles.map((t) => (
                <option key={t.path} value={t.path}>{t.name}</option>
              ))}
            </select>
            <button onClick={rollTable} disabled={!tablePath}>Roll</button>
            <button onClick={onRefreshTables}>Refresh</button>
          </div>
        )}
        {tableResult && (
          <div className="toolkit-result">
            <span>{tableResult}</span>
            <button disabled={!canInsert} onClick={() => onInsert(tableResult)}>Insert</button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
