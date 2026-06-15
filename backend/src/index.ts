import express, { type Express } from "express";
import cors from "cors";
import { config, getChain } from "./config/index.js";
import { agentsRouter } from "./routes/agents.js";
import { boardroomRouter } from "./routes/boardroom.js";
import { economyRouter } from "./routes/economy.js";
import { strategyRouter } from "./routes/strategy.js";
import { delegateRouter } from "./routes/delegate.js";
import { webhookRouter } from "./routes/webhook.js";
import { publicRouter } from "./routes/public.js";
import { autonomousRouter } from "./routes/autonomous.js";
import { sessionsRouter } from "./routes/sessions.js";
import { realtimeFeeds } from "./services/realtime-feeds.js";

const app: Express = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", chain: config.chainId });
});

app.get("/api/feeds/status", (_req, res) => {
  res.json(realtimeFeeds.getSnapshot());
});

app.get("/api/feeds/stream", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const onPrice = (data: unknown) => res.write(`data: ${JSON.stringify({ type: 'price', data })}\n\n`);
  const onFunding = (data: unknown) => res.write(`data: ${JSON.stringify({ type: 'funding', data })}\n\n`);
  const onLiquidation = (data: unknown) => res.write(`data: ${JSON.stringify({ type: 'liquidation', data })}\n\n`);
  const onOnchain = (data: unknown) => res.write(`data: ${JSON.stringify({ type: 'onchain', data })}\n\n`);
  const onFearGreed = (data: unknown) => res.write(`data: ${JSON.stringify({ type: 'fear_greed', data })}\n\n`);

  realtimeFeeds.on('price', onPrice);
  realtimeFeeds.on('funding', onFunding);
  realtimeFeeds.on('liquidation', onLiquidation);
  realtimeFeeds.on('onchain', onOnchain);
  realtimeFeeds.on('fear_greed', onFearGreed);

  req.on('close', () => {
    realtimeFeeds.off('price', onPrice);
    realtimeFeeds.off('funding', onFunding);
    realtimeFeeds.off('liquidation', onLiquidation);
    realtimeFeeds.off('onchain', onOnchain);
    realtimeFeeds.off('fear_greed', onFearGreed);
  });
});

app.use("/api/agents", agentsRouter);
app.use("/api/agents/boardroom", boardroomRouter);
app.use("/api/economy", economyRouter);
app.use("/api/public", publicRouter);
app.use("/api/autonomous", autonomousRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/strategy", strategyRouter);
app.use("/api/delegate", delegateRouter);
app.use("/api/webhook", webhookRouter);

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Chain: ${getChain().name} (${config.chainId})`);
  realtimeFeeds.start();
});

export { app };
