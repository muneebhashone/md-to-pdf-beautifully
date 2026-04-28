import { getBrowser } from "./browser";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    // Use a data: URL via goto rather than setContent so Chromium emits internal
    // PDF link annotations for in-document `#anchor` hrefs.
    const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
    await page.goto(dataUrl, { waitUntil: "networkidle0", timeout: 45000 });
    // Wait for fonts and mermaid to settle
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.waitForFunction(
      "window.__mermaidReady === true",
      { timeout: 30000 },
    );
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "22mm", bottom: "24mm", left: "18mm", right: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8pt;color:#888;width:100%;text-align:center;font-family:'Inter Tight',sans-serif;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
