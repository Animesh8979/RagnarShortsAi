const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

/**
 * Headless DOM Scraper (The "Coffeezilla Editor" module)
 * Launches Edge/Chrome to take a high-res screenshot of a targeted URL.
 */
async function captureWebsite(url, outputFile) {
  // Use existing Playwright/Puppeteer cache if available, or system Edge
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 }); // Retina screenshot
    
    console.log(`[DomScraper] Navigating to ${url}...`);
    // Wait until network is idle to ensure images/fonts load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Inject custom CSS to hide cookie banners or floating headers if necessary
    await page.evaluate(() => {
      const banners = document.querySelectorAll('[id*="cookie"],[class*="cookie"],header.sticky');
      banners.forEach(b => b.remove());
    });

    console.log(`[DomScraper] Capturing screenshot to ${outputFile}...`);
    await page.screenshot({ path: outputFile, fullPage: false });
    
    return outputFile;
  } catch (error) {
    console.error(`[DomScraper] Failed to capture ${url}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { captureWebsite };
