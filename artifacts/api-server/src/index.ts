import dotenv from "dotenv";
import path from "path";

// Load root workspace .env file, then local .env
dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import app from "./app";
import { startVerificationReminderWorker } from "./lib/verification-reminders";

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startVerificationReminderWorker();
});
