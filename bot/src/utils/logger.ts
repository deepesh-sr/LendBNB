export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: Record<string, unknown>) {
    console.log(
      `[${new Date().toISOString()}] [${this.context}] INFO: ${message}`,
      data ? JSON.stringify(data, this.bigintReplacer) : ""
    );
  }

  warn(message: string, data?: Record<string, unknown>) {
    console.warn(
      `[${new Date().toISOString()}] [${this.context}] WARN: ${message}`,
      data ? JSON.stringify(data, this.bigintReplacer) : ""
    );
  }

  error(message: string, error?: unknown) {
    console.error(
      `[${new Date().toISOString()}] [${this.context}] ERROR: ${message}`,
      error
    );
  }

  private bigintReplacer(_key: string, value: unknown): unknown {
    return typeof value === "bigint" ? value.toString() : value;
  }
}
