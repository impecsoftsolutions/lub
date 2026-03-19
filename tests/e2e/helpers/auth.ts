import { expect, type Locator, type Page } from '@playwright/test';

const SESSION_KEYS = [
  'lub_session_token',
  'lub_session_token_expiry',
  'lub_session_token_user',
] as const;

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getBaseUrl(): string {
  return getRequiredEnv('PHASE1_SMOKE_BASE_URL').replace(/\/+$/, '');
}

export async function gotoAppPath(page: Page, path: string): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  await page.goto(`${getBaseUrl()}${normalizedPath}`, { waitUntil: 'domcontentloaded' });
}

async function firstExistingLocator(
  page: Page,
  selectors: string[],
  fallback?: () => Locator
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if (await locator.count()) {
      return locator;
    }
  }

  if (!fallback) {
    return null;
  }

  const locator = fallback();
  if (await locator.count()) {
    return locator;
  }

  return null;
}

async function getVisibleTexts(page: Page, selectors: string[]): Promise<string[]> {
  const values: string[] = [];

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      const isVisible = await item.isVisible().catch(() => false);

      if (!isVisible) {
        continue;
      }

      const text = (await item.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (text) {
        values.push(text);
      }
    }
  }

  return [...new Set(values)];
}

async function getSessionTokenPresence(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const token = window.localStorage.getItem('lub_session_token');
      return Boolean(token && token.trim());
    })
    .catch(() => false);
}

async function getPageDiagnostics(page: Page): Promise<{
  currentUrl: string;
  hasSessionToken: boolean;
  toastText: string;
  inlineValidationText: string;
  bodyExcerpt: string;
}> {
  const currentUrl = page.url();
  const hasSessionToken = await getSessionTokenPresence(page);

  const toastText = (
    await getVisibleTexts(page, [
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
      '.Toastify__toast',
      '[data-sonner-toast]',
      '[class*="toast"]',
    ])
  ).join(' | ');

  const inlineValidationText = (
    await getVisibleTexts(page, [
      'p.text-red-500',
      'p.text-red-600',
      'span.text-red-500',
      'span.text-red-600',
      'div.text-red-500',
      'div.text-red-600',
      'p:has-text("required")',
      'p:has-text("valid")',
    ])
  ).join(' | ');

  const bodyExcerpt = await page
    .locator('body')
    .innerText()
    .then((text) => text.replace(/\s+/g, ' ').trim().slice(0, 500))
    .catch(() => '');

  return {
    currentUrl,
    hasSessionToken,
    toastText: toastText || '(none found)',
    inlineValidationText: inlineValidationText || '(none found)',
    bodyExcerpt: bodyExcerpt || '(none found)',
  };
}

async function getLoginRejectedDiagnostics(page: Page): Promise<string> {
  const diagnostics = await getPageDiagnostics(page);

  return [
    'Login rejected',
    `url=${diagnostics.currentUrl}`,
    `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
    `toast/alert=${diagnostics.toastText}`,
    `inline validation=${diagnostics.inlineValidationText}`,
    `body excerpt=${diagnostics.bodyExcerpt}`,
  ].join(' | ');
}

async function getLoginDiagnostics(page: Page): Promise<string> {
  const diagnostics = await getPageDiagnostics(page);
  const consoleErrors = await page
    .evaluate(() => {
      const win = window as Window & { __phase1ConsoleErrors?: string[] };
      return Array.isArray(win.__phase1ConsoleErrors) ? win.__phase1ConsoleErrors.slice(-10) : [];
    })
    .catch(() => []);

  return [
    `url=${diagnostics.currentUrl}`,
    `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
    `toast/alert=${diagnostics.toastText}`,
    `inline validation=${diagnostics.inlineValidationText}`,
    `body excerpt=${diagnostics.bodyExcerpt}`,
    `console errors=${consoleErrors.length ? consoleErrors.join(' || ') : '(none captured)'}`,
  ].join(' | ');
}

async function getAdminDeniedDiagnostics(page: Page): Promise<string> {
  const diagnostics = await getPageDiagnostics(page);
  const denialTexts = (
    await getVisibleTexts(page, [
      'text=/Access Restricted/i',
      'text=/Permission denied/i',
      'text=/not authorized/i',
      'text=/Portal Sign In/i',
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
    ])
  ).join(' | ');

  return [
    'Login succeeded but admin denied',
    `url=${diagnostics.currentUrl}`,
    `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
    `denial text=${denialTexts || '(none found)'}`,
    `toast/alert=${diagnostics.toastText}`,
    `body excerpt=${diagnostics.bodyExcerpt}`,
  ].join(' | ');
}

async function waitForSignInAttemptResult(page: Page): Promise<void> {
  await Promise.race([
    page.waitForFunction(() => {
      const token = window.localStorage.getItem('lub_session_token');
      return Boolean(token && token.trim());
    }, undefined, {
      timeout: 10_000,
    }),
    page.waitForFunction(() => !/^\/signin\/?$/.test(window.location.pathname), undefined, {
      timeout: 10_000,
    }),
  ]);
}

export async function assertAdminRouteAccess(page: Page, path: string): Promise<void> {
  await assertAdminRouteAccessWithOptions(page, path, {});
}

type AssertAdminRouteOptions = {
  timeoutMs?: number;
  settleMs?: number;
};

function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/+$/, '') || '/';
}

async function getCurrentPath(page: Page): Promise<string> {
  return page
    .evaluate(() => window.location.pathname.replace(/\/+$/, '') || '/')
    .catch(() => '');
}

async function hasAdminShellMarker(page: Page): Promise<boolean> {
  const adminPortalVisible = await page
    .getByRole('heading', { name: /Admin Portal/i })
    .first()
    .isVisible()
    .catch(() => false);

  const signOutVisible = await page
    .getByRole('button', { name: /Sign Out/i })
    .first()
    .isVisible()
    .catch(() => false);

  const dashboardOverviewVisible = await page
    .getByRole('heading', { name: /Dashboard Overview/i })
    .first()
    .isVisible()
    .catch(() => false);

  const sidebarOverviewVisible = await page
    .getByRole('link', { name: /^Overview$/i })
    .first()
    .isVisible()
    .catch(() => false);

  return adminPortalVisible && signOutVisible && (dashboardOverviewVisible || sidebarOverviewVisible);
}

async function hasAdminDeniedUi(page: Page): Promise<boolean> {
  const accessRestrictedVisible = await page
    .getByText(/Access Restricted/i)
    .first()
    .isVisible()
    .catch(() => false);

  const accessDeniedVisible = await page
    .getByText(/^Access Denied$/i)
    .first()
    .isVisible()
    .catch(() => false);

  const signInHeadingVisible = await page
    .getByRole('heading', { name: /Portal Sign In/i })
    .first()
    .isVisible()
    .catch(() => false);

  const signInButtonVisible = await page
    .getByRole('button', { name: /^Sign In$/i })
    .first()
    .isVisible()
    .catch(() => false);

  const signInEmailVisible = await page
    .locator('input#email, input[name="email"], input[type="email"]')
    .first()
    .isVisible()
    .catch(() => false);

  const signInMobileVisible = await page
    .locator('input#mobile_number, input[name="mobile_number"], input[type="tel"]')
    .first()
    .isVisible()
    .catch(() => false);

  const loginPromptVisible =
    signInHeadingVisible ||
    (signInButtonVisible && (signInEmailVisible || signInMobileVisible));

  return accessRestrictedVisible || accessDeniedVisible || loginPromptVisible;
}

export async function assertAdminRouteAccessWithOptions(
  page: Page,
  path: string,
  options: AssertAdminRouteOptions
): Promise<void> {
  const expectedPath = normalizePath(path);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const settleMs = options.settleMs ?? 1_500;

  await gotoAppPath(page, expectedPath);

  await page
    .waitForFunction(
      (expected) => {
        const current = window.location.pathname.replace(/\/+$/, '') || '/';
        return current === expected || /^\/signin\/?$/.test(current);
      },
      expectedPath,
      { timeout: timeoutMs }
    )
    .catch(() => {});

  const currentPath = await getCurrentPath(page);

  if (currentPath === expectedPath) {
    const redirectedToSignInDuringSettle = await page
      .waitForFunction(
        () => /^\/signin\/?$/.test(window.location.pathname.replace(/\/+$/, '') || '/'),
        undefined,
        { timeout: settleMs }
      )
      .then(() => true)
      .catch(() => false);

    if (redirectedToSignInDuringSettle) {
      throw new Error(await getAdminDeniedDiagnostics(page));
    }
  }

  const accessRestrictedVisible = await page
    .getByText(/Access Restricted/i)
    .first()
    .isVisible()
    .catch(() => false);

  const accessDeniedVisible = await page
    .getByText(/^Access Denied$/i)
    .first()
    .isVisible()
    .catch(() => false);

  if (/^\/signin\/?$/.test(currentPath) || accessRestrictedVisible || accessDeniedVisible) {
    throw new Error(await getAdminDeniedDiagnostics(page));
  }

  if (currentPath !== expectedPath) {
    const diagnostics = await getPageDiagnostics(page);
    throw new Error(
      [
        'Admin route did not stabilize on the expected path',
        `expected=${expectedPath}`,
        `actual=${currentPath || '(unknown)'}`,
        `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
        `toast/alert=${diagnostics.toastText}`,
        `body excerpt=${diagnostics.bodyExcerpt}`,
      ].join(' | ')
    );
  }
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const email = getRequiredEnv('PHASE1_SMOKE_ADMIN_EMAIL');
  const mobile = getRequiredEnv('PHASE1_SMOKE_ADMIN_MOBILE');

  await gotoAppPath(page, '/signin');

  const emailInput =
    (await firstExistingLocator(page, [
      'input#email',
      'input[name="email"]',
      'input[placeholder="your.email@example.com"]',
      'input[type="email"]',
    ], () => page.getByLabel(/Email Address/i).first())) ??
    null;

  const mobileInput =
    (await firstExistingLocator(page, [
      'input#mobile_number',
      'input[name="mobile_number"]',
      'input[placeholder="10-digit mobile number"]',
      'input[type="tel"]',
    ], () => page.getByLabel(/Mobile Number/i).first())) ??
    null;

  const submitButton =
    (await firstExistingLocator(page, [
      'button[type="submit"]',
    ], () => page.getByRole('button', { name: /Sign In|Signing In/i }).first())) ??
    null;

  if (!emailInput || !mobileInput || !submitButton) {
    throw new Error(
      `Sign-in form controls were not found. ${await getLoginDiagnostics(page)}`
    );
  }

  await emailInput.fill(email);
  await mobileInput.fill(mobile);
  await submitButton.click();

  try {
    await waitForSignInAttemptResult(page);
  } catch {
    throw new Error(await getLoginRejectedDiagnostics(page));
  }

  const hasSessionToken = await getSessionTokenPresence(page);

  if (!hasSessionToken) {
    throw new Error(await getLoginRejectedDiagnostics(page));
  }

  try {
    await assertAdminRouteAccess(page, '/admin/dashboard');
  } catch (assertError) {
    const currentPath = await getCurrentPath(page);
    const deniedUi = await hasAdminDeniedUi(page);
    const shellVisible = await hasAdminShellMarker(page);

    if (currentPath === '/admin/dashboard' && shellVisible && !deniedUi) {
      return;
    }

    if (/^\/signin\/?$/.test(currentPath) || deniedUi) {
      throw new Error(await getAdminDeniedDiagnostics(page));
    }

    const diagnostics = await getPageDiagnostics(page);
    throw new Error(
      [
        'Admin dashboard route assertion failed after successful sign-in',
        `path=${currentPath || '(unknown)'}`,
        `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
        `shell marker visible: ${shellVisible ? 'yes' : 'no'}`,
        `toast/alert=${diagnostics.toastText}`,
        `body excerpt=${diagnostics.bodyExcerpt}`,
        `assert error=${assertError instanceof Error ? assertError.message : String(assertError)}`,
      ].join(' | ')
    );
  }

  const finalPath = await getCurrentPath(page);
  const finalShellVisible = await hasAdminShellMarker(page);
  if (finalPath !== '/admin/dashboard' || !finalShellVisible) {
    const diagnostics = await getPageDiagnostics(page);
    throw new Error(
      [
        'Admin shell marker was not stable after login',
        `path=${finalPath || '(unknown)'}`,
        `token present: ${diagnostics.hasSessionToken ? 'yes' : 'no'}`,
        `shell marker visible: ${finalShellVisible ? 'yes' : 'no'}`,
        `toast/alert=${diagnostics.toastText}`,
        `body excerpt=${diagnostics.bodyExcerpt}`,
      ].join(' | ')
    );
  }
}

export async function clearCustomSession(page: Page): Promise<void> {
  await page
    .evaluate((keys) => {
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    }, [...SESSION_KEYS])
    .catch(() => {});
}
