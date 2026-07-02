export const terminal = {
  header(title: string): void {
    console.log("");
    console.log("────────────────────────────────────────");
    console.log(`Loop Engine • ${title}`);
    console.log("────────────────────────────────────────");
  },

  section(title: string): void {
    console.log("");
    console.log(title);
    console.log("────────────────────────────────────────");
  },

  info(message: string): void {
    console.log(`ℹ ${message}`);
  },

  success(message: string): void {
    console.log(`✓ ${message}`);
  },

  warning(message: string): void {
    console.log(`⚠ ${message}`);
  },

  error(message: string): void {
    console.error(`✖ ${message}`);
  },

  step(message: string): void {
    console.log(`▶ ${message}`);
  },

  clearLine(): void {
    process.stdout.write("\r\x1b[K");
  },

  writeInline(message: string): void {
    process.stdout.write(`\r${message}`);
  },
};
