import puppeteer, { type Browser } from "puppeteer";

let cached: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!cached) {
    cached = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export async function closeBrowser() {
  if (cached) {
    const b = await cached;
    cached = null;
    await b.close();
  }
}
