// mock-agent/src/index.ts
import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ═══════════════════════════════════════════════════════════
// AGENT CARD — /.well-known/agent.json
// ═══════════════════════════════════════════════════════════

app.get("/.well-known/agent.json", (req, res) => {
  res.json({
    name: "MockAgent",
    description: "Mock AI agent for testing A2A protocol",
    version: "1.0.0",
    type: "AIAgent",
    image: null,
    capabilities: [
      {
        name: "stock-analysis",
        description: "Analisis saham sederhana",
        pricing: { token: "10" },
      },
      {
        name: "news-summary",
        description: "Ringkas berita terbaru",
        pricing: { token: "5" },
      },
      {
        name: "portfolio",
        description: "Lihat & analisis portfolio saham",
        pricing: { token: "15" },
      },
      {
        name: "risk-assessment",
        description: "Analisis risiko portfolio",
        pricing: { token: "20" },
      },
    ],
    endpoints: [
      {
        url: `http://localhost:${PORT}/a2a`,
        protocol: "a2a",
        version: "1.0",
      },
    ],
    supportedTrust: ["reputation"],
    active: true,
  });
});

// ═══════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════

function handleStockAnalysis(request: string) {
  return {
    output: [
      "📊 Analysis Result",
      "",
      "Symbol: BBCA",
      "Price: 9,250 → 9,875",
      "Change: +6.76%",
      "RSI: 62 (neutral)",
      "MA20: 9,650 (support)",
      "",
      "🎯 Recommendation: BUY",
      "Target: 10,200 (+3.3%)",
      "Confidence: 78%",
      "",
      `Request: "${request}"`,
    ].join("\n"),
    usage: { tokens: 245, model: "mock-v1" },
  };
}

function handleNewsSummary(request: string) {
  return {
    output: [
      "📰 Berita Terbaru (30 menit terakhir):",
      "",
      "1. IHSG naik 0.8% ke 7,245",
      "2. Rupiah menguat ke 15,650/USD",
      "3. BI pertahankan suku bunga 6%",
      "4. Harga minyak Brent turun 1.2%",
      "",
      "Sentimen: Bullish",
      "",
      `Request: "${request}"`,
    ].join("\n"),
    usage: { tokens: 120, model: "mock-v1" },
  };
}

function handlePortfolio(request: string) {
  // Simulasi portfolio user
  const holdings = [
    { symbol: "BBCA", shares: 100, buyPrice: 9250, currentPrice: 9875 },
    { symbol: "BBRI", shares: 200, buyPrice: 4500, currentPrice: 4720 },
    { symbol: "TLKM", shares: 50, buyPrice: 3800, currentPrice: 3650 },
    { symbol: "ASII", shares: 75, buyPrice: 5100, currentPrice: 5420 },
  ];

  let totalValue = 0;
  let totalCost = 0;

  const lines = holdings.map((h) => {
    const value = h.shares * h.currentPrice;
    const cost = h.shares * h.buyPrice;
    const pnl = value - cost;
    const pnlPct = (pnl / cost) * 100;
    totalValue += value;
    totalCost += cost;

    const arrow = pnl >= 0 ? "📈" : "📉";
    const sign = pnl >= 0 ? "+" : "";

    return (
      `• ${h.symbol.padEnd(6)} ${h.shares.toString().padStart(4)} shares ` +
      `@ ${h.buyPrice.toLocaleString("id-ID")} → ${h.currentPrice.toLocaleString("id-ID")} ` +
      `${arrow} ${sign}${pnlPct.toFixed(2)}%`
    );
  });

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;
  const sign = totalPnl >= 0 ? "+" : "";

  return {
    output: [
      "💼 Portfolio Analysis",
      "",
      "Holdings:",
      ...lines,
      "",
      `📊 Total Value:     Rp ${totalValue.toLocaleString("id-ID")}`,
      `💵 Total Cost:      Rp ${totalCost.toLocaleString("id-ID")}`,
      `📈 Unrealized P&L:  ${sign}Rp ${Math.abs(totalPnl).toLocaleString("id-ID")} (${sign}${totalPnlPct.toFixed(2)}%)`,
      "",
      "🎯 Recommendation: HOLD",
      "   Wait for breakout above 7,300 (IHSG)",
      "   Stop loss: -5% from current value",
      "",
      `Request: "${request}"`,
    ].join("\n"),
    usage: { tokens: 320, model: "mock-v1" },
  };
}

function handleRiskAssessment(request: string) {
  return {
    output: [
      "⚠️  Risk Assessment Report",
      "",
      "Portfolio Risk Score: 6.4 / 10 (Moderate)",
      "",
      "Diversification:",
      "  • Sector concentration: Banking (60%) ⚠️",
      "  • Geographic: 100% Indonesia 🟡",
      "  • Asset class: 100% Equity 🔴",
      "",
      "Volatility Analysis:",
      "  • 30d volatility: 18.2% (above market avg 15%)",
      "  • Max drawdown (6mo): -12.4%",
      "  • Beta vs IHSG: 1.08",
      "",
      "Risk Factors:",
      "  1. Overweight banking sector",
      "  2. No hedge against USD strength",
      "  3. Low cash buffer (5%)",
      "",
      "✅ Recommendations:",
      "  • Reduce BBCA position by 20%",
      "  • Add consumer staples (UNVR, ICBP)",
      "  • Keep cash buffer at 10-15%",
      "",
      `Request: "${request}"`,
    ].join("\n"),
    usage: { tokens: 410, model: "mock-v1" },
  };
}

// ═══════════════════════════════════════════════════════════
// A2A ENDPOINT — POST /a2a (JSON-RPC 2.0)
// ═══════════════════════════════════════════════════════════

app.post("/a2a", async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  console.log(`[A2A] Received request:`, {
    method,
    id,
    requestPreview: params?.request?.slice(0, 50),
  });

  // Validasi JSON-RPC
  if (jsonrpc !== "2.0" || !method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: -32600,
        message: "Invalid Request",
      },
    });
  }

  const requestText: string = params?.request ?? "";

  // Simulasi delay (biar keliatan "bekerja")
  await new Promise((r) => setTimeout(r, 1500));

  // Handle capability
  let result: any = null;

  switch (method) {
    case "stock-analysis":
      result = handleStockAnalysis(requestText);
      break;

    case "news-summary":
      result = handleNewsSummary(requestText);
      break;

    case "portfolio":
      result = handlePortfolio(requestText);
      break;

    case "risk-assessment":
      result = handleRiskAssessment(requestText);
      break;

    default:
      console.log(`[A2A] Method not found: ${method}`);
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      });
  }

  console.log(`[A2A] Responding to ${method} (${id})`);

  // Response sukses
  res.json({
    jsonrpc: "2.0",
    id,
    result,
  });
});

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`🤖 Mock A2A Agent ready at http://localhost:${PORT}`);
  console.log(`   Agent Card:  http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`   A2A Endpoint: POST http://localhost:${PORT}/a2a`);
  console.log("");
  console.log("   Capabilities:");
  console.log("     • stock-analysis  (10 token)");
  console.log("     • news-summary    ( 5 token)");
  console.log("     • portfolio       (15 token)");
  console.log("     • risk-assessment (20 token)");
});
