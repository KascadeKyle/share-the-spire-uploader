import { config } from "dotenv";
import * as path from "node:path";

// Resolve `.env` next to `package.json` rather than `process.cwd()` —
// monorepo scripts can run with the repository root as the working
// directory, which would otherwise miss the file entirely.
config({ path: path.join(__dirname, "..", "..", ".env") });
