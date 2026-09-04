/**
 * server.js - Express Server for Responsive Audit Tool
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');
const { runAudit } = require('./auditor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main audit endpoint
app.post('/api/audit', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Increase response timeout to 150 seconds to accommodate Lighthouse (mobile + desktop audits)
  res.setTimeout(150000);

  console.log(`\n🔍 Starting full audit for: ${parsedUrl.href}`);
  const startTime = Date.now();

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--no-zygote',
        '--window-size=1920,1080',
        '--remote-debugging-port=0',        // Required for Lighthouse
        '--disable-blink-features=AutomationControlled', // KEY: bypass YouTube/Google bot detection
        '--disable-features=IsolateOrigins,site-per-process', // Prevent renderer crashes
        '--disable-web-security',           // Reduce cross-origin blocks
        '--allow-running-insecure-content',
        '--ignore-certificate-errors',      // Handle self-signed certs
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    const results = await runAudit(browser, parsedUrl.href);
    results.auditDuration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    const lhStatus = results.lighthouse ? '✅ Lighthouse OK' : '⚠️ Lighthouse skipped';
    console.log(`✅ Audit completed in ${results.auditDuration}`);
    console.log(`   Score: ${results.overallScore}/100 (${results.grade.label}) | DOM: ${results.domScore} | ${lhStatus}`);

    res.json(results);
  } catch (err) {
    console.error('❌ Audit failed:', err.message);
    res.status(500).json({
      error: 'Audit failed',
      message: err.message,
      details: 'Kiểm tra lại URL hoặc thử lại sau.',
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Responsive Audit Tool running at http://0.0.0.0:${PORT}`);
  console.log(`   Ready to analyze websites!\n`);
});
