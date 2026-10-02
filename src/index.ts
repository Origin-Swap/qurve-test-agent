// mock-agent/src/index.ts
import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

// BE Qurve — karena mock jalan di VPS yang sama, pakai localhost
const QURVE_API_URL = process.env.QURVE_API_URL ?? "http://localhost:3000";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ═══════════════════════════════════════════════════════════════
// QURVE API CLIENT
// ═══════════════════════════════════════════════════════════════

interface Holding {
  chainId: number;
  agentId: number;
  name: string | null;
  symbol: string | null;
  tokenAddress: string;
  balance: string;
  balanceFormatted: string;
  currentPriceUsd: number;
  valueUsd: number;
  costBasisUsd: number | null;
  pnlUsd: number | null;
  pnlPercent: number | null;
  avgEntryPriceUsd: number | null;
  graduated: boolean;
  priceSource: string;
  tradeCount: number;
}

interface HoldingsResponse {
  address: string;
  chainId: number | "all";
  holdings: Holding[];
  summary: {
    totalValueUsd: number;
    totalCostBasisUsd: number;
    totalPnlUsd: number;
    totalPnlPercent: number;
    agentsCount: number;
    agentsOwned: number;
  };
  timestamp: number;
}

async function fetchHoldings(wallet: string): Promise<HoldingsResponse> {
  const url = `${QURVE_API_URL}/api/user/holdings/${wallet}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Qurve API ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as HoldingsResponse;
}

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════

function fmtUsd(n: number): string {
  if (!isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs < 0.01) return `$${n.toFixed(6)}`;
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1000) return `$${n.toFixed(2)}`;
  if (abs < 1_000_000) return `$${(n / 1000).toFixed(2)}K`;
  return `$${(n / 1_000_000).toFixed(2)}M`;
}

function fmtPct(n: number | null): string {
  if (n === null || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function truncAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER — PORTFOLIO
// ═══════════════════════════════════════════════════════════════

async function handlePortfolio(wallet: string) {
  const data = await fetchHoldings(wallet);

  if (data.holdings.length === 0) {
    return {
      output: [
        "💼 Qurve Portfolio",
        "",
        `Wallet: ${wallet}`,
        "",
        "No agent token holdings found.",
        "",
        "Browse the launchpad to start building your portfolio.",
      ].join("\n"),
      usage: { tokens: 80, model: "qurve-portfolio-v1" },
    };
  }

  const lines = data.holdings.slice(0, 20).map((h) => {
    const name = (h.name ?? `Agent #${h.agentId}`).slice(0, 18).padEnd(18);
    const symbol = (h.symbol ?? "?").slice(0, 8).padEnd(8);
    const bal = Number(h.balanceFormatted).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
    const value = fmtUsd(h.valueUsd);
    const pnl = h.pnlUsd !== null ? fmtPct(h.pnlPercent) : "—";
    const grad = h.graduated ? "🎓" : " ";
    return `  ${grad} ${name} $${symbol} ${bal.padStart(12)}  ${value.padStart(10)}  ${pnl.padStart(9)}`;
  });

  const s = data.summary;

  return {
    output: [
      "💼 Qurve Portfolio",
      "",
      `Wallet:  ${wallet}`,
      `Agents:  ${s.agentsCount} held${s.agentsOwned > 0 ? `, ${s.agentsOwned} owned` : ""}`,
      "",
      "      Agent              Symbol       Balance       Value       PnL",
      "  ─────────────────────────────────────────────────────────────────",
      ...lines,
      "",
      "Summary:",
      `  Total Value:      ${fmtUsd(s.totalValueUsd)}`,
      `  Total Cost Basis: ${fmtUsd(s.totalCostBasisUsd)}`,
      `  Unrealized P&L:   ${s.totalPnlUsd >= 0 ? "+" : ""}${fmtUsd(s.totalPnlUsd)} (${fmtPct(s.totalPnlPercent)})`,
      "",
      "🎓 = graduated to Uniswap V3",
    ].join("\n"),
    usage: { tokens: 220, model: "qurve-portfolio-v1" },
  };
}

// ═══════════════════════════════════════════════════════════════
// AGENT CARD
// ═══════════════════════════════════════════════════════════════

app.get("/.well-known/agent.json", (_req, res) => {
  res.json({
    name: "QurvePortfolioAgent",
    description:
      "Reads the caller's Qurve agent-token holdings on-chain and returns a full portfolio breakdown",
    version: "1.0.0",
    type: "AIAgent",
    image: null,
    capabilities: [
      {
        name: "portfolio",
        description:
          "Full breakdown of the caller's Qurve agent-token holdings — balance, value, P&L",
        pricing: { token: "10" },
      },
    ],
    endpoints: [
      {
        url: `${PUBLIC_URL}/a2a`,
        protocol: "a2a",
        version: "1.0",
      },
    ],
    supportedTrust: ["reputation"],
    active: true,
  });
});

// ═══════════════════════════════════════════════════════════════
// A2A ENDPOINT — POST /a2a (JSON-RPC 2.0)
// ═══════════════════════════════════════════════════════════════

app.post("/a2a", async (req, res) => {
  const { jsonrpc, method, params, id } = req.body ?? {};

  const wallet: string = (params?.userId as string) ?? "";
  const requestText: string = (params?.request as string) ?? "";

  console.log(`[A2A] → ${method}`, {
    id,
    wallet: wallet ? truncAddr(wallet) : "(none)",
    requestPreview: requestText.slice(0, 60),
  });

  // ── Validate JSON-RPC ──
  if (jsonrpc !== "2.0" || !method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    });
  }

  // ── Validate wallet ──
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "Missing or invalid userId (EVM wallet required)",
      },
    });
  }

  // ── Dispatch ──
  if (method !== "portfolio") {
    console.log(`[A2A] ✗ Unknown method: ${method}`);
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}. Only "portfolio" is supported.`,
      },
    });
  }

  const start = Date.now();
  try {
    const result = await handlePortfolio(wallet);
    console.log(
      `[A2A] ✓ portfolio → ${Date.now() - start}ms, ${result.usage.tokens} tokens`
    );
    return res.json({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    console.error(`[A2A] ✗ portfolio error:`, err.message);
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: `Internal error: ${err.message}` },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "QurvePortfolioAgent",
    version: "1.0.0",
    qurveApi: QURVE_API_URL,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log("");
  console.log("🤖 QurvePortfolioAgent v1.0.0");
  console.log(`   Listen:      http://localhost:${PORT}`);
  console.log(`   Public URL:  ${PUBLIC_URL}`);
  console.log(`   Qurve API:   ${QURVE_API_URL}`);
  console.log(`   Agent Card:  ${PUBLIC_URL}/.well-known/agent.json`);
  console.log("");
  console.log("   Capability:");
  console.log("     • portfolio (10 tokens)");
  console.log("");
});
