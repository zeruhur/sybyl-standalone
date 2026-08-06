import { useState } from "react";
import { DeckSession, DeckType } from "../lib/toolkit/cardEngine";
import { WORD_CATEGORIES } from "../lib/toolkit/wordGenerators";
import { TableFile } from "../lib/toolkit/tables";
import { ORACLE_LIKELIHOODS } from "../lib/toolkit/oracleEngine";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d%"];

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
  onAskOracle
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

  return (
    <div className="toolkit-panel">
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
    </div>
  );
}
