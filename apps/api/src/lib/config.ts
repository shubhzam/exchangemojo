// single place env vars get read and validated. every backing service we add
// later (postgres, redis) gets a field here instead of a bare process.env
// lookup buried in some route handler.
export class Config {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.port = Number(env.PORT ?? 4000);
    this.nodeEnv = env.NODE_ENV ?? "development";

    // fail at boot, not on the first request
    if (!Number.isInteger(this.port) || this.port <= 0) {
      throw new Error(`invalid PORT: ${env.PORT}`);
    }

    // no default. a missing db url should stop the process, not silently
    // connect to something unintended.
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    this.databaseUrl = env.DATABASE_URL;
  }
}

export const config = new Config();