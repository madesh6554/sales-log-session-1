// @ts-check
const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');

require('dotenv').config();

const TEST_CUSTOMER = 'Test Customer';

// Today from local date parts. new Date().toISOString() would be UTC and could
// write yesterday's date east or west of the line.
function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// "₹1,25,005.00" -> 125005. Strips the symbol, the Indian grouping commas, and
// any non-breaking space Intl may insert.
function parseMoney(text) {
  return Number(String(text).replace(/[^0-9.-]/g, ''));
}

// Removes only the rows this test created, matched on the distinctive name.
async function deleteTestRows() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    const result = await pool.query('delete from sales where customer_name = $1 returning id', [TEST_CUSTOMER]);
    return result.rows.map((row) => row.id);
  } finally {
    await pool.end();
  }
}

test.describe('ForgeLite', () => {
  test('saves a sale and shows it in the list', async ({ page }) => {
    await page.goto('/');

    await page.fill('#customerName', TEST_CUSTOMER);
    await page.fill('#item', 'Playwright Test');
    await page.fill('#amount', '1');
    await page.fill('#saleDate', today());

    await page.click('#save');

    await expect(page.locator('#status')).toHaveText('Saved');

    const row = page.locator('#sales-body tr', { hasText: TEST_CUSTOMER });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('₹1.00');

    const removed = await deleteTestRows();
    expect(removed.length).toBe(1);
  });

  test('loads cold and renders the sales list without errors', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const badApiResponses = [];

    // Listeners are attached before goto — attaching afterwards would miss
    // anything thrown while the page was starting up, which is the point here.
    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return;
      }
      // Google Fonts is a third party. If it is unreachable the page still works,
      // and this test is about the app, not about the network.
      if (/fonts\.(googleapis|gstatic)\.com/.test(message.text())) {
        return;
      }
      consoleErrors.push(message.text());
    });

    page.on('pageerror', (error) => pageErrors.push(error.message));

    page.on('response', (response) => {
      if (response.url().includes('/api/') && !response.ok()) {
        badApiResponses.push(`${response.url()} -> ${response.status()}`);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(badApiResponses).toEqual([]);

    // The list must settle into exactly one of its two valid states: a table with
    // rows, or the empty message. Asserting only "table visible" would fail on an
    // empty database for the wrong reason.
    const tableVisible = await page.locator('#sales-table').isVisible();
    const emptyVisible = await page.locator('#empty').isVisible();

    expect(tableVisible || emptyVisible).toBe(true);
    expect(tableVisible && emptyVisible).toBe(false);

    if (tableVisible) {
      expect(await page.locator('#sales-body tr').count()).toBeGreaterThan(0);
    } else {
      await expect(page.locator('#empty')).toHaveText('No sales yet');
    }
  });

  test('this month total equals the sum of this month rows in the list', async ({ page }) => {
    await page.goto('/');

    // The list defaults to every sale, so it must be narrowed to this month first
    // — otherwise other months' rows would be summed against a one-month total.
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/sales?') && response.ok()),
      page.click('#this-month')
    ]);

    const cardTotal = parseMoney(await page.locator('#month-total').textContent());

    const amounts = await page.locator('#sales-body tr td.numeric').allTextContents();
    const listTotal = amounts.reduce((sum, text) => sum + parseMoney(text), 0);

    // Parsed decimal strings — compare to 2 dp rather than by exact equality.
    expect(listTotal).toBeCloseTo(cardTotal, 2);
  });
});
