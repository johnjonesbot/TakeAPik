import { existsSync } from "node:fs";

// Match Next.js dotenv behavior for CLI scripts; real env vars take precedence.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
