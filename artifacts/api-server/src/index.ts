import dotenv from "dotenv";
import path from "path";

// Load root workspace .env file
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

import app from "./app";
import { startVerificationReminderWorker } from "./lib/verification-reminders";

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port} (http://127.0.0.1:${port})`);
  startVerificationReminderWorker();
});
