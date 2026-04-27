import { getBrowser } from "./browser";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 45000 });
    // Wait for fonts and mermaid to settle
    await page.evaluate(async () => {
      // @ts-expect-error document.fonts exists in headless chrome
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.waitForFunction(
      // @ts-expect-error window prop
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
