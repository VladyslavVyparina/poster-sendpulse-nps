import { createApp } from "./app.js";
import { config } from "./config.js";
import { JobStore } from "./db/database.js";
import { logger } from "./logger.js";
import { createPosterClient } from "./poster/client.js";
import { createSendPulseClient } from "./sendpulse/client.js";
import { NpsFlowService } from "./services/nps-flow.js";

const store = new JobStore(config.databasePath);
const poster = createPosterClient({
  getAccessToken: () => store.getPosterAccessToken(),
});
const sendpulse = createSendPulseClient();
const flow = new NpsFlowService(store, poster, sendpulse);
const app = createApp({ store, flow, poster });

const server = app.listen(config.port, "0.0.0.0", () => {
  const settings = store.getSettings();
  logger.info("Poster ↔ SendPulse NPS middleware started", {
    port: config.port,
    sendpulseMode: config.sendpulseMode,
    settings,
    publicBaseUrl: config.publicBaseUrl,
    webhookUrl: `${config.publicBaseUrl}/webhooks/poster`,
    adminUrl: `${config.publicBaseUrl}/admin`,
    triggerStatuses: config.triggerStatuses,
  });
});

const worker = setInterval(() => {
  flow
    .processDueJobs()
    .then((result) => {
      if (result.processed > 0) {
        logger.info("Processed due NPS jobs", result);
      }
    })
    .catch((error) => logger.error("Worker tick failed", { error: String(error) }));
}, 15_000);

function shutdown(signal: string) {
  logger.info(`Shutting down on ${signal}`);
  clearInterval(worker);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
