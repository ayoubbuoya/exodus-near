import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Optional local QA tool, deliberately separate from runtime dependencies.
const { chromium } = await import(
  process.env.EXODUS_PLAYWRIGHT_MODULE || 'playwright'
);
const base = process.env.EXODUS_TEST_URL || 'http://127.0.0.1:3000';
const output = process.env.EXODUS_QA_OUTPUT || 'node_modules/.cache/exodus-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.EXODUS_CHROMIUM_PATH
    ? { executablePath: process.env.EXODUS_CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const unit = 10n ** 24n;
const raw = (n) => (BigInt(n) * unit).toString();
const scenario = {
  paused: false,
  matured: false,
  historyError: false,
  emptyHistory: false,
  quoteDelay: 0,
};
let previews = 0,
  intentRequests = 0;

const walletModule = `import React from '/node_modules/.vite/deps/react.js';
const {createContext,useContext,useState}=React;
const Context=createContext(null);
export function WalletProvider({children}) {
  const [accountId,setAccountId]=useState(null);
  const value={accountId,isConnected:!!accountId,isConnecting:false,error:null,
    connect:async()=>setAccountId('farouk.testnet'),disconnect:async()=>setAccountId(null),
    executeTransaction:async(receiverId,methodName,args,deposit,gas)=>{
      window.__walletCalls ??= [];window.__walletCalls.push({receiverId,methodName,args,deposit,gas});
      if(window.__failNext){window.__failNext=false;throw new Error('Wallet request rejected by user');}
      await new Promise(resolve=>setTimeout(resolve,100));
      return {transaction:{hash:'test-transaction-hash'},status:{SuccessValue:''}};
    }};
  return React.createElement(Context.Provider,{value},children);
}
export function useWallet(){return useContext(Context);}`;

await page.route(/\/src\/context\/WalletContext\.tsx(?:\?.*)?$/, (route) =>
  route.fulfill({ contentType: 'application/javascript', body: walletModule }),
);
await page.route('https://test.rpc.fastnear.com/**', async (route) => {
  const request = route.request().postDataJSON();
  const method = request.params.method_name;
  const args = JSON.parse(
    Buffer.from(request.params.args_base64, 'base64').toString(),
  );
  const pool = {
    total_pt: raw(1000),
    total_sy: raw(1000),
    total_lp: raw(1000),
    last_ln_implied_rate: '50000000000000000',
    scalar_root: '1000000000000000000',
    ln_fee_rate_root: '1000000000000000',
  };
  let value;
  if (method === 'get_market')
    value = {
      ...pool,
      owner_id: 'owner.testnet',
      treasury_id: 'owner.testnet',
      lst_id: 'mock-lst.fond-buoya.testnet',
      paused: scenario.paused,
      expiry_ns:
        (Date.now() + (scenario.matured ? -86400000 : 8640000000)) * 1e6,
      py_index: '1250000000000000000',
      index_at_maturity: scenario.matured ? '1250000000000000000' : null,
      index_epoch: 123,
      index_updated_ns: Date.now() * 1e6,
    };
  else if (method === 'get_pool') value = pool;
  else if (method === 'get_user')
    value = {
      pt_balance: raw(100),
      yt_balance: raw(100),
      lp_balance: raw(100),
      accrued_sy: (unit / 10n).toString(),
      pending_refund: '0',
      user_index: '1250000000000000000',
    };
  else if (method === 'ft_balance_of') value = raw(1000);
  else if (method.startsWith('preview_swap_')) {
    previews++;
    const input = BigInt(args.sy_in || args.pt_in || args.yt_in);
    const result = method.endsWith('for_yt')
      ? input * 5n
      : method.endsWith('for_pt')
        ? (input * 104n) / 100n
        : (input * 96n) / 100n;
    if (scenario.quoteDelay)
      await new Promise((resolve) => setTimeout(resolve, scenario.quoteDelay));
    value = {
      amount_out: result.toString(),
      fee_sy: (input / 100n).toString(),
      new_last_ln_implied_rate: pool.last_ln_implied_rate,
    };
  } else throw new Error(`Unexpected RPC method: ${method}`);
  await route.fulfill({
    json: {
      jsonrpc: '2.0',
      id: request.id,
      result: { result: [...Buffer.from(JSON.stringify(value))] },
    },
  });
});
await page.route('https://api-exodus-near.buoya.space/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/history')) {
    assert.match(
      url.pathname,
      /\/markets\/(demo-market|linear-market)\.fond-buoya\.testnet\/history$/,
    );
    if (scenario.historyError)
      return route.fulfill({ status: 503, json: { error: 'offline' } });
    return route.fulfill({
      json: scenario.emptyHistory
        ? []
        : [2, 1, 0].map((hours) => ({
            ts: new Date(Date.now() - hours * 3600000).toISOString(),
            implied_apy: '0.05',
            underlying_apy: '0.08',
            py_index: '1250000000000000000',
            total_pt: raw(1000),
            total_sy: raw(1000),
            tvl_near: '1250',
          })),
    });
  }
  if (url.pathname === '/intents/tokens')
    return route.fulfill({
      json: [
        {
          assetId:
            'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
          symbol: 'USDC',
          blockchain: 'arb',
          decimals: 6,
        },
      ],
    });
  if (url.pathname === '/intents/quote') {
    const body = route.request().postDataJSON();
    intentRequests++;
    assert.equal(
      body.dry,
      true,
      'The testnet UI must never request a live mainnet deposit',
    );
    assert.equal(body.amount, '100000000');
    assert.equal(
      body.originAsset,
      'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
    );
    return route.fulfill({
      json: {
        quote: {
          amountIn: body.amount,
          amountOut: raw(40),
          amountOutFormatted: '40',
          minAmountOut: raw(39),
          timeEstimate: 25,
        },
      },
    });
  }
  throw new Error(`Unexpected API request: ${url.pathname}`);
});

async function waitFor(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(message);
}
async function navigate(tab, label) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, `#/app/${tab}?market=demo-mock`);
  await page
    .getByRole('heading', { level: 1, name: label, exact: true })
    .waitFor();
}
async function noOverflow(label) {
  const sizes = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    sizes.document <= sizes.width,
    `${label}: horizontal overflow ${JSON.stringify(sizes)}`,
  );
}
async function confirmAction(button) {
  const count = await page.evaluate(() => window.__walletCalls?.length || 0);
  await button.click();
  await page
    .getByRole('heading', { name: 'Transaction confirmed', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.__walletCalls.length),
    count + 1,
  );
  const call = await page.evaluate(() => window.__walletCalls.at(-1));
  await page
    .getByRole('button', { name: 'Back to workspace', exact: true })
    .click();
  return call;
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(`Landing ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click();
  await page
    .locator('#mobile-nav')
    .getByRole('link', { name: 'How it works' })
    .click();
  assert.equal(await page.locator('#mobile-nav').count(), 0);
  const slider = page.getByRole('slider');
  await slider.fill('0');
  assert.equal(
    await page
      .locator('.split-demo .instrument')
      .evaluate((node) => node.style.getPropertyValue('--slide')),
    '0',
  );
  await slider.fill('1');
  await page.locator('#faq details').first().locator('summary').click();
  assert.equal(
    await page.locator('#faq details').first().getAttribute('open'),
    '',
  );
  console.log(
    'PASS landing navigation, FAQ, split interaction, reduced motion, and four responsive widths',
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate('fix', 'Fixed yield.');
  await page.getByText('3 indexed snapshots', { exact: true }).waitFor();
  await page
    .locator('.app-topbar')
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page.getByLabel('You pay', { exact: true }).fill('10');
  await page
    .getByRole('button', { name: 'Buy PT', exact: true })
    .last()
    .waitFor();
  await waitFor(
    () =>
      page
        .locator('.trade-output strong')
        .textContent()
        .then((text) => text === '10.4'),
    'PT quote missing',
  );
  const buyPt = await confirmAction(page.locator('form .action-button'));
  assert.equal(buyPt.receiverId, 'mock-lst.fond-buoya.testnet');
  assert.equal(buyPt.methodName, 'ft_transfer_call');
  assert.equal(buyPt.args.amount, raw(10));
  assert.equal(
    JSON.parse(buyPt.args.msg).min_pt_out,
    '10348000000000000000000000',
  );
  await page.getByRole('button', { name: 'Sell PT', exact: true }).click();
  await page.getByLabel('You pay', { exact: true }).fill('2');
  await waitFor(
    () => page.locator('form .action-button').isEnabled(),
    'Sell PT disabled',
  );
  const sellPt = await confirmAction(page.locator('form .action-button'));
  assert.equal(sellPt.methodName, 'swap_exact_pt_for_sy');
  assert.equal(sellPt.args.pt_in, raw(2));
  assert.equal(sellPt.args.min_sy_out, '1910400000000000000000000');
  for (const value of ['NaN', '-1', '1e4', '1.2.3', '']) {
    await page.getByLabel('You pay', { exact: true }).fill(value);
    assert.ok(await page.locator('form .action-button').isDisabled());
  }
  console.log(
    'PASS PT buy/sell signing payloads, slippage minimums, and invalid amount guards',
  );

  await page
    .getByRole('button', { name: 'Buy PT', exact: true })
    .first()
    .click();
  scenario.quoteDelay = 600;
  await page.locator('.trade-output strong').evaluate((node) => {
    window.__quoteTexts = [];
    new MutationObserver(() =>
      window.__quoteTexts.push(node.textContent),
    ).observe(node, { childList: true, characterData: true, subtree: true });
  });
  const previousPreviews = previews;
  await page.getByLabel('You pay', { exact: true }).fill('1');
  await waitFor(
    async () => previews > previousPreviews,
    'First delayed quote never started',
  );
  await page.getByLabel('You pay', { exact: true }).fill('2');
  await waitFor(
    () =>
      page
        .locator('.trade-output strong')
        .textContent()
        .then((text) => text === '2.08'),
    'Updated quote never appeared',
  );
  assert.ok(
    !(await page.evaluate(() => window.__quoteTexts)).includes('1.04'),
    'An outdated quote overwrote the new input',
  );
  scenario.quoteDelay = 0;
  await page.getByLabel(/selected market/i).selectOption('linear-31mar27');
  assert.match(page.url(), /market=linear-31mar27/);
  await page.getByLabel(/selected market/i).selectOption('demo-mock');
  console.log(
    'PASS delayed quote race handling and market selection deep links',
  );

  await navigate('long', 'Long yield.');
  await page.getByLabel('You pay', { exact: true }).fill('1');
  await waitFor(
    () => page.locator('form .action-button').isEnabled(),
    'Buy YT disabled',
  );
  const buyYt = await confirmAction(page.locator('form .action-button'));
  assert.equal(JSON.parse(buyYt.args.msg).action, 'swap_exact_sy_for_yt');
  await page.getByRole('button', { name: 'Sell YT', exact: true }).click();
  await page.getByLabel('You pay', { exact: true }).fill('1');
  await waitFor(
    () => page.locator('form .action-button').isEnabled(),
    'Sell YT disabled',
  );
  assert.equal(
    (await confirmAction(page.locator('form .action-button'))).methodName,
    'swap_exact_yt_for_sy',
  );
  console.log('PASS YT buy/sell transaction requests');

  await navigate('mint-redeem', 'Mint & redeem.');
  await page.getByLabel('Deposit LST', { exact: true }).fill('10');
  assert.ok(
    (await page.locator('.mint-output').textContent()).includes('12.5'),
  );
  assert.equal(
    JSON.parse(
      (await confirmAction(page.locator('form .action-button'))).args.msg,
    ).action,
    'mint_py',
  );
  await page.getByRole('button', { name: 'PT + YT', exact: true }).click();
  await page.getByLabel('Equal PT + YT to redeem').fill('2');
  assert.equal(
    (await confirmAction(page.locator('form .action-button'))).methodName,
    'redeem_py',
  );
  await page.getByRole('button', { name: 'Matured PT', exact: true }).click();
  await page.getByLabel('PT to redeem', { exact: true }).fill('2');
  assert.ok(await page.locator('form .action-button').isDisabled());

  await navigate('pool', 'Liquidity.');
  await page.getByLabel('Deposit LST', { exact: true }).fill('10');
  assert.equal(await page.getByLabel('Pair with principal').inputValue(), '10');
  const addLp = await confirmAction(page.locator('form .action-button'));
  assert.equal(
    JSON.parse(addLp.args.msg).min_lp_out,
    '9950000000000000000000000',
  );
  await page
    .getByRole('button', { name: 'Remove liquidity', exact: true })
    .click();
  await page.getByLabel('LP shares to burn').fill('1');
  const removeLp = await confirmAction(page.locator('form .action-button'));
  assert.equal(removeLp.methodName, 'remove_liquidity');
  assert.equal(removeLp.args.min_pt_out, '995000000000000000000000');
  console.log(
    'PASS mint, paired redemption, pre-maturity guard, proportional liquidity, and withdrawal minimums',
  );

  await navigate('portfolio', 'Portfolio.');
  await page
    .getByRole('heading', { name: 'Yield, ready when you are.' })
    .waitFor();
  assert.equal(
    (
      await confirmAction(
        page.getByRole('button', { name: 'Claim yield', exact: true }),
      )
    ).methodName,
    'claim_interest',
  );
  await page.evaluate(() => {
    window.__failNext = true;
  });
  await page.getByRole('button', { name: 'Claim yield', exact: true }).click();
  await page
    .getByText('Wallet request rejected by user', { exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  console.log(
    'PASS connected portfolio, yield claims, rejection feedback, dialog Escape dismissal',
  );

  scenario.paused = true;
  await page
    .getByRole('button', { name: 'Refresh market data', exact: true })
    .click();
  await page.getByText('Paused · exits open', { exact: true }).waitFor();
  await navigate('mint-redeem', 'Mint & redeem.');
  await page.getByLabel('Deposit LST', { exact: true }).fill('1');
  assert.ok(await page.locator('form .action-button').isDisabled());
  await page.getByRole('button', { name: 'PT + YT', exact: true }).click();
  await page.getByLabel('Equal PT + YT to redeem').fill('1');
  assert.equal(
    (await confirmAction(page.locator('form .action-button'))).methodName,
    'redeem_py',
  );
  scenario.matured = true;
  await page
    .getByRole('button', { name: 'Refresh market data', exact: true })
    .click();
  await page.getByRole('button', { name: 'Matured PT', exact: true }).click();
  await page.getByLabel('PT to redeem', { exact: true }).fill('1');
  await waitFor(
    () => page.locator('form .action-button').isEnabled(),
    'Matured PT redemption blocked',
  );
  assert.equal(
    (await confirmAction(page.locator('form .action-button'))).methodName,
    'redeem_pt',
  );
  await navigate('pool', 'Liquidity.');
  await page
    .getByRole('button', { name: 'Remove liquidity', exact: true })
    .click();
  await page.getByLabel('LP shares to burn').fill('1');
  assert.equal(
    (await confirmAction(page.locator('form .action-button'))).methodName,
    'remove_liquidity',
  );
  await navigate('portfolio', 'Portfolio.');
  assert.equal(
    (
      await confirmAction(
        page.getByRole('button', { name: 'Claim yield', exact: true }),
      )
    ).methodName,
    'claim_interest',
  );
  console.log(
    'PASS paused and matured market exits: paired redemption, matured PT, liquidity withdrawal, interest claim',
  );

  await navigate('intents', 'Cross-chain.');
  await waitFor(
    () =>
      page
        .locator('#origin-token option:checked')
        .textContent()
        .then((text) => text.trim() === 'USDC · Arbitrum'),
    'The selected origin chain does not match its token',
  );
  await page.getByRole('button', { name: 'Preview route' }).click();
  await page.getByRole('button', { name: 'Refresh quote' }).waitFor();
  assert.equal(await page.locator('.trade-output strong').textContent(), '40');
  assert.equal(intentRequests, 1);
  assert.equal(await page.getByText(/deposit address/i).count(), 1);
  console.log('PASS cross-chain dry-run quote and formatted output');

  scenario.paused = false;
  scenario.matured = false;
  await navigate('fix', 'Fixed yield.');
  await page.getByRole('button', { name: 'Quick tour', exact: true }).click();
  await page
    .getByRole('heading', {
      name: 'One asset. Two possibilities.',
      exact: true,
    })
    .waitFor();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  assert.ok(
    await page.evaluate(() =>
      document.querySelector('dialog[open]')?.contains(document.activeElement),
    ),
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [tab, label] of [
      ['fix', 'Fixed yield.'],
      ['long', 'Long yield.'],
      ['pool', 'Liquidity.'],
      ['mint-redeem', 'Mint & redeem.'],
      ['portfolio', 'Portfolio.'],
      ['intents', 'Cross-chain.'],
    ]) {
      await navigate(tab, label);
      await noOverflow(`${tab} ${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await page
    .locator('#workspace-sidebar')
    .getByRole('link', { name: 'Portfolio', exact: true })
    .click();
  await page.getByRole('heading', { level: 1, name: 'Portfolio.' }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Open workspace navigation' })
      .getAttribute('aria-expanded'),
    'false',
  );
  console.log(
    'PASS all six screens at four widths, mobile menu, native dialog focus trap and keyboard dismissal',
  );

  scenario.historyError = true;
  await navigate('fix', 'Fixed yield.');
  await page
    .getByText('Yield history is temporarily unavailable.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.recharts-wrapper').count(), 0);
  scenario.historyError = false;
  scenario.emptyHistory = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page
    .getByText('No snapshots in this time range.', { exact: true })
    .waitFor();
  scenario.emptyHistory = false;
  await page
    .getByRole('button', { name: 'Refresh history', exact: true })
    .click();
  await page.getByText('3 indexed snapshots', { exact: true }).waitFor();
  await navigate('long', 'Long yield.');
  await page.getByText('3 indexed snapshots', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Disconnect wallet' }).click();
  await navigate('portfolio', 'Portfolio.');
  await page
    .getByRole('heading', { name: 'A clearer picture starts here.' })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `PASS history outage/empty/recovery, wallet disconnect, and no JavaScript errors (${previews} mocked on-chain quotes)`,
  );
  await page.screenshot({
    path: `${output}/portfolio-mobile.png`,
    fullPage: true,
  });
} catch (error) {
  console.error(
    'Browser diagnostics:',
    JSON.stringify({
      errors,
      overflow: await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .map((node) => ({
            tag: node.tagName,
            class: String(node.className),
            right: node.getBoundingClientRect().right,
            width: node.getBoundingClientRect().width,
          }))
          .filter((node) => node.width > 0 && node.right > innerWidth + 0.5)
          .slice(0, 10),
      ),
      body: (await page.locator('body').innerText()).slice(0, 1800),
    }),
  );
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
