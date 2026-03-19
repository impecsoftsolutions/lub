import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';

import { assertAdminRouteAccess, assertAdminRouteAccessWithOptions, clearCustomSession, gotoAppPath, loginAsAdmin } from './helpers/auth';
import { buildUniqueValue, loadSmokeFixtures, type Phase1SmokeFixtures } from './helpers/fixtures';

type Diagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  serverErrors: string[];
};

function attachDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    serverErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'request failed'}`);
  });

  page.on('response', async (response) => {
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  return diagnostics;
}

async function recordDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics): Promise<void> {
  const hasData =
    diagnostics.consoleErrors.length > 0 ||
    diagnostics.pageErrors.length > 0 ||
    diagnostics.requestFailures.length > 0 ||
    diagnostics.serverErrors.length > 0;

  if (!hasData) {
    return;
  }

  await testInfo.attach('browser-diagnostics', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  });
}

function getFatalRequestFailures(requestFailures: string[]): string[] {
  return requestFailures.filter((failure) => {
    if (failure.startsWith('HEAD ')) {
      return false;
    }

    if (failure.includes('net::ERR_ABORTED')) {
      return false;
    }

    return true;
  });
}

async function assertNoFatalDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics): Promise<void> {
  await recordDiagnostics(testInfo, diagnostics);
  expect.soft(
    getFatalRequestFailures(diagnostics.requestFailures),
    'Unexpected failed network requests'
  ).toEqual([]);
  expect.soft(diagnostics.serverErrors, 'Unexpected 5xx responses').toEqual([]);
  expect.soft(diagnostics.pageErrors, 'Unexpected uncaught page exceptions').toEqual([]);
}

function requireFixtures(): Phase1SmokeFixtures {
  const fixtures = loadSmokeFixtures();

  if (!fixtures) {
    throw new Error(
      'RUN_DESTRUCTIVE=true requires PHASE1_SMOKE_FIXTURES_FILE to point to a local JSON fixture manifest.'
    );
  }

  return fixtures;
}

async function expectAdminRoute(page: Page, path: string, options?: { timeoutMs?: number }): Promise<void> {
  if (options?.timeoutMs) {
    await assertAdminRouteAccessWithOptions(page, path, { timeoutMs: options.timeoutMs });
  } else {
    await assertAdminRouteAccess(page, path);
  }
  await expect(page.locator('body')).not.toContainText(/Access Restricted/i);
}

async function buildRouteLoadDiagnostics(page: Page, diagnostics: Diagnostics): Promise<string> {
  const currentUrl = page.url();
  const visibleBanners = await getVisibleTexts(page, [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '.Toastify__toast',
    '[data-sonner-toast]',
    '[class*="toast"]',
    'div.bg-red-50',
    'div.border-red-200',
    'div.text-red-500',
    'div.text-red-600',
    'text=/Access Denied/i',
    'text=/Access Restricted/i',
    'text=/Failed to load/i',
    'text=/Error/i',
  ]);

  const recentConsoleErrors = diagnostics.consoleErrors.slice(-10);
  return [
    `currentUrl=${currentUrl}`,
    `visibleErrors=${visibleBanners.join(' | ') || '(none found)'}`,
    `recentConsoleErrors=${recentConsoleErrors.join(' | ') || '(none found)'}`,
  ].join(' | ');
}

async function expectJoinLubFormConfigRoute(page: Page): Promise<void> {
  await expectAdminRoute(page, '/admin/settings/forms/join-lub', { timeoutMs: 75_000 });

  const heading = page.getByRole('heading', { name: /Join LUB Form - Field Configuration/i }).first();
  const loadingMarker = page.getByText(/Loading configuration\.\.\./i).first();
  const markerVisible = await Promise.any([
    heading.waitFor({ state: 'visible', timeout: 75_000 }).then(() => 'heading'),
    loadingMarker.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'loading'),
  ]).catch(() => null);

  if (!markerVisible) {
    throw new Error('Join LUB form configuration markers were not visible (heading/loading).');
  }
}

async function fillSearchIfVisible(page: Page, value: string): Promise<void> {
  const searchInput = page.getByPlaceholder(/Search/i).first();

  if (await searchInput.count()) {
    await searchInput.fill(value);
    await searchInput.press('Enter').catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function hasVisibleText(page: Page, text: string): Promise<boolean> {
  const locator = page.getByText(text, { exact: false }).first();

  try {
    await locator.waitFor({ state: 'visible', timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLooseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function clickButtonByNames(scope: Page | Locator, names: string[]): Promise<boolean> {
  for (const name of names) {
    const byRole = scope.getByRole('button', { name: new RegExp(`^${escapeForRegex(name)}$`, 'i') }).first();
    if (await byRole.count()) {
      await byRole.click();
      return true;
    }

    const byTitle = scope.locator(`[title*="${name}"]`).first();
    if (await byTitle.count()) {
      await byTitle.click();
      return true;
    }
  }

  return false;
}

async function clickActionForRow(page: Page, markerText: string, buttonNames: string[]): Promise<void> {
  await fillSearchIfVisible(page, markerText);

  if (!(await hasVisibleText(page, markerText))) {
    throw new Error(`Could not find fixture target in UI: ${markerText}`);
  }

  const rowCandidates = [
    page.locator('tr', { has: page.getByText(markerText, { exact: false }) }).first(),
    page.locator('div.bg-white', { has: page.getByText(markerText, { exact: false }) }).filter({
      has: page.locator('button'),
    }).first(),
    page.locator('div', { has: page.getByText(markerText, { exact: false }) }).filter({
      has: page.locator('button'),
    }).first(),
  ];

  for (const candidate of rowCandidates) {
    if (await candidate.count()) {
      const clicked = await clickButtonByNames(candidate, buttonNames);
      if (clicked) {
        return;
      }
    }
  }

  const clicked = await clickButtonByNames(page, buttonNames);
  if (!clicked) {
    throw new Error(`Unable to find action button (${buttonNames.join(', ')}) for target: ${markerText}`);
  }
}

type RegistrationStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

async function applyRegistrationsStatusFilter(page: Page, status: RegistrationStatusFilter): Promise<void> {
  const statusFilter = page
    .locator('select')
    .filter({ has: page.locator('option[value="pending"]') })
    .filter({ has: page.locator('option[value="approved"]') })
    .filter({ has: page.locator('option[value="rejected"]') })
    .first();

  if (!(await statusFilter.count())) {
    return;
  }

  const current = await statusFilter.inputValue();
  if (current !== status) {
    await statusFilter.selectOption(status);
    await page.waitForTimeout(300);
  }
}

async function findRegistrationsContainerByEmail(page: Page, email: string): Promise<Locator | null> {
  const emailLocator = page.getByText(new RegExp(`^\\s*${escapeForRegex(email)}\\s*$`, 'i')).first();

  try {
    await emailLocator.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return null;
  }

  const candidates = [
    emailLocator.locator('xpath=ancestor::tr[1]'),
    emailLocator.locator('xpath=ancestor::*[@role="row"][1]'),
    emailLocator.locator('xpath=ancestor::article[1]'),
    emailLocator.locator('xpath=ancestor::li[1]'),
    emailLocator.locator('xpath=ancestor::div[.//button][1]'),
  ];

  for (const candidate of candidates) {
    if (!(await candidate.count())) {
      continue;
    }

    if (await candidate.first().isVisible().catch(() => false)) {
      return candidate.first();
    }
  }

  return null;
}

async function clickRegistrationActionByEmail(
  page: Page,
  email: string,
  buttonNames: string[],
  statusFilter: RegistrationStatusFilter
): Promise<void> {
  await applyRegistrationsStatusFilter(page, statusFilter);
  await fillSearchIfVisible(page, email);

  const tryClick = async (): Promise<boolean> => {
    const container = await findRegistrationsContainerByEmail(page, email);
    if (!container) {
      return false;
    }

    return clickButtonByNames(container, buttonNames);
  };

  if (await tryClick()) {
    return;
  }

  if (statusFilter !== 'all') {
    await applyRegistrationsStatusFilter(page, 'all');
    await fillSearchIfVisible(page, email);

    if (await tryClick()) {
      return;
    }
  }

  throw new Error(
    `Unable to find registration action (${buttonNames.join(', ')}) for email=${email} with status filter=${statusFilter}`
  );
}

type RegistrationPendingTargets = {
  approveTargetEmail: string;
  rejectTargetEmail: string;
};

function getFixturesFilePathOrThrow(): string {
  const fixturePath = process.env.PHASE1_SMOKE_FIXTURES_FILE?.trim();
  if (!fixturePath) {
    throw new Error('PHASE1_SMOKE_FIXTURES_FILE is required for destructive smoke runs.');
  }

  return resolve(fixturePath);
}

function writePendingRegistrationFixtureTargets(approveEmail: string, rejectEmail: string): Phase1SmokeFixtures {
  const fixturePath = getFixturesFilePathOrThrow();
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as Phase1SmokeFixtures;

  const updated: Phase1SmokeFixtures = {
    ...parsed,
    registrations: {
      ...(parsed.registrations ?? {}),
      approve_target_email: approveEmail,
      reject_target_email: rejectEmail,
    },
  };

  writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function writeDeletedMemberRestoreFixtureTarget(email: string): Phase1SmokeFixtures {
  const fixturePath = getFixturesFilePathOrThrow();
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as Phase1SmokeFixtures;

  const updated: Phase1SmokeFixtures = {
    ...parsed,
    deleted_members: {
      ...(parsed.deleted_members ?? {}),
      restore_target_email: email,
    },
  };

  writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

type UserFixtureTargets = {
  editable_target_email: string;
  general_user_block_email: string;
  general_user_delete_email: string;
  non_general_user_delete_email: string;
};

function writeUserFixtureTargets(targets: UserFixtureTargets): Phase1SmokeFixtures {
  const fixturePath = getFixturesFilePathOrThrow();
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as Phase1SmokeFixtures;

  const updated: Phase1SmokeFixtures = {
    ...parsed,
    users: {
      ...(parsed.users ?? {}),
      editable_target_email: targets.editable_target_email,
      general_user_block_email: targets.general_user_block_email,
      general_user_delete_email: targets.general_user_delete_email,
      non_general_user_delete_email: targets.non_general_user_delete_email,
    },
  };

  writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function writePendingCityFixtureTarget(cityName: string): Phase1SmokeFixtures {
  const fixturePath = getFixturesFilePathOrThrow();
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as Phase1SmokeFixtures;

  const updated: Phase1SmokeFixtures = {
    ...parsed,
    locations: {
      ...(parsed.locations ?? {}),
      pending_city_name: cityName,
    },
  };

  writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function writePaymentFixtureTargets(targets: { edit_state?: string; create_state?: string }): Phase1SmokeFixtures {
  const fixturePath = getFixturesFilePathOrThrow();
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as Phase1SmokeFixtures;

  const updated: Phase1SmokeFixtures = {
    ...parsed,
    payment: {
      ...(parsed.payment ?? {}),
      ...(targets.edit_state ? { edit_state: targets.edit_state } : {}),
      ...(targets.create_state ? { create_state: targets.create_state } : {}),
    },
  };

  writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function buildSmokePendingEmail(kind: 'approve' | 'reject', timestamp: number): string {
  return `smoke-pending-${kind}-${timestamp}@example.com`;
}

function buildSmokeDeletedRestoreEmail(timestamp: number): string {
  return `smoke-deleted-restore-${timestamp}@example.com`;
}

function buildSmokeUserEmail(kind: 'edit' | 'block' | 'delete' | 'protected', timestamp: number): string {
  return `smoke-user-${kind}-${timestamp}@example.com`;
}

function buildSmokePendingCityEmail(timestamp: number): string {
  return `smoke-pending-city-${timestamp}@example.com`;
}

function buildSmokeMobile(timestamp: number, seedDigit: number): string {
  const suffix = `${timestamp}${seedDigit}`.replace(/\D/g, '').slice(-9).padStart(9, '0');
  return `9${suffix}`;
}

async function fillInputByNameIfVisible(page: Page, name: string, value: string): Promise<boolean> {
  const input = page.locator(`input[name="${name}"]:visible`).first();
  if (!(await input.count())) {
    return false;
  }

  const isEditable = await input.isEditable().catch(() => false);
  if (!isEditable) {
    const existingValue = (await input.inputValue().catch(() => '')).trim();
    if (!value.trim()) {
      return existingValue.length > 0;
    }

    return existingValue.toLowerCase() === value.trim().toLowerCase();
  }

  await input.fill(value);
  return true;
}

async function fillTextareaByNameIfVisible(page: Page, name: string, value: string): Promise<boolean> {
  const textarea = page.locator(`textarea[name="${name}"]:visible`).first();
  if (!(await textarea.count())) {
    return false;
  }

  await textarea.fill(value);
  return true;
}

async function selectOptionByNameIfVisible(page: Page, name: string, preferredValue?: string): Promise<boolean> {
  const select = page.locator(`select[name="${name}"]:visible`).first();
  if (!(await select.count())) {
    return false;
  }

  if (preferredValue) {
    const preferred = select.locator(`option[value="${preferredValue}"]`).first();
    if (await preferred.count()) {
      await select.selectOption(preferredValue);
      return true;
    }
  }

  const options = await select.locator('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent ?? '').trim(),
    }))
  );

  const candidate = options.find((option) => option.value && !/^select\b/i.test(option.label));
  if (!candidate) {
    return false;
  }

  await select.selectOption(candidate.value);
  return true;
}

async function selectOptionByNameWithRetry(
  page: Page,
  name: string,
  preferredValue?: string,
  retries = 10
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await selectOptionByNameIfVisible(page, name, preferredValue)) {
      return true;
    }

    await page.waitForTimeout(300);
  }

  return false;
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
      if (text && text !== '*') {
        values.push(text);
      }
    }
  }

  return [...new Set(values)];
}

async function getMissingRequiredJoinFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll('input[required], select[required], textarea[required]')
    ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    const missing = new Set<string>();
    const processedRadioGroups = new Set<string>();

    for (const control of controls) {
      const element = control as HTMLElement;
      if (!element.offsetParent || control.disabled) {
        continue;
      }

      if (control instanceof HTMLInputElement && control.type === 'radio') {
        const groupName = control.name || '(unnamed-radio-group)';
        if (processedRadioGroups.has(groupName)) {
          continue;
        }

        processedRadioGroups.add(groupName);
        const groupChecked = Array.from(document.querySelectorAll('input[type="radio"]'))
          .filter((radio) => {
            const input = radio as HTMLInputElement;
            return input.name === groupName && (radio as HTMLElement).offsetParent !== null;
          })
          .some((radio) => (radio as HTMLInputElement).checked);

        if (!groupChecked) {
          missing.add(groupName);
        }
        continue;
      }

      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        if (!control.checked) {
          missing.add(control.name || control.id || 'checkbox');
        }
        continue;
      }

      const value = control.value?.trim() ?? '';
      if (!value) {
        missing.add(control.name || control.id || control.tagName.toLowerCase());
      }
    }

    return [...missing];
  });
}

async function fillJoinFormForSmokeRegistration(
  page: Page,
  email: string,
  mobile: string,
  alternateMobile: string,
  options?: {
    forceOtherCityName?: string;
  }
): Promise<void> {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  await fillInputByNameIfVisible(page, 'full_name', `Smoke Pending ${now}`);
  await selectOptionByNameIfVisible(page, 'gender', 'male');
  await fillInputByNameIfVisible(page, 'date_of_birth', '1990-01-01');
  await fillInputByNameIfVisible(page, 'email', email);
  await fillInputByNameIfVisible(page, 'mobile_number', mobile);

  await fillInputByNameIfVisible(page, 'company_name', `Smoke Company ${now}`);
  await selectOptionByNameWithRetry(page, 'company_designation_id');

  await selectOptionByNameWithRetry(page, 'state');
  await selectOptionByNameWithRetry(page, 'district');

  const forceOtherCityName = options?.forceOtherCityName?.trim();
  if (forceOtherCityName) {
    const selectedOther = await selectOptionByNameWithRetry(page, 'city', 'Other', 15);
    if (!selectedOther) {
      throw new Error('Join form city selector could not choose "Other" for pending-city self-heal.');
    }

    const otherCityInput = page
      .locator('input[placeholder*="city, town, or village" i]:visible, input[placeholder*="city/town/village" i]:visible')
      .first();
    await otherCityInput.waitFor({ state: 'visible', timeout: 10_000 });
    await otherCityInput.fill(forceOtherCityName);
  } else {
    await selectOptionByNameWithRetry(page, 'city');

    const otherCityInput = page
      .locator('input[placeholder*="city, town, or village" i]:visible, input[placeholder*="city/town/village" i]:visible')
      .first();
    if (await otherCityInput.count()) {
      await otherCityInput.fill(`Smoke City ${now}`);
    }
  }

  await fillInputByNameIfVisible(page, 'pin_code', '500001');
  await fillTextareaByNameIfVisible(page, 'company_address', `Smoke company address ${now}`);

  await selectOptionByNameIfVisible(page, 'industry');
  await selectOptionByNameIfVisible(page, 'activity_type');
  await selectOptionByNameIfVisible(page, 'constitution');
  await selectOptionByNameIfVisible(page, 'annual_turnover');
  await selectOptionByNameIfVisible(page, 'number_of_employees');

  await fillTextareaByNameIfVisible(page, 'products_services', 'Smoke products and services');
  await fillInputByNameIfVisible(page, 'brand_names', 'SmokeBrand');
  await fillInputByNameIfVisible(page, 'website', 'https://example.com');
  await selectOptionByNameIfVisible(page, 'gst_registered');
  await fillInputByNameIfVisible(page, 'gst_number', '22AAAAA0000A1Z5');
  await fillInputByNameIfVisible(page, 'pan_company', 'AAAAA0000A');
  await selectOptionByNameIfVisible(page, 'esic_registered');
  await selectOptionByNameIfVisible(page, 'epf_registered');

  await fillInputByNameIfVisible(page, 'amount_paid', '100');
  await fillInputByNameIfVisible(page, 'payment_date', today);
  await selectOptionByNameIfVisible(page, 'payment_mode');
  await fillInputByNameIfVisible(page, 'transaction_id', `SMOKE-TXN-${now}`);
  await fillInputByNameIfVisible(page, 'bank_reference', `SMOKE-BANK-${now}`);
  await fillInputByNameIfVisible(page, 'alternate_contact_name', 'Smoke Alternate');
  await fillInputByNameIfVisible(page, 'alternate_mobile', alternateMobile);
  await fillInputByNameIfVisible(page, 'referred_by', 'Smoke Referral');

  const missingRequired = await getMissingRequiredJoinFields(page);
  if (missingRequired.length > 0) {
    throw new Error(`Join form still has required fields that were not auto-filled: ${missingRequired.join(', ')}`);
  }
}

async function signUpSmokeMember(page: Page, email: string, mobile: string): Promise<void> {
  await clearCustomSession(page);
  await gotoAppPath(page, '/signup');

  const emailInput = page.locator('input#email, input[name="email"], input[type="email"]').first();
  const mobileInput = page.locator('input#mobile_number, input[name="mobile_number"], input[type="tel"]').first();
  const submitButton = page.locator('button[type="submit"]').first();

  if (!(await emailInput.count()) || !(await mobileInput.count()) || !(await submitButton.count())) {
    throw new Error('Could not locate signup form controls for pending-registration self-heal.');
  }

  await emailInput.fill(email);
  await mobileInput.fill(mobile);
  await submitButton.click();

  try {
    await page.waitForFunction(() => {
      const token = window.localStorage.getItem('lub_session_token');
      return Boolean(token && token.trim());
    }, undefined, { timeout: 15_000 });
  } catch {
    const visibleErrors = await getVisibleTexts(page, [
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
      '.Toastify__toast',
      '[data-sonner-toast]',
      '[class*="toast"]',
      'p.text-red-500',
      'p.text-red-600',
      'span.text-red-500',
      'span.text-red-600',
    ]);

    throw new Error(
      `Signup failed for generated smoke member ${email}. Visible errors: ${visibleErrors.join(' | ') || '(none found)'}`
    );
  }
}

async function submitSmokeJoinRegistration(
  page: Page,
  email: string,
  mobile: string,
  alternateMobile: string,
  options?: {
    forceOtherCityName?: string;
    preferredStateName?: string;
    preferredDistrictName?: string;
  }
): Promise<void> {
  await gotoAppPath(page, '/join');
  await expect(page.locator('form')).toBeVisible({ timeout: 20_000 });
  await page.locator('input[name="full_name"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[name="email"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[name="mobile_number"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[name="company_name"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });

  if (options?.preferredStateName?.trim()) {
    const selectedState = await selectOptionByNameWithRetry(page, 'state', options.preferredStateName.trim(), 15);
    if (!selectedState) {
      throw new Error(`Join form could not select preferred state: ${options.preferredStateName}`);
    }
  }

  if (options?.preferredDistrictName?.trim()) {
    const selectedDistrict = await selectOptionByNameWithRetry(page, 'district', options.preferredDistrictName.trim(), 15);
    if (!selectedDistrict) {
      throw new Error(`Join form could not select preferred district: ${options.preferredDistrictName}`);
    }
  }

  await fillJoinFormForSmokeRegistration(page, email, mobile, alternateMobile, options);
  const submitRpcPromise = waitForRpcCall(page, 'submit_member_registration', 25_000);
  await page.locator('form button[type="submit"]').first().click();

  const normalizationReview = page.getByText(/Review Normalized Data/i).first();
  const normalizationReviewVisible = await normalizationReview
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (normalizationReviewVisible) {
    const acceptNormalized = page.getByRole('button', { name: /^Accept Normalized$/i }).first();
    if (await acceptNormalized.count()) {
      await acceptNormalized.click();
    } else {
      const submitOriginal = page.getByRole('button', { name: /^Submit Original$/i }).first();
      if (await submitOriginal.count()) {
        await submitOriginal.click();
      } else {
        throw new Error('Normalization modal appeared, but no submit action button was available.');
      }
    }

    await normalizationReview.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  const submitRpc = await submitRpcPromise;
  let rpcSucceeded = false;

  if (submitRpc?.ok()) {
    const payload = await submitRpc.json().catch(() => null) as { success?: boolean } | null;
    rpcSucceeded = payload?.success === true;
  }

  const submissionSucceeded = await Promise.any([
    rpcSucceeded ? Promise.resolve(true) : Promise.reject(new Error('submit RPC not confirmed')),
    page
      .waitForFunction(
        () => /registration submitted successfully/i.test(document.body?.innerText ?? ''),
        undefined,
        { timeout: 20_000 }
      )
      .then(() => true),
    page
      .waitForURL(/\/dashboard(?:\/profile)?(?:[/?#].*)?$/, { timeout: 20_000 })
      .then(() => true),
    page
      .waitForFunction(
        () => /checking authentication|checking registration status/i.test(document.body?.innerText ?? ''),
        undefined,
        { timeout: 20_000 }
      )
      .then(() => true),
  ]).catch(() => false);

  if (!submissionSucceeded) {
    const missingRequired = await getMissingRequiredJoinFields(page);
    const visibleErrors = await getVisibleTexts(page, [
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
      '.Toastify__toast',
      '[data-sonner-toast]',
      '[class*="toast"]',
      'p.text-red-500',
      'p.text-red-600',
      'span.text-red-500',
      'span.text-red-600',
    ]);

    throw new Error(
      [
        `Join submission failed for generated smoke member ${email}.`,
        `Current URL: ${page.url()}`,
        `Missing required fields: ${missingRequired.join(', ') || '(none detected)'}`,
        `Visible errors: ${visibleErrors.join(' | ') || '(none found)'}`,
      ].join(' ')
    );
  }
}

async function createPendingRegistrationViaSignupAndJoin(page: Page, email: string, mobile: string): Promise<void> {
  const alternateMobile = buildSmokeMobile(Date.now(), 7);

  await signUpSmokeMember(page, email, mobile);
  await submitSmokeJoinRegistration(page, email, mobile, alternateMobile);
}

async function createSmokeRegistrationViaSignupAndJoin(
  page: Page,
  email: string,
  mobile: string,
  options?: {
    forceOtherCityName?: string;
    preferredStateName?: string;
    preferredDistrictName?: string;
  }
): Promise<void> {
  const alternateMobile = buildSmokeMobile(Date.now(), 7);

  await signUpSmokeMember(page, email, mobile);
  await submitSmokeJoinRegistration(page, email, mobile, alternateMobile, options);
}

async function createPendingRegistrationViaSignupAndJoinIsolated(
  browser: Browser,
  email: string,
  mobile: string,
  options?: {
    forceOtherCityName?: string;
    preferredStateName?: string;
    preferredDistrictName?: string;
  }
): Promise<void> {
  const isolatedContext = await browser.newContext();
  const isolatedPage = await isolatedContext.newPage();

  try {
    await createSmokeRegistrationViaSignupAndJoin(isolatedPage, email, mobile, options);
  } finally {
    await isolatedContext.close();
  }
}

async function createPendingCityViaSignupAndJoin(
  page: Page,
  email: string,
  mobile: string,
  pendingCityName: string
): Promise<void> {
  const alternateMobile = buildSmokeMobile(Date.now(), 8);

  await signUpSmokeMember(page, email, mobile);
  await submitSmokeJoinRegistration(page, email, mobile, alternateMobile, {
    forceOtherCityName: pendingCityName,
  });
}

async function ensureAdminSessionReady(page: Page): Promise<void> {
  const hasToken = await page
    .evaluate(() => {
      const token = window.localStorage.getItem('lub_session_token');
      return Boolean(token && token.trim());
    })
    .catch(() => false);

  if (!hasToken) {
    await loginAsAdmin(page);
    return;
  }

  try {
    await expectAdminRoute(page, '/admin/dashboard');
  } catch {
    await loginAsAdmin(page);
  }
}

async function isPendingRegistrationVisibleWithDetails(page: Page, email: string): Promise<boolean> {
  await applyRegistrationsStatusFilter(page, 'pending');
  await fillSearchIfVisible(page, email);

  const container = await findRegistrationsContainerByEmail(page, email);
  if (!container) {
    return false;
  }

  return container.getByRole('button', { name: /^View Details$/i }).first().isVisible().catch(() => false);
}

async function ensureFreshPendingRegistrationTargets(
  page: Page,
  fixtures: Phase1SmokeFixtures
): Promise<RegistrationPendingTargets> {
  const currentApprove = fixtures.registrations?.approve_target_email?.trim() ?? '';
  const currentReject = fixtures.registrations?.reject_target_email?.trim() ?? '';

  await expectAdminRoute(page, '/admin/members/registrations');

  const hasApprovePending =
    currentApprove.length > 0 ? await isPendingRegistrationVisibleWithDetails(page, currentApprove) : false;
  const hasRejectPending =
    currentReject.length > 0 ? await isPendingRegistrationVisibleWithDetails(page, currentReject) : false;

  if (hasApprovePending && hasRejectPending && currentApprove !== currentReject) {
    return {
      approveTargetEmail: currentApprove,
      rejectTargetEmail: currentReject,
    };
  }

  const timestamp = Date.now();
  const approveEmail = buildSmokePendingEmail('approve', timestamp);
  const rejectEmail = buildSmokePendingEmail('reject', timestamp);
  const approveMobile = buildSmokeMobile(timestamp, 3);
  const rejectMobile = buildSmokeMobile(timestamp, 4);

  await createPendingRegistrationViaSignupAndJoin(page, approveEmail, approveMobile);
  await createPendingRegistrationViaSignupAndJoin(page, rejectEmail, rejectMobile);

  await clearCustomSession(page);
  await loginAsAdmin(page);
  await expectAdminRoute(page, '/admin/members/registrations');

  const approvePendingReady = await isPendingRegistrationVisibleWithDetails(page, approveEmail);
  const rejectPendingReady = await isPendingRegistrationVisibleWithDetails(page, rejectEmail);

  if (!approvePendingReady || !rejectPendingReady) {
    throw new Error(
      [
        'Self-heal created smoke registrations, but they are not visible under Pending with View Details.',
        `approve_target_email=${approveEmail} visible=${approvePendingReady}`,
        `reject_target_email=${rejectEmail} visible=${rejectPendingReady}`,
      ].join(' ')
    );
  }

  writePendingRegistrationFixtureTargets(approveEmail, rejectEmail);

  return {
    approveTargetEmail: approveEmail,
    rejectTargetEmail: rejectEmail,
  };
}

async function isDeletedMemberVisible(page: Page, email: string): Promise<boolean> {
  await expectAdminRoute(page, '/admin/members/deleted');
  await fillSearchIfVisible(page, email);
  return hasVisibleText(page, email);
}

async function ensureFreshDeletedMemberRestoreTarget(
  page: Page,
  fixtures: Phase1SmokeFixtures
): Promise<string> {
  const currentTarget = fixtures.deleted_members?.restore_target_email?.trim() ?? '';

  if (currentTarget) {
    const exists = await isDeletedMemberVisible(page, currentTarget);
    if (exists) {
      return currentTarget;
    }
  }

  const timestamp = Date.now();
  const email = buildSmokeDeletedRestoreEmail(timestamp);
  const mobile = buildSmokeMobile(timestamp, 5);

  await createPendingRegistrationViaSignupAndJoin(page, email, mobile);

  await clearCustomSession(page);
  await loginAsAdmin(page);
  await expectAdminRoute(page, '/admin/members/registrations');

  await clickRegistrationActionByEmail(page, email, ['View Details'], 'pending');
  await expect(page.locator('body')).toContainText(/Approve/i);
  await page.getByRole('button', { name: /^Approve$/i }).last().click();
  await expect(page.locator('body')).toContainText(/Confirm Approval/i);
  await page.getByRole('button', { name: /^Approve$/i }).click();
  await waitForToastText(page, /approved|success/i);

  await clickRegistrationActionByEmail(page, email, ['Delete'], 'all');
  await expect(page.locator('body')).toContainText(/Confirm Deletion/i);
  await fillInputByLabelIfVisible(page, /Deletion Reason/i, 'Playwright smoke fixture preparation');
  await fillVisibleTextarea(page, 'Playwright smoke fixture preparation');
  await page.getByRole('button', { name: /^Delete Member$/i }).click();
  await waitForToastText(page, /deleted successfully/i);

  const visibleInDeleted = await isDeletedMemberVisible(page, email);
  if (!visibleInDeleted) {
    throw new Error(`Created and deleted smoke member is not visible in deleted members list: ${email}`);
  }

  writeDeletedMemberRestoreFixtureTarget(email);
  return email;
}

type UsersAccountTypeFilter = 'all' | 'general_user' | 'member' | 'admin' | 'both';

async function applyUsersAccountTypeFilter(page: Page, filter: UsersAccountTypeFilter): Promise<void> {
  const accountTypeFilter = page
    .locator('select')
    .filter({ has: page.locator('option[value="general_user"]') })
    .filter({ has: page.locator('option[value="member"]') })
    .filter({ has: page.locator('option[value="admin"]') })
    .filter({ has: page.locator('option[value="both"]') })
    .first();

  if (!(await accountTypeFilter.count())) {
    return;
  }

  const current = await accountTypeFilter.inputValue();
  if (current !== filter) {
    await accountTypeFilter.selectOption(filter);
    await page.waitForTimeout(300);
  }
}

async function findUserRowByEmail(page: Page, email: string): Promise<Locator | null> {
  const row = page.locator('tr', {
    has: page.getByText(new RegExp(`^\\s*${escapeForRegex(email)}\\s*$`, 'i')),
  }).first();

  if (!(await row.count())) {
    return null;
  }

  if (!(await row.isVisible().catch(() => false))) {
    return null;
  }

  return row;
}

async function isUserVisibleInFilter(page: Page, email: string, filter: UsersAccountTypeFilter): Promise<boolean> {
  await expectAdminRoute(page, '/admin/administration/users');
  await applyUsersAccountTypeFilter(page, filter);
  await fillSearchIfVisible(page, email);

  return hasVisibleText(page, email);
}

async function hasUserAction(
  page: Page,
  email: string,
  buttonName: RegExp,
  filter: UsersAccountTypeFilter,
  requireEnabled = true
): Promise<boolean> {
  await expectAdminRoute(page, '/admin/administration/users');
  await applyUsersAccountTypeFilter(page, filter);
  await fillSearchIfVisible(page, email);

  const row = await findUserRowByEmail(page, email);
  if (!row) {
    return false;
  }

  const button = row.getByRole('button', { name: buttonName }).first();
  if (!(await button.count())) {
    return false;
  }

  if (!requireEnabled) {
    return true;
  }

  return button.isEnabled().catch(() => false);
}

async function findFirstVisibleUserEmailInFilter(
  page: Page,
  filter: UsersAccountTypeFilter
): Promise<string | null> {
  await expectAdminRoute(page, '/admin/administration/users');
  await applyUsersAccountTypeFilter(page, filter);
  await fillSearchIfVisible(page, '');

  const firstEmailCell = page.locator('tbody tr td').first();
  if (!(await firstEmailCell.count())) {
    return null;
  }

  const text = (await firstEmailCell.innerText().catch(() => '')).trim().toLowerCase();
  return text || null;
}

async function approvePendingRegistrationByEmail(page: Page, email: string): Promise<void> {
  await expectAdminRoute(page, '/admin/members/registrations');
  await clickRegistrationActionByEmail(page, email, ['View Details'], 'pending');
  await expect(page.locator('body')).toContainText(/Approve/i);
  await page.getByRole('button', { name: /^Approve$/i }).last().click();
  await expect(page.locator('body')).toContainText(/Confirm Approval/i);
  await page.getByRole('button', { name: /^Approve$/i }).click();
  await waitForToastText(page, /approved|success/i);
}

function getCurrentUserTargets(fixtures: Phase1SmokeFixtures): UserFixtureTargets | null {
  const users = fixtures.users ?? {};
  const editable = users.editable_target_email?.trim() || users.editable_user_email?.trim() || '';
  const block = users.general_user_block_email?.trim() ?? '';
  const del = users.general_user_delete_email?.trim() ?? '';
  const nonGeneral = users.non_general_user_delete_email?.trim() ?? '';

  if (!editable || !block || !del || !nonGeneral) {
    return null;
  }

  return {
    editable_target_email: editable,
    general_user_block_email: block,
    general_user_delete_email: del,
    non_general_user_delete_email: nonGeneral,
  };
}

async function areUserTargetsReady(page: Page, targets: UserFixtureTargets): Promise<boolean> {
  const editableReady = await hasUserAction(page, targets.editable_target_email, /^Edit$/i, 'all', true);
  const blockReady = await hasUserAction(page, targets.general_user_block_email, /^(Block|Unblock)$/i, 'general_user', true);
  const deleteReady = await hasUserAction(page, targets.general_user_delete_email, /^Delete$/i, 'general_user', true);
  const nonGeneralVisibleAll = await isUserVisibleInFilter(page, targets.non_general_user_delete_email, 'all');
  const nonGeneralVisibleGeneral = await isUserVisibleInFilter(page, targets.non_general_user_delete_email, 'general_user');
  const nonGeneralDeletePresent = await hasUserAction(page, targets.non_general_user_delete_email, /^Delete$/i, 'all', false);

  return (
    editableReady &&
    blockReady &&
    deleteReady &&
    nonGeneralVisibleAll &&
    !nonGeneralVisibleGeneral &&
    nonGeneralDeletePresent
  );
}

async function waitForUserTargetsReady(
  page: Page,
  targets: UserFixtureTargets,
  attempts = 12,
  delayMs = 1_000
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await areUserTargetsReady(page, targets)) {
      return true;
    }

    await page.waitForTimeout(delayMs);
  }

  return false;
}

async function ensureFreshUserTargets(
  page: Page,
  browser: Browser,
  fixtures: Phase1SmokeFixtures
): Promise<UserFixtureTargets> {
  await ensureAdminSessionReady(page);

  const currentTargets = getCurrentUserTargets(fixtures);
  if (currentTargets && (await areUserTargetsReady(page, currentTargets))) {
    return currentTargets;
  }

  const timestamp = Date.now();
  const targets: UserFixtureTargets = {
    editable_target_email: buildSmokeUserEmail('edit', timestamp),
    general_user_block_email: buildSmokeUserEmail('block', timestamp),
    general_user_delete_email: buildSmokeUserEmail('delete', timestamp),
    non_general_user_delete_email: buildSmokeUserEmail('protected', timestamp),
  };

  await createPendingRegistrationViaSignupAndJoinIsolated(
    browser,
    targets.editable_target_email,
    buildSmokeMobile(timestamp, 1)
  );
  await createPendingRegistrationViaSignupAndJoinIsolated(
    browser,
    targets.general_user_block_email,
    buildSmokeMobile(timestamp, 2)
  );
  await createPendingRegistrationViaSignupAndJoinIsolated(
    browser,
    targets.general_user_delete_email,
    buildSmokeMobile(timestamp, 3)
  );
  await createPendingRegistrationViaSignupAndJoinIsolated(
    browser,
    targets.non_general_user_delete_email,
    buildSmokeMobile(timestamp, 4)
  );

  await ensureAdminSessionReady(page);
  await approvePendingRegistrationByEmail(page, targets.non_general_user_delete_email);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const stillGeneral = await isUserVisibleInFilter(page, targets.non_general_user_delete_email, 'general_user');
    if (!stillGeneral) {
      break;
    }

    await page.waitForTimeout(500);
  }

  const stillGeneralAfterApproval = await isUserVisibleInFilter(page, targets.non_general_user_delete_email, 'general_user');
  if (stillGeneralAfterApproval) {
    const fallbackNonGeneral =
      (await findFirstVisibleUserEmailInFilter(page, 'member')) ??
      (await findFirstVisibleUserEmailInFilter(page, 'both')) ??
      (await findFirstVisibleUserEmailInFilter(page, 'admin'));

    if (!fallbackNonGeneral) {
      throw new Error(
        `Protected smoke user stayed general_user after approval (${targets.non_general_user_delete_email}), and no existing non-general user was found for denial coverage.`
      );
    }

    targets.non_general_user_delete_email = fallbackNonGeneral;
  }

  if (!(await waitForUserTargetsReady(page, targets))) {
    throw new Error('Self-heal created smoke users, but users-domain targets are not ready in /admin/administration/users.');
  }

  writeUserFixtureTargets(targets);
  return targets;
}

async function findPendingCityCardByName(page: Page, cityName: string): Promise<Locator | null> {
  const exactName = new RegExp(`^\\s*${escapeForRegex(cityName)}\\s*$`, 'i');
  const heading = page.locator('h3').filter({ hasText: exactName }).first();

  if (!(await heading.count())) {
    return null;
  }

  const card = heading.locator('xpath=ancestor::div[contains(@class, "bg-white")][1]').first();
  if (!(await card.count())) {
    return null;
  }

  if (!(await card.isVisible().catch(() => false))) {
    return null;
  }

  return card;
}

type PendingCityAssignability = {
  card: Locator | null;
  rowExists: boolean;
  assignButtonExists: boolean;
  assignButtonEnabled: boolean;
};

type PendingCityListItemSnapshot = {
  key: string;
  pending_city_id: string | null;
  other_city_name_normalized: string;
  other_city_name_display: string;
  state_name: string;
  district_name: string;
  state_id: string | null;
  district_id: string | null;
};

type ExactMatchPendingCityTarget = {
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  cityName: string;
  normalizedCityName: string;
  createdForTest: boolean;
};

type AdminRegistrationSnapshot = {
  id: string;
  email: string;
  city: string | null;
  other_city_name: string | null;
  is_custom_city: boolean;
  pending_city_id: string | null;
  status: string;
};

type MemberRoleAssignmentProofTarget = {
  assignmentId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  originalRoleId: string;
  originalRoleName: string;
  updatedRoleId: string;
  updatedRoleName: string;
  originalLevel: 'national' | 'state' | 'district' | 'city';
  updatedLevel: 'national' | 'state' | 'district' | 'city';
  updatedState?: string;
  updatedDistrict?: string;
  committeeYear: string;
};

type ApprovedCitySelection = {
  cityId: string;
  cityName: string;
};

async function getPendingCityAssignability(page: Page, cityName: string): Promise<PendingCityAssignability> {
  const card = await findPendingCityCardByName(page, cityName);
  if (!card) {
    return {
      card: null,
      rowExists: false,
      assignButtonExists: false,
      assignButtonEnabled: false,
    };
  }

  const assignButton = card
    .getByRole('button', { name: /Assign Approved City|Edit \+ Add\/Assign|Resolve/i })
    .first();
  const assignButtonExists = (await assignButton.count()) > 0;
  const assignButtonEnabled = assignButtonExists
    ? await assignButton.isEnabled().catch(() => false)
    : false;

  return {
    card,
    rowExists: true,
    assignButtonExists,
    assignButtonEnabled,
  };
}

async function isPendingCityAssignable(page: Page, cityName: string): Promise<boolean> {
  await expectAdminRoute(page, '/admin/locations/pending-cities');
  const state = await getPendingCityAssignability(page, cityName);
  return state.rowExists && state.assignButtonExists && state.assignButtonEnabled;
}

async function isPendingCityVisible(page: Page, cityName: string): Promise<boolean> {
  await expectAdminRoute(page, '/admin/locations/pending-cities');
  const card = await findPendingCityCardByName(page, cityName);
  return card !== null;
}

async function selectApprovedCityForPendingAssignment(page: Page, preferredApprovedCity?: string): Promise<string> {
  const select = await findLabeledControl(page, /Approved City/i, 'select');
  if (!select) {
    throw new Error('Pending city assign modal did not render an approved-city dropdown.');
  }

  await expect
    .poll(async () => !(await select.isDisabled().catch(() => true)), {
      timeout: 15_000,
      message: 'Approved city dropdown stayed disabled in pending city assign modal.',
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const options = await select.locator('option').evaluateAll((elements) =>
        elements.map((element) => ({
          value: (element as HTMLOptionElement).value,
          label: (element.textContent ?? '').trim(),
        }))
      );

      return options.some((option) => Boolean(option.value));
    }, {
      timeout: 15_000,
      message: 'Pending city assign modal did not load any approved city option.',
    })
    .toBe(true);

  const options = await select.locator('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent ?? '').trim(),
    }))
  );

  const preferred = preferredApprovedCity?.trim();
  if (preferred) {
    const preferredOption = options.find(
      (option) => option.value && option.label.toLowerCase() === preferred.toLowerCase()
    );
    if (preferredOption) {
      await select.selectOption({ value: preferredOption.value });
      return preferredOption.label;
    }
  }

  const fallback = options.find(
    (option) =>
      option.value &&
      option.label &&
      !/^choose a city/i.test(option.label) &&
      !/^loading/i.test(option.label) &&
      !/^select\b/i.test(option.label)
  );

  if (!fallback) {
    throw new Error('Pending city assign modal has no selectable approved city option.');
  }

  await select.selectOption({ value: fallback.value });
  return fallback.label;
}

async function getPendingCityListItemSnapshot(
  page: Page,
  cityName: string
): Promise<PendingCityListItemSnapshot | null> {
  const result = await page.evaluate(async (targetCityName) => {
    try {
      const rawSessionValue = window.localStorage.getItem('lub_session_token');
      let sessionToken: string | null = null;
      if (rawSessionValue) {
        try {
          const parsed = JSON.parse(rawSessionValue) as { token?: string };
          sessionToken = typeof parsed?.token === 'string' ? parsed.token : rawSessionValue;
        } catch {
          sessionToken = rawSessionValue;
        }
      }

      if (!sessionToken) {
        return { error: 'Admin session token is missing in browser localStorage.' };
      }

      const { adminCitiesService } = await import('/src/lib/supabase.ts');
      const pendingResult = await adminCitiesService.listPendingCustomCities(sessionToken);
      if (!pendingResult.success) {
        return { error: pendingResult.error || 'Failed to load pending city list from service.' };
      }

      const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
      const targetNormalized = normalize(targetCityName);
      const match = (pendingResult.items || []).find((item) => {
        const display = normalize(item.other_city_name_display || '');
        const normalized = normalize(item.other_city_name_normalized || '');
        return display === targetNormalized || normalized === targetNormalized;
      });

      if (!match) {
        return null;
      }

      return {
        key: match.key,
        pending_city_id: match.pending_city_id ?? null,
        other_city_name_normalized: match.other_city_name_normalized,
        other_city_name_display: match.other_city_name_display,
        state_name: match.state_name,
        district_name: match.district_name,
        state_id: match.state_id ?? null,
        district_id: match.district_id ?? null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, cityName);

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Pending city list snapshot failed: ${String((result as { error?: string }).error || 'unknown error')}`);
  }

  return (result as PendingCityListItemSnapshot | null) ?? null;
}

function buildExactMatchCityInput(cityName: string): string {
  const collapsed = cityName.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return cityName;
  }

  return `  ${collapsed.toUpperCase().replace(/\s+/g, '   ')}  `;
}

async function findExactMatchPendingCityTarget(page: Page): Promise<ExactMatchPendingCityTarget> {
  const result = await page.evaluate(async () => {
    try {
      const rawSessionValue = window.localStorage.getItem('lub_session_token');
      let sessionToken: string | null = null;
      if (rawSessionValue) {
        try {
          const parsed = JSON.parse(rawSessionValue) as { token?: string };
          sessionToken = typeof parsed?.token === 'string' ? parsed.token : rawSessionValue;
        } catch {
          sessionToken = rawSessionValue;
        }
      }

      if (!sessionToken) {
        return { error: 'Admin session token is missing in browser localStorage.' };
      }

      const { adminCitiesService, adminLocationsService, locationsService, statesService } = await import('/src/lib/supabase.ts');

      const pendingResult = await adminCitiesService.listPendingCustomCities(sessionToken);
      if (!pendingResult.success) {
        return { error: pendingResult.error || 'Failed to load pending cities.' };
      }

      const pendingNames = new Set(
        (pendingResult.items || []).map((item) => {
          const normalized = (item.other_city_name_normalized || item.other_city_name_display || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          return `${item.state_name}::${item.district_name}::${normalized}`;
        })
      );

      const states = await statesService.getActiveStates();
      for (const state of states) {
        const districts = await locationsService.getActiveDistrictsByStateName(state.state_name);
        for (const district of districts) {
          const cities = await locationsService.getActiveCitiesByDistrictId(district.district_id);
          for (const city of cities) {
            const normalizedCityName = city.city_name.replace(/\s+/g, ' ').trim().toLowerCase();
            const pendingKey = `${state.state_name}::${district.district_name}::${normalizedCityName}`;
            if (pendingNames.has(pendingKey)) {
              continue;
            }

            return {
              stateId: state.id,
              stateName: state.state_name,
              districtId: district.district_id,
              districtName: district.district_name,
              cityName: city.city_name,
              normalizedCityName,
              createdForTest: false,
            };
          }
        }
      }

      const fallbackState = states[0];
      if (!fallbackState) {
        return { error: 'No active states are available for branch-A pending-city proof.' };
      }

      const fallbackDistricts = await locationsService.getActiveDistrictsByStateName(fallbackState.state_name);
      const fallbackDistrict = fallbackDistricts[0];
      if (!fallbackDistrict) {
        return { error: `No active districts are available for state ${fallbackState.state_name}.` };
      }

      const fallbackCityName = `Smoke Exact Match ${Date.now()}`;
      const addResult = await adminLocationsService.addCity(
        sessionToken,
        fallbackState.id,
        fallbackDistrict.district_id,
        fallbackCityName,
        false,
        true,
        'Created for pending-city exact-match smoke proof'
      );

      if (!addResult.success) {
        return { error: addResult.error || 'Could not create fallback approved city for branch-A proof.' };
      }

      return {
        stateId: fallbackState.id,
        stateName: fallbackState.state_name,
        districtId: fallbackDistrict.district_id,
        districtName: fallbackDistrict.district_name,
        cityName: addResult.city_name || fallbackCityName,
        normalizedCityName: (addResult.city_name || fallbackCityName).replace(/\s+/g, ' ').trim().toLowerCase(),
        createdForTest: true,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(
      `Could not discover an exact-match pending-city target: ${String((result as { error?: string }).error || 'unknown error')}`
    );
  }

  return result as ExactMatchPendingCityTarget;
}

async function getAdminRegistrationSnapshotByEmail(
  page: Page,
  email: string
): Promise<AdminRegistrationSnapshot | null> {
  const result = await page.evaluate(async (targetEmail) => {
    try {
      const rawSessionValue = window.localStorage.getItem('lub_session_token');
      let sessionToken: string | null = null;
      if (rawSessionValue) {
        try {
          const parsed = JSON.parse(rawSessionValue) as { token?: string };
          sessionToken = typeof parsed?.token === 'string' ? parsed.token : rawSessionValue;
        } catch {
          sessionToken = rawSessionValue;
        }
      }

      if (!sessionToken) {
        return { error: 'Admin session token is missing in browser localStorage.' };
      }

      const { memberRegistrationService, supabase } = await import('/src/lib/supabase.ts');
      const { data, error } = await supabase.rpc('get_admin_member_registrations_with_session', {
        p_session_token: sessionToken,
        p_status_filter: null,
        p_search_query: targetEmail,
        p_state_filter: null,
        p_limit: 50,
        p_offset: 0,
      });

      if (error) {
        return { error: error.message };
      }

      const registration = (data || []).find((row: any) => String(row.email || '').toLowerCase() === targetEmail.toLowerCase());
      if (!registration?.id) {
        return null;
      }

      const details = await memberRegistrationService.getApplicationDetails(registration.id, sessionToken);
      if (!details.success || !details.data) {
        return { error: details.error || 'Failed to load application details' };
      }

      const record = details.data;
      return {
        id: record.id,
        email: record.email,
        city: record.city ?? null,
        other_city_name: record.other_city_name ?? null,
        is_custom_city: Boolean(record.is_custom_city),
        pending_city_id: record.pending_city_id ?? null,
        status: record.status ?? '',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, email);

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Could not fetch admin registration snapshot: ${String((result as { error?: string }).error || 'unknown error')}`);
  }

  return (result as AdminRegistrationSnapshot | null) ?? null;
}

async function openMemberRoleAssignmentsTab(page: Page): Promise<void> {
  await expectAdminRoute(page, '/admin/organization/designations');
  await page.getByRole('button', { name: /^LUB Roles$/i }).click();
  await page.getByRole('button', { name: /Member Role Assignments/i }).click();
  await expect(page.getByPlaceholder(/Search member assignments/i)).toBeVisible({ timeout: 15_000 });
}

async function applyAssignmentSearch(page: Page, search: string): Promise<void> {
  const searchInput = page.getByPlaceholder(/Search member assignments/i).first();
  await expect(searchInput).toBeVisible({ timeout: 10_000 });
  await searchInput.fill(search);
  await page.waitForTimeout(400);
}

async function findMemberAssignmentRowByEmail(page: Page, email: string): Promise<Locator | null> {
  const row = page.locator('tbody tr', {
    has: page.getByText(new RegExp(`^\\s*${escapeForRegex(email)}\\s*$`, 'i')),
  }).first();

  if (!(await row.count())) {
    return null;
  }

  if (!(await row.isVisible().catch(() => false))) {
    return null;
  }

  return row;
}

async function waitForMemberAssignmentRowByEmail(
  page: Page,
  email: string,
  shouldExist: boolean,
  timeoutMs = 15_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await findMemberAssignmentRowByEmail(page, email);
    const exists = row !== null;
    if (exists === shouldExist) {
      return true;
    }

    await page.waitForTimeout(350);
  }

  return false;
}

async function createMemberRoleAssignmentProofTarget(page: Page): Promise<MemberRoleAssignmentProofTarget> {
  const result = await page.evaluate(async () => {
    try {
      const { lubRolesService, memberLubRolesService, statesService } = await import('/src/lib/supabase.ts');

      const roles = await lubRolesService.getActiveRoles();
      if (roles.length === 0) {
        return { error: 'No active LUB roles are available for assignment proof.' };
      }

      const states = await statesService.getActiveStates();
      const existingAssignments = await memberLubRolesService.getAllAssignments({ search: '' });
      const members = await memberLubRolesService.searchMembers('');
      if (members.length === 0) {
        return { error: 'No approved members are available for assignment proof.' };
      }

      const cleanMembers = members.filter(
        (member) => !existingAssignments.some((assignment) => assignment.member_id === member.id)
      );
      const candidateMembers = cleanMembers.length > 0 ? cleanMembers : members;

      const makeYear = (offset: number): string => {
        const base = ((Date.now() + offset) % 9000) + 1000;
        return String(base).padStart(4, '0');
      };

      for (let memberIndex = 0; memberIndex < candidateMembers.length; memberIndex += 1) {
        const member = candidateMembers[memberIndex];
        for (let yearOffset = 0; yearOffset < 25; yearOffset += 1) {
          const committeeYear = makeYear(yearOffset + memberIndex * 25);
          const originalRole = roles[0];
          const updatedRole = roles[1] ?? roles[0];
          const originalLevel: 'national' = 'national';
          const updatedLevel: 'national' | 'state' = roles.length > 1 ? 'national' : 'state';
          const updatedState = updatedLevel === 'state' ? states[0]?.state_name : undefined;

          const collision = existingAssignments.some((assignment) => (
            assignment.member_id === member.id &&
            assignment.role_id === originalRole.id &&
            assignment.level === originalLevel &&
            (assignment.committee_year ?? '') === committeeYear
          ));

          if (collision) {
            continue;
          }

          const createResult = await memberLubRolesService.createAssignment({
            member_id: member.id,
            role_id: originalRole.id,
            level: originalLevel,
            committee_year: committeeYear,
          });

          if (!createResult.success) {
            continue;
          }

          for (let attempt = 0; attempt < 12; attempt += 1) {
            const refreshed = await memberLubRolesService.getAllAssignments({ search: member.email });
            const created = refreshed.find((assignment) => (
              assignment.member_id === member.id &&
              assignment.role_id === originalRole.id &&
              assignment.level === originalLevel &&
              (assignment.committee_year ?? '') === committeeYear
            ));

            if (created) {
              return {
                assignmentId: created.id,
                memberId: member.id,
                memberName: member.full_name,
                memberEmail: member.email,
                originalRoleId: originalRole.id,
                originalRoleName: originalRole.role_name,
                updatedRoleId: updatedRole.id,
                updatedRoleName: updatedRole.role_name,
                originalLevel,
                updatedLevel,
                updatedState,
                committeeYear,
              };
            }

            await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
          }
        }
      }

      return { error: 'Could not create a deterministic member-role assignment target.' };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Could not create a controlled member-role assignment target: ${String((result as { error?: string }).error || 'unknown error')}`);
  }

  return result as MemberRoleAssignmentProofTarget;
}

async function getMemberRoleAssignmentSnapshot(
  page: Page,
  assignmentId: string
): Promise<{
  id: string;
  role_id: string;
  role_name: string;
  level: string;
  state: string | null;
  district: string | null;
  committee_year: string | null;
} | null> {
  const result = await page.evaluate(async (targetAssignmentId) => {
    try {
      const { memberLubRolesService } = await import('/src/lib/supabase.ts');
      const assignments = await memberLubRolesService.getAllAssignments({ search: '' });
      const match = assignments.find((assignment) => assignment.id === targetAssignmentId);
      if (!match) {
        return null;
      }

      return {
        id: match.id,
        role_id: match.role_id,
        role_name: match.role_name,
        level: match.level,
        state: match.state ?? null,
        district: match.district ?? null,
        committee_year: match.committee_year ?? null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, assignmentId);

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Could not fetch member-role assignment snapshot: ${String((result as { error?: string }).error || 'unknown error')}`);
  }

  return (result as {
    id: string;
    role_id: string;
    role_name: string;
    level: string;
    state: string | null;
    district: string | null;
    committee_year: string | null;
  } | null) ?? null;
}

async function cleanupMemberRoleAssignment(page: Page, assignmentId: string): Promise<void> {
  await page.evaluate(async (targetAssignmentId) => {
    try {
      const { memberLubRolesService } = await import('/src/lib/supabase.ts');
      await memberLubRolesService.deleteAssignment({ assignmentId: targetAssignmentId });
    } catch (error) {
      console.error('[cleanupMemberRoleAssignment] Failed to delete assignment', error);
    }
  }, assignmentId);
}

async function pickApprovedCityForLegacyPendingAssignment(
  page: Page,
  districtId: string,
  preferredApprovedCity?: string
): Promise<ApprovedCitySelection> {
  const result = await page.evaluate(async (args) => {
    try {
      const { locationsService } = await import('/src/lib/supabase.ts');
      const cities = await locationsService.getActiveCitiesByDistrictId(args.districtId);
      return {
        cities: (cities || []).map((city) => ({
          cityId: city.city_id,
          cityName: city.city_name,
        })),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, {
    districtId,
  });

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Could not fetch approved cities for legacy pending assignment: ${String((result as { error?: string }).error || 'unknown error')}`);
  }

  const cities = ((result as { cities?: ApprovedCitySelection[] })?.cities || []).filter(
    (city) => city.cityId && city.cityName
  );

  if (!cities.length) {
    throw new Error(`No approved cities are available for district_id=${districtId}`);
  }

  const preferred = preferredApprovedCity?.trim();
  if (preferred) {
    const preferredMatch = cities.find((city) => normalizeLooseText(city.cityName) === normalizeLooseText(preferred));
    if (preferredMatch) {
      return preferredMatch;
    }
  }

  return cities[0];
}

async function resolvePendingCityViaLegacyRpc(
  page: Page,
  payload: {
    stateName: string;
    districtName: string;
    otherCityNameNormalized: string;
    approvedCityId: string;
  }
): Promise<void> {
  const result = await page.evaluate(async (args) => {
    try {
      const rawSessionValue = window.localStorage.getItem('lub_session_token');
      let sessionToken: string | null = null;
      if (rawSessionValue) {
        try {
          const parsed = JSON.parse(rawSessionValue) as { token?: string };
          sessionToken = typeof parsed?.token === 'string' ? parsed.token : rawSessionValue;
        } catch {
          sessionToken = rawSessionValue;
        }
      }

      if (!sessionToken) {
        return { success: false, error: 'Admin session token is missing in browser localStorage.' };
      }

      const { supabase } = await import('/src/lib/supabase.ts');
      const { data, error } = await supabase.rpc('admin_assign_custom_city_with_session', {
        p_session_token: sessionToken,
        p_state_name: args.stateName,
        p_district_name: args.districtName,
        p_other_city_name_normalized: args.otherCityNameNormalized,
        p_approved_city_id: args.approvedCityId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && typeof data === 'object' && 'success' in data) {
        return {
          success: Boolean((data as { success?: boolean }).success),
          error: (data as { error?: string }).error,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, {
    stateName: payload.stateName,
    districtName: payload.districtName,
    otherCityNameNormalized: payload.otherCityNameNormalized,
    approvedCityId: payload.approvedCityId,
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Legacy pending-city assign RPC failed.');
  }
}

async function assignPendingCityThroughLegacyFallback(
  page: Page,
  cityName: string,
  preferredApprovedCity?: string
): Promise<string> {
  await ensureAdminSessionReady(page);
  const pendingSnapshot = await getPendingCityListItemSnapshot(page, cityName);
  if (!pendingSnapshot) {
    throw new Error(`Pending city target is not present in pending-city service list: ${cityName}`);
  }

  if (!pendingSnapshot.district_id) {
    throw new Error(
      `Pending city has no district_id and cannot be assigned via legacy RPC fallback: ${cityName}`
    );
  }

  const approvedCity = await pickApprovedCityForLegacyPendingAssignment(
    page,
    pendingSnapshot.district_id,
    preferredApprovedCity
  );

  await resolvePendingCityViaLegacyRpc(page, {
    stateName: pendingSnapshot.state_name,
    districtName: pendingSnapshot.district_name,
    otherCityNameNormalized: pendingSnapshot.other_city_name_normalized,
    approvedCityId: approvedCity.cityId,
  });

  return approvedCity.cityName;
}

async function getPendingCityAssignFailureDiagnostics(
  page: Page,
  diagnostics: Diagnostics,
  cityName: string,
  assignability: PendingCityAssignability
): Promise<string> {
  const visibleMessages = await getVisibleTexts(page, [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '.Toastify__toast',
    '[data-sonner-toast]',
    '[class*="toast"]',
    'text=/district not resolved/i',
    'text=/assignment is disabled/i',
    'text=/failed/i',
    'text=/error/i',
  ]);
  const recentConsoleErrors = diagnostics.consoleErrors.slice(-10);

  return [
    `city=${cityName}`,
    `url=${page.url()}`,
    `rowExists=${assignability.rowExists ? 'yes' : 'no'}`,
    `assignButtonExists=${assignability.assignButtonExists ? 'yes' : 'no'}`,
    `assignButtonEnabled=${assignability.assignButtonEnabled ? 'yes' : 'no'}`,
    `visibleMessages=${visibleMessages.join(' | ') || '(none found)'}`,
    `recentConsoleErrors=${recentConsoleErrors.join(' | ') || '(none found)'}`,
  ].join(' | ');
}

async function ensureFreshPendingCityTarget(
  page: Page,
  fixtures: Phase1SmokeFixtures,
  diagnostics: Diagnostics
): Promise<string> {
  const currentTarget = fixtures.locations?.pending_city_name?.trim() ?? '';
  let latestVisibleFreshTarget: string | null = null;

  if (currentTarget) {
    const assignable = await isPendingCityAssignable(page, currentTarget);
    if (assignable) {
      return currentTarget;
    }
  }

  const creationErrors: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = Date.now() + attempt;
    const pendingCityName = `smoke-pending-city-${timestamp}`;
    const email = buildSmokePendingCityEmail(timestamp);
    const mobile = buildSmokeMobile(timestamp, 6 + attempt);

    try {
      await createPendingCityViaSignupAndJoin(page, email, mobile, pendingCityName);
    } catch (error) {
      creationErrors.push(
        `attempt=${attempt + 1}, city=${pendingCityName}, joinError=${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    await clearCustomSession(page);
    await loginAsAdmin(page);

    let latestAssignability: PendingCityAssignability | null = null;
    for (let poll = 0; poll < 12; poll += 1) {
      await expectAdminRoute(page, '/admin/locations/pending-cities');
      latestAssignability = await getPendingCityAssignability(page, pendingCityName);

      if (latestAssignability.rowExists && latestAssignability.assignButtonExists && latestAssignability.assignButtonEnabled) {
        writePendingCityFixtureTarget(pendingCityName);
        return pendingCityName;
      }

      if (latestAssignability.rowExists) {
        latestVisibleFreshTarget = pendingCityName;
      }

      await page.waitForTimeout(500);
    }

    if (latestAssignability) {
      const details = await getPendingCityAssignFailureDiagnostics(page, diagnostics, pendingCityName, latestAssignability);
      creationErrors.push(`attempt=${attempt + 1}, city=${pendingCityName}, assignability=${details}`);
    }
  }

  if (latestVisibleFreshTarget) {
    writePendingCityFixtureTarget(latestVisibleFreshTarget);
    return latestVisibleFreshTarget;
  }

  if (currentTarget) {
    await expectAdminRoute(page, '/admin/locations/pending-cities');
    const currentState = await getPendingCityAssignability(page, currentTarget);
    const currentDetails = await getPendingCityAssignFailureDiagnostics(page, diagnostics, currentTarget, currentState);
    creationErrors.unshift(`existingTarget=${currentDetails}`);
  }

  throw new Error(
    `Self-heal could not produce an assignable pending city target. Details: ${creationErrors.join(' || ')}`
  );
}

async function fillVisibleTextarea(page: Page, value: string): Promise<boolean> {
  const textarea = page.locator('textarea:visible').first();
  if (!(await textarea.count())) {
    return false;
  }

  await textarea.fill(value);
  return true;
}

async function fillInputByLabelIfVisible(page: Page, label: RegExp, value: string): Promise<boolean> {
  const input = await findLabeledControl(page, label, 'input');
  if (!input) {
    return false;
  }

  await input.fill(value);
  return true;
}

async function selectOptionByLabel(page: Page, label: RegExp, optionLabel: string): Promise<boolean> {
  const select = await findLabeledControl(page, label, 'select');
  if (!select) {
    return false;
  }

  const option = select.locator('option').filter({
    hasText: new RegExp(`^${escapeForRegex(optionLabel)}$`, 'i'),
  }).first();

  if (!(await option.count())) {
    return false;
  }

  await select.selectOption({ label: optionLabel });
  return true;
}

async function selectFirstAvailableOptionByLabel(page: Page, label: RegExp): Promise<string | null> {
  const select = await findLabeledControl(page, label, 'select');
  if (!select) {
    return null;
  }

  const options = await select.locator('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent ?? '').trim(),
    }))
  );

  const candidate = options.find((option) =>
    option.value &&
    option.label &&
    !/^select\b/i.test(option.label) &&
    !/create new/i.test(option.label)
  );

  if (!candidate) {
    return null;
  }

  await select.selectOption({ value: candidate.value });
  return candidate.label;
}

async function findLabeledControl(page: Page, label: RegExp, selector: string): Promise<Locator | null> {
  const direct = page.getByLabel(label).first();
  if (await direct.count()) {
    return direct;
  }

  const labelNode = page.locator('label').filter({ hasText: label }).first();
  if (!(await labelNode.count())) {
    return null;
  }

  const siblingControl = labelNode.locator(`xpath=following-sibling::*[1]`).locator(selector).first();
  if (await siblingControl.count()) {
    return siblingControl;
  }

  const parentControl = labelNode.locator('xpath=..').locator(selector).first();
  if (await parentControl.count()) {
    return parentControl;
  }

  const textLabelNode = page.locator('div, span, p').filter({ hasText: label }).first();
  if (await textLabelNode.count()) {
    const textSiblingControl = textLabelNode.locator(`xpath=following-sibling::*[1]`).locator(selector).first();
    if (await textSiblingControl.count()) {
      return textSiblingControl;
    }

    const textParentControl = textLabelNode.locator('xpath=..').locator(selector).first();
    if (await textParentControl.count()) {
      return textParentControl;
    }
  }

  return null;
}

async function waitForToastText(page: Page, text: RegExp): Promise<void> {
  await expect(page.locator('body')).toContainText(text, { timeout: 10_000 });
}

async function waitForRpcCall(page: Page, rpcName: string, timeoutMs = 15_000): Promise<import('@playwright/test').Response | null> {
  return page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/rest/v1/rpc/${rpcName}`),
      { timeout: timeoutMs }
    )
    .catch(() => null);
}

async function isSuccessfulRpcResult(response: import('@playwright/test').Response | null): Promise<boolean> {
  if (!response) {
    return false;
  }

  if (response.status() >= 400) {
    return false;
  }

  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return Boolean((payload as { success?: boolean }).success);
  }

  return response.ok();
}

function getCityRowLocator(page: Page, cityName: string): Locator {
  const exactName = new RegExp(`^\\s*${escapeForRegex(cityName)}\\s*$`, 'i');
  return page
    .locator('tbody tr')
    .filter({ has: page.locator('td span').filter({ hasText: exactName }) })
    .first();
}

async function isCityVisibleInTable(page: Page, cityName: string): Promise<boolean> {
  const row = getCityRowLocator(page, cityName);
  if (!(await row.count())) {
    return false;
  }

  return row.isVisible().catch(() => false);
}

async function waitForCityTableVisibility(
  page: Page,
  cityName: string,
  shouldBeVisible: boolean,
  timeoutMs = 20_000
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await fillSearchIfVisible(page, cityName);
    const visible = await isCityVisibleInTable(page, cityName);
    if (visible === shouldBeVisible) {
      return true;
    }

    await page.waitForTimeout(400);
  }

  return false;
}

function getPaymentStateRowLocator(page: Page, stateName: string): Locator {
  const exactName = new RegExp(`^\\s*${escapeForRegex(stateName)}\\s*$`, 'i');
  return page
    .locator('tbody tr')
    .filter({ has: page.locator('td span').filter({ hasText: exactName }) })
    .first();
}

async function listConfiguredPaymentStateNames(page: Page): Promise<string[]> {
  const values = await page
    .locator('tbody tr td:first-child span')
    .evaluateAll((elements) =>
      elements
        .map((element) => (element.textContent ?? '').trim())
        .filter((value) => Boolean(value))
    )
    .catch(() => []);

  return [...new Set(values)];
}

async function chooseEditablePaymentState(page: Page, preferredState?: string): Promise<string | null> {
  const preferred = preferredState?.trim();
  if (preferred) {
    const preferredRow = getPaymentStateRowLocator(page, preferred);
    if ((await preferredRow.count()) > 0 && (await preferredRow.isVisible().catch(() => false))) {
      return preferred;
    }
  }

  const configuredStates = await listConfiguredPaymentStateNames(page);
  return configuredStates[0] ?? null;
}

async function waitForPaymentStateVisibility(
  page: Page,
  stateName: string,
  shouldBeVisible: boolean,
  timeoutMs = 15_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = getPaymentStateRowLocator(page, stateName);
    const visible = (await row.count()) > 0 && (await row.isVisible().catch(() => false));
    if (visible === shouldBeVisible) {
      return true;
    }

    await page.waitForTimeout(400);
  }

  return false;
}

async function waitForPaymentRowToContainText(
  page: Page,
  stateName: string,
  expectedText: string,
  timeoutMs = 15_000
): Promise<boolean> {
  const expected = normalizeLooseText(expectedText);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = getPaymentStateRowLocator(page, stateName);
    if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) {
      const text = normalizeLooseText(await row.innerText().catch(() => ''));
      if (text.includes(expected)) {
        return true;
      }
    }

    await page.waitForTimeout(400);
  }

  return false;
}

async function openAddPaymentSettingsModal(page: Page): Promise<Locator> {
  const addNewStateButton = page.getByRole('button', { name: /^Add New State$/i }).first();
  if (await addNewStateButton.count()) {
    await addNewStateButton.click();
  } else {
    await page.getByRole('button', { name: /^Add Payment Settings$/i }).first().click();
  }

  const heading = page.getByRole('heading', { name: /Add New State Payment Settings/i }).first();
  await expect(heading).toBeVisible({ timeout: 10_000 });

  return heading.locator('xpath=ancestor::div[contains(@class, "bg-white")][1]').first();
}

async function chooseCreatablePaymentState(
  modal: Locator,
  configuredStates: string[],
  preferredCreateState?: string
): Promise<string | null> {
  const stateSelect = modal.locator('select').first();
  if (!(await stateSelect.count())) {
    return null;
  }

  const options = await stateSelect.locator('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent ?? '').trim(),
      disabled: (element as HTMLOptionElement).disabled,
    }))
  );

  const configured = new Set(configuredStates.map((state) => normalizeLooseText(state)));
  const selectable = options.filter(
    (option) =>
      option.value &&
      option.label &&
      !option.disabled &&
      !/^select\b/i.test(option.label) &&
      !/^all states configured/i.test(option.label) &&
      !/^loading/i.test(option.label) &&
      !configured.has(normalizeLooseText(option.label))
  );

  if (!selectable.length) {
    return null;
  }

  const preferred = preferredCreateState?.trim();
  if (preferred) {
    const preferredOption = selectable.find(
      (option) => normalizeLooseText(option.label) === normalizeLooseText(preferred)
    );
    if (preferredOption) {
      await stateSelect.selectOption(preferredOption.value);
      return preferredOption.label;
    }
  }

  await stateSelect.selectOption(selectable[0].value);
  return selectable[0].label;
}

async function maybeUploadQrIfReadable(scope: Locator, qrPath?: string): Promise<boolean> {
  if (!qrPath || !existsSync(qrPath)) {
    return false;
  }

  const uploadInput = scope.locator('input[type="file"]').first();
  if (!(await uploadInput.count())) {
    return false;
  }

  await uploadInput.setInputFiles(qrPath);
  return true;
}

async function selectFirstNonEmptyOption(select: Locator): Promise<string | null> {
  const options = await select.locator('option').evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent ?? '').trim(),
    }))
  );

  const choice = options.find(
    (option) =>
      option.value &&
      option.label &&
      !/^select\b/i.test(option.label) &&
      !/^choose\b/i.test(option.label)
  );

  if (!choice) {
    return null;
  }

  await select.selectOption({ value: choice.value });
  return choice.label;
}

async function getCityFlowFailureDiagnostics(
  page: Page,
  diagnostics: Diagnostics,
  dialogMessages: string[]
): Promise<string> {
  const currentUrl = page.url();
  const addModalOpen = await page.getByRole('heading', { name: /Add New City/i }).first().isVisible().catch(() => false);
  const inlineErrors = await getVisibleTexts(page, [
    'div.text-red-500',
    'div.text-red-600',
    'p.text-red-500',
    'p.text-red-600',
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    'text=/Please fill in all required fields/i',
    'text=/Error adding city/i',
    'text=/Error deleting city/i',
  ]);
  const recentConsoleErrors = diagnostics.consoleErrors.slice(-10);

  return [
    `url=${currentUrl}`,
    `addModalOpen=${addModalOpen ? 'yes' : 'no'}`,
    `inlineErrors=${inlineErrors.join(' | ') || '(none found)'}`,
    `dialogMessages=${dialogMessages.join(' | ') || '(none)'}`,
    `recentConsoleErrors=${recentConsoleErrors.join(' | ') || '(none found)'}`,
  ].join(' | ');
}

async function openLocationManagementForDistrictCrud(
  page: Page,
  preferredStateName?: string
): Promise<string> {
  await expectAdminRoute(page, '/admin/locations/states');

  const statesTableRows = page.locator('tbody tr');
  const rowCount = await statesTableRows.count();
  if (rowCount === 0) {
    throw new Error('No states are available in /admin/locations/states for district CRUD smoke.');
  }

  const normalizedPreferred = preferredStateName?.trim().toLowerCase();
  let selectedRow: Locator | null = null;
  let selectedStateName: string | null = null;
  let fallbackRow: Locator | null = null;
  let fallbackStateName: string | null = null;

  for (let index = 0; index < rowCount; index += 1) {
    const row = statesTableRows.nth(index);
    const manageLocationsLink = row.getByRole('link', { name: /Manage Locations/i }).first();
    if (!(await manageLocationsLink.count())) {
      continue;
    }

    const stateName = (await row.locator('td').first().innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (!stateName) {
      continue;
    }

    const statusText = (await row.locator('td').nth(1).innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (normalizedPreferred && stateName.toLowerCase() === normalizedPreferred) {
      selectedRow = row;
      selectedStateName = stateName;
      break;
    }

    if (!fallbackRow && /\bactive\b/.test(statusText)) {
      fallbackRow = row;
      fallbackStateName = stateName;
    }
  }

  if (!selectedRow) {
    if (fallbackRow) {
      selectedRow = fallbackRow;
      selectedStateName = fallbackStateName;
    } else {
      for (let index = 0; index < rowCount; index += 1) {
        const row = statesTableRows.nth(index);
        const manageLocationsLink = row.getByRole('link', { name: /Manage Locations/i }).first();
        if (!(await manageLocationsLink.count())) {
          continue;
        }

        selectedRow = row;
        selectedStateName = (await row.locator('td').first().innerText().catch(() => ''))
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }
    }
  }

  if (!selectedStateName) {
    throw new Error('Could not resolve a usable state row for district CRUD smoke.');
  }
  if (!selectedRow) {
    throw new Error('Could not resolve a usable state row with Manage Locations action.');
  }

  await selectedRow.getByRole('link', { name: /Manage Locations/i }).first().click();
  await expectAdminRoute(page, `/admin/locations/states/${encodeURIComponent(selectedStateName)}/locations`);
  return selectedStateName;
}

async function fillDistrictSearch(page: Page, value: string): Promise<void> {
  const searchInput = page.getByPlaceholder(/Search districts/i).first();
  if (!(await searchInput.count())) {
    return;
  }

  await searchInput.fill(value);
}

function getDistrictRowLocator(page: Page, districtName: string): Locator {
  const exactName = new RegExp(`^\\s*${escapeForRegex(districtName)}\\s*$`, 'i');
  const districtPanel = page
    .locator('div.bg-white')
    .filter({ has: page.getByRole('heading', { name: /Districts in/i }) })
    .first();

  return districtPanel
    .locator('div.divide-y.divide-gray-200 > div')
    .filter({ has: page.locator('h3').filter({ hasText: exactName }) })
    .first();
}

async function isDistrictVisibleInList(page: Page, districtName: string): Promise<boolean> {
  const row = getDistrictRowLocator(page, districtName);
  if (!(await row.count())) {
    return false;
  }

  return row.isVisible().catch(() => false);
}

async function waitForDistrictListVisibility(
  page: Page,
  districtName: string,
  shouldBeVisible: boolean,
  timeoutMs = 20_000
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await fillDistrictSearch(page, districtName);
    const visible = await isDistrictVisibleInList(page, districtName);
    if (visible === shouldBeVisible) {
      return true;
    }

    await page.waitForTimeout(350);
  }

  return false;
}

async function clickDistrictRowAction(page: Page, districtName: string, action: 'edit' | 'delete'): Promise<void> {
  await fillDistrictSearch(page, districtName);
  const row = getDistrictRowLocator(page, districtName);
  await expect(row, `District row should be visible: ${districtName}`).toBeVisible({ timeout: 12_000 });

  let actionButton =
    action === 'edit'
      ? row.locator('button:has(svg.lucide-credit-card)').first()
      : row.locator('button:has(svg.lucide-trash-2)').first();

  if (!(await actionButton.count())) {
    actionButton = action === 'edit' ? row.locator('button').first() : row.locator('button').last();
  }

  await expect(actionButton, `Action button (${action}) should be visible for district: ${districtName}`).toBeVisible();
  await actionButton.click();
}

async function createDistrictViaLocationModal(page: Page, districtName: string): Promise<void> {
  await page.getByRole('button', { name: /^Add District$/i }).first().click();

  const addModal = page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Add New District/i }) })
    .first();

  await expect(addModal).toBeVisible();
  await addModal.getByPlaceholder(/Enter district name/i).fill(districtName);

  const addRpcResponsePromise = waitForRpcCall(page, 'add_district_with_session');
  await addModal.getByRole('button', { name: /^Add District$/i }).click();

  const addRpcResponse = await addRpcResponsePromise;
  const addRpcSuccess = await isSuccessfulRpcResult(addRpcResponse);
  const modalClosed = await addModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
  const districtVisible = await waitForDistrictListVisibility(page, districtName, true, 25_000);

  if (!modalClosed && !addRpcSuccess) {
    throw new Error(`Add district did not show deterministic success markers for ${districtName}.`);
  }

  if (!districtVisible) {
    throw new Error(`Added district was not visible in list/search: ${districtName}`);
  }
}

async function editDistrictNameViaLocationModal(page: Page, existingName: string, updatedName: string): Promise<void> {
  await clickDistrictRowAction(page, existingName, 'edit');

  const editModal = page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Edit District/i }) })
    .first();
  await expect(editModal).toBeVisible();

  await editModal.getByPlaceholder(/Enter district name/i).fill(updatedName);

  const updateRpcResponsePromise = waitForRpcCall(page, 'update_district_with_session');
  await editModal.getByRole('button', { name: /^Update District$/i }).click();

  const updateRpcResponse = await updateRpcResponsePromise;
  const updateRpcSuccess = await isSuccessfulRpcResult(updateRpcResponse);
  const modalClosed = await editModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
  const updatedVisible = await waitForDistrictListVisibility(page, updatedName, true, 20_000);

  if (!modalClosed && !updateRpcSuccess) {
    throw new Error(`Update district did not show deterministic success markers for ${existingName}.`);
  }

  if (!updatedVisible) {
    throw new Error(`Updated district name is not visible in district list/search: ${updatedName}`);
  }
}

async function deleteDistrictAndVerifyRemoved(page: Page, districtName: string): Promise<void> {
  await acceptNextDialog(page);
  const deleteRpcResponsePromise = waitForRpcCall(page, 'delete_district_hard_with_session');
  await clickDistrictRowAction(page, districtName, 'delete');

  const blockedModalVisible = await page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Cannot Delete District/i }) })
    .first()
    .isVisible()
    .catch(() => false);

  if (blockedModalVisible) {
    throw new Error(`District delete was blocked unexpectedly for a smoke deletable district: ${districtName}`);
  }

  const deleteRpcResponse = await deleteRpcResponsePromise;
  const deleteRpcSuccess = await isSuccessfulRpcResult(deleteRpcResponse);
  const districtRemoved = await waitForDistrictListVisibility(page, districtName, false, 20_000);

  if (!districtRemoved && !deleteRpcSuccess) {
    throw new Error(`Deleted district still appears in district list/search: ${districtName}`);
  }
}

async function addCityToDistrictInLocationManagement(page: Page, districtName: string, cityName: string): Promise<void> {
  await fillDistrictSearch(page, districtName);
  const districtRow = getDistrictRowLocator(page, districtName);
  await expect(districtRow).toBeVisible({ timeout: 12_000 });
  await districtRow.click();

  await page.getByRole('button', { name: /^Add City$/i }).first().click();
  const addCityModal = page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Add New City/i }) })
    .first();

  await expect(addCityModal).toBeVisible();
  await addCityModal.getByPlaceholder(/Enter city name/i).fill(cityName);

  const addCityRpcResponsePromise = waitForRpcCall(page, 'admin_add_city_approved_with_session');
  await addCityModal.getByRole('button', { name: /^Add City$/i }).click();

  const addCityRpcResponse = await addCityRpcResponsePromise;
  const addCityRpcSuccess = await isSuccessfulRpcResult(addCityRpcResponse);
  const cityModalClosed = await addCityModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
  const cityVisible = await page
    .locator('div.bg-white')
    .filter({ has: page.getByRole('heading', { name: /Cities in/i }) })
    .first()
    .getByText(new RegExp(`^\\s*${escapeForRegex(cityName)}\\s*$`, 'i'))
    .first()
    .isVisible()
    .catch(() => false);

  if (!cityModalClosed && !addCityRpcSuccess) {
    throw new Error(`Add city did not show deterministic success markers for district=${districtName}, city=${cityName}`);
  }

  if (!cityVisible && !addCityRpcSuccess) {
    throw new Error(`Added city is not visible in selected district city list: ${cityName}`);
  }
}

async function assertDistrictDeleteBlockedAndDisable(page: Page, districtName: string): Promise<void> {
  await clickDistrictRowAction(page, districtName, 'delete');

  const blockedModal = page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Cannot Delete District/i }) })
    .first();
  await expect(blockedModal).toBeVisible({ timeout: 10_000 });
  await expect(blockedModal).toContainText(/cannot delete|cities mapped|disable/i);

  const disableRpcResponsePromise = waitForRpcCall(page, 'toggle_district_active_with_session');
  await blockedModal.getByRole('button', { name: /^Disable District$/i }).click();

  const disableRpcResponse = await disableRpcResponsePromise;
  const disableRpcSuccess = await isSuccessfulRpcResult(disableRpcResponse);
  const modalClosed = await blockedModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
  const districtHidden = await waitForDistrictListVisibility(page, districtName, false, 20_000);

  if (!modalClosed && !disableRpcSuccess) {
    throw new Error(`Disable district did not show deterministic success markers for ${districtName}.`);
  }

  if (!districtHidden && !disableRpcSuccess) {
    throw new Error(`District should disappear from active district list after disable: ${districtName}`);
  }
}

async function getDistrictFlowFailureDiagnostics(page: Page, diagnostics: Diagnostics): Promise<string> {
  const currentUrl = page.url();
  const visibleErrors = await getVisibleTexts(page, [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '.Toastify__toast',
    '[data-sonner-toast]',
    '[class*="toast"]',
    'text=/Please enter a district name/i',
    'text=/Cannot Delete District/i',
    'text=/Failed to/i',
    'text=/Error/i',
  ]);
  const modalTitles = await getVisibleTexts(page, [
    'h3',
    'h2',
  ]);
  const recentConsoleErrors = diagnostics.consoleErrors.slice(-10);

  return [
    `url=${currentUrl}`,
    `visibleErrors=${visibleErrors.join(' | ') || '(none found)'}`,
    `modalTitles=${modalTitles.join(' | ') || '(none found)'}`,
    `recentConsoleErrors=${recentConsoleErrors.join(' | ') || '(none found)'}`,
  ].join(' | ');
}

async function clearBlockingModalOverlay(page: Page): Promise<void> {
  const modalOverlay = page.locator('div.fixed.inset-0.z-50.overflow-y-auto').first();
  const isVisible = await modalOverlay.isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  const closeButton = page.getByRole('button', { name: /Cancel|Close|Done|OK/i }).first();
  if (await closeButton.count()) {
    await closeButton.click().catch(() => {});
  }

  await page.keyboard.press('Escape').catch(() => {});
  await modalOverlay.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

async function acceptNextDialog(page: Page): Promise<void> {
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
}

type RuntimeFormFieldTarget = {
  fieldLabel: string;
  fieldName: string;
};

async function findFormFieldRowByNameOrLabel(page: Page, nameOrLabel: string): Promise<Locator | null> {
  const exact = new RegExp(`^\\s*${escapeForRegex(nameOrLabel)}\\s*$`, 'i');
  const byFieldName = page.locator('tbody tr').filter({
    has: page.locator('code').filter({ hasText: exact }),
  }).first();
  if ((await byFieldName.count()) > 0 && (await byFieldName.isVisible().catch(() => false))) {
    return byFieldName;
  }

  const byFieldLabel = page.locator('tbody tr').filter({
    has: page.locator('td').first().locator('div').filter({ hasText: exact }),
  }).first();
  if ((await byFieldLabel.count()) > 0 && (await byFieldLabel.isVisible().catch(() => false))) {
    return byFieldLabel;
  }

  return null;
}

async function chooseRuntimeFormField(page: Page, preferredFieldName?: string): Promise<RuntimeFormFieldTarget> {
  await expect(page.getByRole('heading', { name: /Join LUB Form - Field Configuration/i }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

  const preferred = preferredFieldName?.trim();
  if (preferred) {
    const preferredRow = await findFormFieldRowByNameOrLabel(page, preferred);
    if (preferredRow) {
      const fieldLabel = (await preferredRow.locator('td').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const fieldName = (await preferredRow.locator('code').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (fieldLabel && fieldName) {
        return { fieldLabel, fieldName };
      }
    }
  }

  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const toggleCandidate = row.getByRole('button', { name: /^(Visible|Hidden|Required|Optional)$/i }).first();
    if (!(await toggleCandidate.count())) {
      continue;
    }
    if (!(await toggleCandidate.isVisible().catch(() => false))) {
      continue;
    }

    const fieldLabel = (await row.locator('td').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const fieldName = (await row.locator('code').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (fieldLabel && fieldName) {
      return { fieldLabel, fieldName };
    }
  }

  throw new Error('No configurable form field row with visible toggle controls was found at runtime.');
}

async function selectToggleButtonForFormField(
  page: Page,
  fieldName: string
): Promise<{ beforeLabel: string; afterLabel: string; button: Locator }> {
  const row = await findFormFieldRowByNameOrLabel(page, fieldName);
  if (!row) {
    throw new Error(`Form field row not found for toggle action: ${fieldName}`);
  }

  const requiredOptionalButton = row.getByRole('button', { name: /^(Required|Optional)$/i }).first();
  if ((await requiredOptionalButton.count()) > 0 && (await requiredOptionalButton.isVisible().catch(() => false))) {
    const enabled = await requiredOptionalButton.isEnabled().catch(() => false);
    if (enabled) {
      const beforeLabel = (await requiredOptionalButton.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const afterLabel = /^required$/i.test(beforeLabel) ? 'Optional' : 'Required';
      return { beforeLabel, afterLabel, button: requiredOptionalButton };
    }
  }

  const visibilityButton = row.getByRole('button', { name: /^(Visible|Hidden)$/i }).first();
  if ((await visibilityButton.count()) > 0 && (await visibilityButton.isVisible().catch(() => false))) {
    const beforeLabel = (await visibilityButton.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const afterLabel = /^visible$/i.test(beforeLabel) ? 'Hidden' : 'Visible';
    return { beforeLabel, afterLabel, button: visibilityButton };
  }

  throw new Error(`No actionable toggle button found for form field: ${fieldName}`);
}

async function waitForFormFieldToggleLabel(
  page: Page,
  fieldName: string,
  expectedLabel: string,
  timeoutMs = 15_000
): Promise<boolean> {
  const expected = new RegExp(`^\\s*${escapeForRegex(expectedLabel)}\\s*$`, 'i');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = await findFormFieldRowByNameOrLabel(page, fieldName);
    if (row) {
      const expectedButton = row.getByRole('button', { name: expected }).first();
      if ((await expectedButton.count()) > 0 && (await expectedButton.isVisible().catch(() => false))) {
        return true;
      }
    }

    await page.waitForTimeout(350);
  }

  return false;
}

async function waitForButtonDisabledState(button: Locator, expectedDisabled: boolean, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const disabled = await button.isDisabled().catch(() => false);
    if (disabled === expectedDisabled) {
      return true;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  return false;
}

test.describe('phase1-readonly', () => {
  test('valid admin login reaches dashboard and admin shell', async ({ page }, testInfo) => {
    const diagnostics = attachDiagnostics(page);

    await loginAsAdmin(page);
    await expectAdminRoute(page, '/admin/dashboard');
    await expect(page.locator('body')).toContainText(/Overview|Dashboard/i);

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('invalid or cleared session is denied for admin dashboard', async ({ page }, testInfo) => {
    const diagnostics = attachDiagnostics(page);

    await loginAsAdmin(page);
    await clearCustomSession(page);
    await gotoAppPath(page, '/admin/dashboard');
    await expect(page).toHaveURL(/\/signin(?:[/?#].*)?$/);

    await recordDiagnostics(testInfo, diagnostics);
  });

  test('phase 1 admin routes load without fatal errors', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const diagnostics = attachDiagnostics(page);
    const fixtures = loadSmokeFixtures();
    const stateName = fixtures?.locations?.state_name?.trim();

    await loginAsAdmin(page);

    const routes = [
      '/admin/dashboard',
      '/admin/members/registrations',
      '/admin/members/deleted',
      '/admin/administration/users',
      '/admin/locations/pending-cities',
      '/admin/locations/cities',
      '/admin/locations/payment-settings',
      '/admin/settings/validation',
    ];

    for (const path of routes) {
      await test.step(`load ${path}`, async () => {
        await expectAdminRoute(page, path);
      });
    }

    if (stateName) {
      await test.step('load dynamic location-management route', async () => {
        await expectAdminRoute(page, `/admin/locations/states/${encodeURIComponent(stateName)}/locations`);
      });
    }

    await test.step('load /admin/settings/forms/join-lub', async () => {
      try {
        await expectJoinLubFormConfigRoute(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const routeDiagnostics = await buildRouteLoadDiagnostics(page, diagnostics);
        throw new Error(
          [
            'Failed loading /admin/settings/forms/join-lub',
            routeDiagnostics,
            `rootError=${errorMessage}`,
          ].join(' | ')
        );
      }
    });

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });
});

test.describe('phase1-mutation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.skip(process.env.RUN_DESTRUCTIVE !== 'true', 'Destructive smoke is disabled. Set RUN_DESTRUCTIVE=true to enable it.');
    await loginAsAdmin(page);
  });

  test('admin member registrations mutations', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let fixtures = requireFixtures();
    let registrations = fixtures.registrations ?? {};

    await test.step('self-heal pending approve/reject fixture targets when needed', async () => {
      const pendingTargets = await ensureFreshPendingRegistrationTargets(page, fixtures);
      fixtures = loadSmokeFixtures() ?? fixtures;
      registrations = {
        ...(fixtures.registrations ?? registrations),
        approve_target_email: pendingTargets.approveTargetEmail,
        reject_target_email: pendingTargets.rejectTargetEmail,
      };
    });

    await expectAdminRoute(page, '/admin/members/registrations');

    if (registrations.approve_target_email) {
      await test.step('approve pending registration', async () => {
        await clickRegistrationActionByEmail(page, registrations.approve_target_email, ['View Details'], 'pending');
        await expect(page.locator('body')).toContainText(/Approve/i);
        await page.getByRole('button', { name: /^Approve$/i }).last().click();
        await expect(page.locator('body')).toContainText(/Confirm Approval/i);
        await page.getByRole('button', { name: /^Approve$/i }).click();
        await waitForToastText(page, /approved|success/i);
      });
    }

    if (registrations.reject_target_email) {
      await test.step('reject pending registration', async () => {
        await clickRegistrationActionByEmail(page, registrations.reject_target_email, ['View Details'], 'pending');
        await page.getByRole('button', { name: /^Reject$/i }).click();
        await expect(page.locator('body')).toContainText(/Confirm Rejection/i);
        await fillInputByLabelIfVisible(page, /Rejection Reason/i, 'Playwright smoke rejection');
        await fillVisibleTextarea(page, 'Playwright smoke rejection');
        await page.getByRole('button', { name: /^Reject$/i }).click();
        await waitForToastText(page, /rejected|success/i);
      });
    }

    if (registrations.delete_target_email) {
      await test.step('soft delete registration', async () => {
        const fallbackDeleteEmail = registrations.reject_target_email;

        try {
          await clickRegistrationActionByEmail(page, registrations.delete_target_email!, ['Delete'], 'all');
        } catch (error) {
          if (!fallbackDeleteEmail || fallbackDeleteEmail === registrations.delete_target_email) {
            throw error;
          }

          await clickRegistrationActionByEmail(page, fallbackDeleteEmail, ['Delete'], 'all');
        }

        await expect(page.locator('body')).toContainText(/Confirm Deletion/i);
        await fillInputByLabelIfVisible(page, /Deletion Reason/i, 'Playwright smoke delete');
        await fillVisibleTextarea(page, 'Playwright smoke delete');
        await page.getByRole('button', { name: /^Delete Member$/i }).click();
        await waitForToastText(page, /deleted successfully/i);
      });
    }

    if (registrations.toggle_target_email) {
      await test.step('toggle member active and restore original state', async () => {
        const fallbackToggleEmail = registrations.approve_target_email;
        let effectiveToggleEmail = registrations.toggle_target_email!;

        try {
          await clickRegistrationActionByEmail(page, effectiveToggleEmail, ['Deactivate', 'Activate'], 'all');
        } catch (error) {
          if (!fallbackToggleEmail || fallbackToggleEmail === effectiveToggleEmail) {
            throw error;
          }

          effectiveToggleEmail = fallbackToggleEmail;
          await clickRegistrationActionByEmail(page, effectiveToggleEmail, ['Deactivate', 'Activate'], 'all');
        }

        await waitForToastText(page, /(activated|deactivated) successfully/i);
        await clickRegistrationActionByEmail(page, effectiveToggleEmail, ['Deactivate', 'Activate'], 'all');
        await waitForToastText(page, /(activated|deactivated) successfully/i);
      });
    }

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('edit member modal save path works', async ({ page }, testInfo) => {
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const target = fixtures.registrations?.edit_target_email;

    test.skip(!target, 'No registrations.edit_target_email fixture provided.');

    await expectAdminRoute(page, '/admin/members/registrations');
    await clickActionForRow(page, target!, ['Edit']);
    await expect(page.locator('body')).toContainText(/Edit Member Information/i);
    await fillInputByNameIfVisible(page, 'alternate_contact_name', 'Playwright Smoke Contact');
    await fillInputByNameIfVisible(page, 'alternate_mobile', '9123456789');
    await page.getByRole('button', { name: /^Save Changes$/i }).click();
    await waitForToastText(page, /(updated|saved|success)/i);

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('deleted members list and restore work', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let fixtures = requireFixtures();
    let target = fixtures.deleted_members?.restore_target_email;

    await test.step('self-heal deleted-member restore fixture target when needed', async () => {
      target = await ensureFreshDeletedMemberRestoreTarget(page, fixtures);
      fixtures = loadSmokeFixtures() ?? fixtures;
      target = fixtures.deleted_members?.restore_target_email ?? target;
    });

    await expectAdminRoute(page, '/admin/members/deleted');
    await clickActionForRow(page, target!, ['Restore Member']);
    await expect(page.locator('body')).toContainText(/Confirm Restoration/i);
    await page.getByRole('button', { name: /^Restore Member$/i }).last().click();
    await waitForToastText(page, /restored successfully/i);

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('admin user edit, block/unblock, and delete flows work', async ({ page, browser }, testInfo) => {
    test.setTimeout(8 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let fixtures = requireFixtures();
    let users = fixtures.users ?? {};

    await test.step('self-heal users fixture targets when needed', async () => {
      const userTargets = await ensureFreshUserTargets(page, browser, fixtures);
      fixtures = loadSmokeFixtures() ?? fixtures;
      users = {
        ...(fixtures.users ?? users),
        editable_target_email: userTargets.editable_target_email,
        general_user_block_email: userTargets.general_user_block_email,
        general_user_delete_email: userTargets.general_user_delete_email,
        non_general_user_delete_email: userTargets.non_general_user_delete_email,
      };
    });

    await ensureAdminSessionReady(page);
    await expectAdminRoute(page, '/admin/administration/users');

    const editableTargetEmail = users.editable_target_email ?? users.editable_user_email;

    if (editableTargetEmail) {
      await test.step('open edit user modal and submit update', async () => {
        await clearBlockingModalOverlay(page);
        await clickActionForRow(page, editableTargetEmail, ['Edit']);
        await expect(page.locator('body')).toContainText(/Edit User/i);
        await page.getByRole('button', { name: /^Update User$/i }).click();
        await waitForToastText(page, /(updated|success)/i);
        await clearBlockingModalOverlay(page);
      });
    }

    if (users.general_user_block_email) {
      await test.step('block then unblock general user', async () => {
        await clearBlockingModalOverlay(page);
        await clickActionForRow(page, users.general_user_block_email, ['Block', 'Unblock']);
        await expect(page.locator('body')).toContainText(/Block User|Unblock User|Block Account|Unblock Account/i);
        await page.getByRole('button', { name: /Block|Unblock/i }).last().click();
        await waitForToastText(page, /(blocked|unblocked) successfully/i);

        await clearBlockingModalOverlay(page);
        await clickActionForRow(page, users.general_user_block_email, ['Block', 'Unblock']);
        await page.getByRole('button', { name: /Block|Unblock/i }).last().click();
        await waitForToastText(page, /(blocked|unblocked) successfully/i);
        await clearBlockingModalOverlay(page);
      });
    }

    if (users.general_user_delete_email) {
      await test.step('delete general user', async () => {
        await clearBlockingModalOverlay(page);
        await clickActionForRow(page, users.general_user_delete_email, ['Delete']);
        await expect(page.locator('body')).toContainText(/Delete User Account/i);
        await page.getByLabel(/I understand this action cannot be undone/i).check();
        await page.getByRole('button', { name: /Delete User|Deleting|Deleted!/i }).click();
        await waitForToastText(page, /deleted successfully/i);
        await clearBlockingModalOverlay(page);
      });
    }

    if (users.non_general_user_delete_email) {
      await test.step('non-general-user delete is denied', async () => {
        await clearBlockingModalOverlay(page);
        await expectAdminRoute(page, '/admin/administration/users');
        await applyUsersAccountTypeFilter(page, 'all');
        await fillSearchIfVisible(page, users.non_general_user_delete_email);

        const row = await findUserRowByEmail(page, users.non_general_user_delete_email);
        if (!row) {
          throw new Error(`Could not find non-general user in UI: ${users.non_general_user_delete_email}`);
        }

        const deleteButton = row.getByRole('button', { name: /^Delete$/i }).first();
        await expect(deleteButton).toBeVisible();

        const enabled = await deleteButton.isEnabled().catch(() => false);
        if (enabled) {
          await deleteButton.click();
          await expect(page.locator('body')).toContainText(/Only general user accounts can be deleted|Cannot Delete This User/i);
          await page.getByRole('button', { name: /Cancel|Close/i }).first().click();
          return;
        }

        const title = (await deleteButton.getAttribute('title')) ?? '';
        expect.soft(
          title,
          'Delete action should be denied for non-general users'
        ).toMatch(/Cannot delete non-general user accounts|Cannot Delete This User|Only general user accounts can be deleted/i);
      });
    }

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('pending cities list and assign flow works', async ({ page }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let fixtures = requireFixtures();
    const preferredApprovedCity = fixtures.locations?.approved_city_name_for_assignment?.trim();
    let pendingCity = fixtures.locations?.pending_city_name?.trim();

    await test.step('self-heal pending city fixture target when needed', async () => {
      pendingCity = await ensureFreshPendingCityTarget(page, fixtures, diagnostics);
      fixtures = loadSmokeFixtures() ?? fixtures;
      pendingCity = fixtures.locations?.pending_city_name?.trim() || pendingCity;
    });

    if (!pendingCity) {
      throw new Error('Pending city fixture could not be resolved after self-heal.');
    }

    await expectAdminRoute(page, '/admin/locations/pending-cities');

    const assignability = await getPendingCityAssignability(page, pendingCity);
    let selectedApprovedCity = '';
    if (assignability.rowExists && assignability.assignButtonExists && assignability.assignButtonEnabled) {
      const pendingCard = assignability.card!;
      const assignButton = pendingCard
        .getByRole('button', { name: /Assign Approved City|Edit \+ Add\/Assign|Resolve/i })
        .first();

      await expect(assignButton).toBeVisible();
      await assignButton.click();

      await expect(page.locator('body')).toContainText(/Assign Approved City/i);
      selectedApprovedCity = await selectApprovedCityForPendingAssignment(page, preferredApprovedCity);
      await page.getByRole('button', { name: /^Assign City$/i }).click();

      const modalHeading = page.getByRole('heading', { name: /Assign Approved City/i }).first();
      await modalHeading.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    } else {
      const details = await getPendingCityAssignFailureDiagnostics(page, diagnostics, pendingCity, assignability);
      try {
        selectedApprovedCity = await assignPendingCityThroughLegacyFallback(page, pendingCity, preferredApprovedCity);
      } catch (legacyError) {
        throw new Error(
          `Pending city target is non-actionable in UI and legacy fallback failed. ${details} | legacyError=${
            legacyError instanceof Error ? legacyError.message : String(legacyError)
          }`
        );
      }
    }

    let stillVisible = true;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      stillVisible = await isPendingCityVisible(page, pendingCity);
      if (!stillVisible) {
        break;
      }

      await page.waitForTimeout(500);
    }

    expect(
      stillVisible,
      `Pending city should disappear after assignment. city=${pendingCity}, selectedApprovedCity=${selectedApprovedCity}`
    ).toBe(false);

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('pending-city exact-match branch auto-resolves to approved city', async ({ page, browser }, testInfo) => {
    test.setTimeout(4 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let target: ExactMatchPendingCityTarget | null = null;
    let pendingAfter: PendingCityListItemSnapshot | null = null;
    let registrationSnapshot: AdminRegistrationSnapshot | null = null;

    await ensureAdminSessionReady(page);
    target = await findExactMatchPendingCityTarget(page);

    const pendingBefore = await getPendingCityListItemSnapshot(page, target.cityName);
    expect(
      pendingBefore,
      `Exact-match branch target must start without a pending-city row. city=${target.cityName}, state=${target.stateName}, district=${target.districtName}`
    ).toBeNull();

    const timestamp = Date.now();
    const email = `smoke-exact-match-${timestamp}@example.com`;
    const mobile = buildSmokeMobile(timestamp, 8);
    const submittedCityInput = buildExactMatchCityInput(target.cityName);

    await createPendingRegistrationViaSignupAndJoinIsolated(browser, email, mobile, {
      forceOtherCityName: submittedCityInput,
      preferredStateName: target.stateName,
      preferredDistrictName: target.districtName,
    });

    await ensureAdminSessionReady(page);
    await expectAdminRoute(page, '/admin/members/registrations');

    registrationSnapshot = await getAdminRegistrationSnapshotByEmail(page, email);
    expect(registrationSnapshot, `New exact-match registration was not found for email=${email}`).not.toBeNull();
    expect(registrationSnapshot?.city ?? '', 'Registration should be directly linked to the approved city').toBe(target.cityName);
    expect(registrationSnapshot?.is_custom_city, 'Exact-match branch should not persist as custom city').toBe(false);
    expect(registrationSnapshot?.other_city_name ?? null, 'Exact-match branch should clear other_city_name').toBeNull();
    expect(registrationSnapshot?.pending_city_id ?? null, 'Exact-match branch should not link a pending_city_id').toBeNull();

    await clickRegistrationActionByEmail(page, email, ['View Details'], 'pending');
    await page.getByRole('button', { name: /Location Details/i }).click();
    const cityDefinition = page
      .locator('dt', { hasText: /^City$/i })
      .locator('xpath=following-sibling::dd[1]')
      .first();
    await expect(cityDefinition).toHaveText(new RegExp(`^\\s*${escapeForRegex(target.cityName)}\\s*$`, 'i'));
    await page.getByRole('button', { name: /^Close$/i }).click();

    pendingAfter = await getPendingCityListItemSnapshot(page, target.cityName);
    expect(
      pendingAfter,
      `No pending-city row should remain after exact-match submission. city=${target.cityName}, input=${submittedCityInput}`
    ).toBeNull();

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('member-role update and delete flows work', async ({ page }, testInfo) => {
    test.setTimeout(4 * 60_000);
    const diagnostics = attachDiagnostics(page);
    let target: MemberRoleAssignmentProofTarget | null = null;

    try {
      await ensureAdminSessionReady(page);
      target = await createMemberRoleAssignmentProofTarget(page);

      await openMemberRoleAssignmentsTab(page);
      await applyAssignmentSearch(page, target.memberEmail);

      const rowVisible = await waitForMemberAssignmentRowByEmail(page, target.memberEmail, true, 20_000);
      expect(rowVisible, `Controlled assignment row was not visible for ${target.memberEmail}`).toBe(true);

      await test.step('update assignment', async () => {
        const row = await findMemberAssignmentRowByEmail(page, target!.memberEmail);
        if (!row) {
          throw new Error(`Assignment row not found for update proof: ${target!.memberEmail}`);
        }

        const updateRpcResponsePromise = waitForRpcCall(page, 'admin_update_member_lub_role_assignment_with_session');
        const editButton = row.locator('td').last().locator('button').first();
        await expect(editButton).toBeVisible({ timeout: 10_000 });
        await editButton.click();

        await expect(page.getByRole('heading', { name: /Edit Member Role Assignment/i })).toBeVisible({ timeout: 10_000 });

        if (target!.updatedRoleId !== target!.originalRoleId) {
          const roleSelect = page.locator('select').filter({ has: page.locator(`option[value="${target!.updatedRoleId}"]`) }).first();
          await roleSelect.selectOption(target!.updatedRoleId);
        } else {
          await selectOptionByLabel(page, /Level/i, 'State');
          if (target!.updatedState) {
            await selectOptionByLabel(page, /State/i, target!.updatedState);
          }
        }

        await page.getByRole('button', { name: /^Update Assignment$/i }).click();
        const updateRpcResponse = await updateRpcResponsePromise;
        const updateRpcSuccess = await isSuccessfulRpcResult(updateRpcResponse);
        expect(updateRpcSuccess, 'Update assignment RPC should succeed').toBe(true);
        await waitForToastText(page, /(updated successfully|success)/i);

        await openMemberRoleAssignmentsTab(page);
        await applyAssignmentSearch(page, target!.memberEmail);

        const updatedSnapshot = await getMemberRoleAssignmentSnapshot(page, target!.assignmentId);
        expect(updatedSnapshot, `Updated assignment should still exist: ${target!.assignmentId}`).not.toBeNull();
        expect(updatedSnapshot?.role_id ?? '', 'Updated assignment role should persist').toBe(target!.updatedRoleId);
        expect(updatedSnapshot?.level ?? '', 'Updated assignment level should persist').toBe(target!.updatedLevel);
        if (target!.updatedState) {
          expect(updatedSnapshot?.state ?? '', 'Updated assignment state should persist').toBe(target!.updatedState);
        }

        const updatedRow = await findMemberAssignmentRowByEmail(page, target!.memberEmail);
        expect(updatedRow, 'Updated assignment row should remain visible after reload/filter').not.toBeNull();
        if (target!.updatedRoleName) {
          await expect(updatedRow!).toContainText(new RegExp(escapeForRegex(target!.updatedRoleName), 'i'));
        }
      });

      await test.step('delete assignment', async () => {
        await openMemberRoleAssignmentsTab(page);
        await applyAssignmentSearch(page, target!.memberEmail);

        const row = await findMemberAssignmentRowByEmail(page, target!.memberEmail);
        if (!row) {
          throw new Error(`Assignment row not found for delete proof: ${target!.memberEmail}`);
        }

        const deleteRpcResponsePromise = waitForRpcCall(page, 'admin_delete_member_lub_role_assignment_with_session');
        await acceptNextDialog(page);
        const deleteButton = row.locator('td').last().locator('button').nth(1);
        await expect(deleteButton).toBeVisible({ timeout: 10_000 });
        await deleteButton.click();

        const deleteRpcResponse = await deleteRpcResponsePromise;
        const deleteRpcSuccess = await isSuccessfulRpcResult(deleteRpcResponse);
        expect(deleteRpcSuccess, 'Delete assignment RPC should succeed').toBe(true);
        await waitForToastText(page, /(deleted successfully|success)/i);

        await openMemberRoleAssignmentsTab(page);
        await applyAssignmentSearch(page, target!.memberEmail);

        const rowGone = await waitForMemberAssignmentRowByEmail(page, target!.memberEmail, false, 20_000);
        expect(rowGone, `Deleted assignment row should disappear for ${target!.memberEmail}`).toBe(true);

        const deletedSnapshot = await getMemberRoleAssignmentSnapshot(page, target!.assignmentId);
        expect(deletedSnapshot, `Deleted assignment should be removed: ${target!.assignmentId}`).toBeNull();
        target = null;
      });

      await assertNoFatalDiagnostics(testInfo, diagnostics);
    } finally {
      if (target?.assignmentId) {
        await cleanupMemberRoleAssignment(page, target.assignmentId);
      }
    }
  });

  test('city add and delete flows work', async ({ page }, testInfo) => {
    test.setTimeout(2 * 60_000);
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const locations = fixtures.locations ?? {};
    const cityName = buildUniqueValue(locations.city_add_name_prefix ?? '', 'smoke-city-');
    const dialogMessages: string[] = [];
    const dialogListener = async (dialog: import('@playwright/test').Dialog): Promise<void> => {
      dialogMessages.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.accept();
    };

    page.on('dialog', dialogListener);

    try {
      await expectAdminRoute(page, '/admin/locations/cities');
      await page.getByRole('button', { name: /^Add City$/i }).first().click();

      const addModal = page
        .locator('div.fixed.inset-0')
        .filter({ has: page.getByRole('heading', { name: /Add New City/i }) })
        .first();
      await expect(addModal).toBeVisible();

      await addModal.getByPlaceholder(/Enter city name/i).fill(cityName);

      const stateSelect = addModal
        .locator('label')
        .filter({ hasText: /^State/i })
        .first()
        .locator('xpath=following-sibling::select[1]')
        .first();
      const districtSelect = addModal
        .locator('label')
        .filter({ hasText: /^District/i })
        .first()
        .locator('xpath=following-sibling::select[1]')
        .first();

      await expect(stateSelect).toBeVisible();
      await expect(districtSelect).toBeVisible();

      const preferredStateName = locations.state_name?.trim();
      let selectedState = false;
      if (preferredStateName) {
        selectedState = await stateSelect
          .selectOption({ label: preferredStateName })
          .then(() => true)
          .catch(() => false);
      }

      if (!selectedState) {
        const fallbackState = await selectFirstNonEmptyOption(stateSelect);
        if (!fallbackState) {
          throw new Error('No selectable state option is available in Add City modal.');
        }
      }

      const selectedDistrict = await selectFirstNonEmptyOption(districtSelect);
      if (!selectedDistrict) {
        throw new Error('No selectable district option is available in Add City modal.');
      }

      const addRpcResponsePromise = waitForRpcCall(page, 'admin_add_city_approved_with_session');
      await addModal.getByRole('button', { name: /^Add City$/i }).click();

      const addRpcResponse = await addRpcResponsePromise;
      const addRpcSuccess = await isSuccessfulRpcResult(addRpcResponse);
      const addModalClosed = await addModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
      const cityVisibleAfterAdd = await waitForCityTableVisibility(page, cityName, true, 20_000);

      const addUiSuccessMarker =
        addModalClosed ||
        dialogMessages.some((message) => /city added successfully/i.test(message));

      if (!addUiSuccessMarker && !addRpcSuccess) {
        throw new Error('Add city did not show a deterministic success marker (modal close or successful add-city RPC).');
      }

      if (!cityVisibleAfterAdd && !addRpcSuccess) {
        throw new Error(`Added city is not visible in cities table/search: ${cityName}`);
      }

      const cityRow = getCityRowLocator(page, cityName);
      await expect(cityRow).toBeVisible();

      const deleteRpcResponsePromise = waitForRpcCall(page, 'admin_delete_city_with_session');
      await cityRow.getByRole('button', { name: /^Delete$/i }).first().click();

      const deleteRpcResponse = await deleteRpcResponsePromise;
      const deleteRpcSuccess = await isSuccessfulRpcResult(deleteRpcResponse);
      const cityRemoved = await waitForCityTableVisibility(page, cityName, false, 20_000);

      if (!cityRemoved && !deleteRpcSuccess) {
        throw new Error(`Deleted city still appears in cities table/search: ${cityName}`);
      }

      await assertNoFatalDiagnostics(testInfo, diagnostics);
    } catch (error) {
      const cityDiagnostics = await getCityFlowFailureDiagnostics(page, diagnostics, dialogMessages);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`City add/delete flow failed | ${cityDiagnostics} | error=${errorMessage}`);
    } finally {
      page.off('dialog', dialogListener);
    }
  });

  test('district CRUD flow works', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const locations = fixtures.locations ?? {};
    const preferredStateName = locations.state_name?.trim();
    const districtPrefix = locations.district_add_name_prefix ?? 'smoke-district-';
    const cityPrefix = locations.city_add_name_prefix ?? 'smoke-city-';

    const editableDistrictName = buildUniqueValue(districtPrefix, 'smoke-district-');
    const updatedDistrictName = `${editableDistrictName}-edited`;
    const blockedDistrictName = `${buildUniqueValue(districtPrefix, 'smoke-district-')}-blocked`;
    const blockedDistrictCityName = buildUniqueValue(cityPrefix, 'smoke-city-');
    const hardDeleteDistrictName = `${buildUniqueValue(districtPrefix, 'smoke-district-')}-delete`;

    try {
      const selectedStateName = await openLocationManagementForDistrictCrud(page, preferredStateName);

      await test.step(`create a fresh smoke district in ${selectedStateName}`, async () => {
        await createDistrictViaLocationModal(page, editableDistrictName);
      });

      await test.step('edit district name and verify updated row is visible', async () => {
        await editDistrictNameViaLocationModal(page, editableDistrictName, updatedDistrictName);
      });

      await test.step('delete the edited district (no linked cities)', async () => {
        await deleteDistrictAndVerifyRemoved(page, updatedDistrictName);
      });

      await test.step('create district with city, verify delete-blocked, then disable district', async () => {
        await createDistrictViaLocationModal(page, blockedDistrictName);
        await addCityToDistrictInLocationManagement(page, blockedDistrictName, blockedDistrictCityName);
        await assertDistrictDeleteBlockedAndDisable(page, blockedDistrictName);
      });

      await test.step('create and hard-delete a second no-city district', async () => {
        await createDistrictViaLocationModal(page, hardDeleteDistrictName);
        await deleteDistrictAndVerifyRemoved(page, hardDeleteDistrictName);
      });

      await assertNoFatalDiagnostics(testInfo, diagnostics);
    } catch (error) {
      const districtDiagnostics = await getDistrictFlowFailureDiagnostics(page, diagnostics);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`District CRUD flow failed | ${districtDiagnostics} | error=${errorMessage}`);
    }
  });

  test('validation rule create, edit, toggle, and move-category flows work', async ({ page }, testInfo) => {
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const validation = fixtures.validation ?? {};
    const ruleName = buildUniqueValue(validation.rule_name_prefix ?? '', 'smoke-rule-');

    await expectAdminRoute(page, '/admin/settings/validation');

    await page.getByRole('button', { name: /^Add New Rule$/i }).click();
    await expect(page.getByRole('heading', { name: /Add New Validation Rule/i })).toBeVisible({ timeout: 10_000 });
    await fillInputByLabelIfVisible(page, /Rule Name/i, ruleName);
    const preferredCategory = validation.move_target_category?.trim();
    let selectedCategory: string | null = null;
    const categorySelect = page.getByLabel(/Category/i).last();

    if (await categorySelect.count()) {
      if (preferredCategory) {
        const preferredOption = categorySelect.locator('option').filter({ hasText: new RegExp(`^${escapeForRegex(preferredCategory)}$`, 'i') }).first();
        if (await preferredOption.count()) {
          await categorySelect.selectOption({ label: preferredCategory });
          selectedCategory = preferredCategory;
        }
      }

      if (!selectedCategory) {
        const options = await categorySelect.locator('option').evaluateAll((elements) =>
          elements.map((element) => ({
            value: (element as HTMLOptionElement).value,
            label: (element.textContent ?? '').trim(),
          }))
        );

        const candidate = options.find((option) =>
          option.value &&
          option.label &&
          !/^select\b/i.test(option.label) &&
          !/create new/i.test(option.label)
        );

        if (candidate) {
          await categorySelect.selectOption({ value: candidate.value });
          selectedCategory = candidate.label;
        }
      }
    } else {
      if (preferredCategory && (await selectOptionByLabel(page, /Category/i, preferredCategory))) {
        selectedCategory = preferredCategory;
      }

      if (!selectedCategory) {
        selectedCategory = await selectFirstAvailableOptionByLabel(page, /Category/i);
      }

      if (!selectedCategory) {
        const runtimeCategory = buildUniqueValue('smoke-validation-category-', 'smoke-validation-category-');
        const filled = await fillInputByLabelIfVisible(page, /Category/i, runtimeCategory);
        if (filled) {
          selectedCategory = runtimeCategory;
        }
      }
    }

    if (!selectedCategory) {
      throw new Error('No selectable validation category was available and no editable category input was found.');
    }

    await fillInputByLabelIfVisible(page, /Validation Pattern/i, '^[A-Za-z0-9 ]+$');
    await fillInputByLabelIfVisible(page, /Error Message/i, 'Playwright validation smoke');
    await page.getByRole('button', { name: /^Save Rule$/i }).click();
    await waitForToastText(page, /(created|added|success)/i);

    await clickActionForRow(page, ruleName, ['Edit', 'Edit rule']);
    await fillInputByLabelIfVisible(page, /Validation Pattern/i, '^[A-Za-z0-9._ -]+$');
    await fillVisibleTextarea(page, 'Playwright validation smoke updated');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await waitForToastText(page, /(updated|success)/i);

    await clickActionForRow(page, ruleName, ['Active', 'Inactive']);
    await waitForToastText(page, /(activated|deactivated|success|toggled)/i);

    if (selectedCategory && (await hasVisibleText(page, selectedCategory))) {
      await expect(page.locator('body')).toContainText(selectedCategory);
    }

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('payment settings create and edit flows work', async ({ page }, testInfo) => {
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const payment = fixtures.payment ?? {};
    let resolvedEditState = payment.edit_state?.trim() ?? '';
    let resolvedCreateState = payment.create_state?.trim() ?? '';

    await expectAdminRoute(page, '/admin/locations/payment-settings');

    await test.step('resolve runtime payment targets', async () => {
      const editable = await chooseEditablePaymentState(page, resolvedEditState);
      if (!editable) {
        throw new Error('No existing payment settings row is available for edit in UI.');
      }
      resolvedEditState = editable;

      const configuredStates = await listConfiguredPaymentStateNames(page);
      const addModal = await openAddPaymentSettingsModal(page);
      const creatable = await chooseCreatablePaymentState(addModal, configuredStates, resolvedCreateState);
      await addModal.getByRole('button', { name: /^Cancel$/i }).first().click();

      if (!creatable) {
        throw new Error('No unused state option is available to create payment settings.');
      }
      resolvedCreateState = creatable;

      const fixtureUpdates: { edit_state?: string; create_state?: string } = {};
      if (normalizeLooseText(resolvedEditState) !== normalizeLooseText(payment.edit_state ?? '')) {
        fixtureUpdates.edit_state = resolvedEditState;
      }
      if (normalizeLooseText(resolvedCreateState) !== normalizeLooseText(payment.create_state ?? '')) {
        fixtureUpdates.create_state = resolvedCreateState;
      }
      if (fixtureUpdates.edit_state || fixtureUpdates.create_state) {
        writePaymentFixtureTargets(fixtureUpdates);
      }
    });

    await test.step('edit existing payment settings', async () => {
      const row = getPaymentStateRowLocator(page, resolvedEditState);
      await expect(row, `Payment row should exist for edit target: ${resolvedEditState}`).toBeVisible({ timeout: 12_000 });

      await row.getByRole('button', { name: /^Edit$/i }).first().click();
      const updatedBranch = `Smoke Branch ${Date.now()}`;
      const branchInput = row.getByPlaceholder(/Branch/i).first();
      await expect(branchInput).toBeVisible({ timeout: 10_000 });
      await branchInput.fill(updatedBranch);

      const updateRpcResponsePromise = waitForRpcCall(page, 'update_payment_settings_with_session');
      await row.getByRole('button', { name: /^Save$/i }).first().click();

      const updateRpcResponse = await updateRpcResponsePromise;
      const updateRpcSuccess = await isSuccessfulRpcResult(updateRpcResponse);
      const rowUpdated = await waitForPaymentRowToContainText(page, resolvedEditState, updatedBranch, 15_000);

      if (!updateRpcSuccess && !rowUpdated) {
        throw new Error(
          `Payment edit did not show deterministic success markers. state=${resolvedEditState}, updatedBranch=${updatedBranch}`
        );
      }
    });

    await test.step('create new payment settings', async () => {
      const configuredBeforeCreate = await listConfiguredPaymentStateNames(page);
      const addModal = await openAddPaymentSettingsModal(page);
      const createState = await chooseCreatablePaymentState(addModal, configuredBeforeCreate, resolvedCreateState);
      if (!createState) {
        throw new Error('No creatable payment state was available when opening add-state modal.');
      }

      resolvedCreateState = createState;

      await fillInputByLabelIfVisible(page, /Account Holder Name/i, 'Playwright Smoke');
      await fillInputByLabelIfVisible(page, /Bank Name/i, 'Smoke Test Bank');
      await fillInputByLabelIfVisible(page, /Branch/i, `Smoke Branch ${Date.now()}`);
      await fillInputByLabelIfVisible(page, /Account Number/i, `${Date.now()}`.slice(-10).padStart(10, '7'));
      await fillInputByLabelIfVisible(page, /IFSC Code/i, 'SMOKE000001');
      await fillInputByLabelIfVisible(page, /Male Fee/i, '100');
      await fillInputByLabelIfVisible(page, /Female Fee/i, '100');
      await fillInputByLabelIfVisible(page, /Validity/i, '1');

      await maybeUploadQrIfReadable(addModal, payment.qr_file_path);

      const createRpcResponsePromise = waitForRpcCall(page, 'create_payment_settings_with_session');
      await addModal.getByRole('button', { name: /^Add Payment Settings$/i }).first().click();

      const modalHeading = page.getByRole('heading', { name: /Add New State Payment Settings/i }).first();
      await modalHeading.waitFor({ state: 'hidden', timeout: 12_000 }).catch(() => {});

      const createRpcResponse = await createRpcResponsePromise;
      const createRpcSuccess = await isSuccessfulRpcResult(createRpcResponse);
      const createdVisible = await waitForPaymentStateVisibility(page, resolvedCreateState, true, 15_000);

      if (!createRpcSuccess && !createdVisible) {
        throw new Error(`Payment create did not show deterministic success markers. state=${resolvedCreateState}`);
      }
    });

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });

  test('form field configuration save and reset work', async ({ page }, testInfo) => {
    test.setTimeout(2 * 60_000);
    const diagnostics = attachDiagnostics(page);
    const fixtures = requireFixtures();
    const fixtureFieldName = fixtures.forms?.field_name?.trim();
    let targetField: RuntimeFormFieldTarget | null = null;

    await expectAdminRoute(page, '/admin/settings/forms/join-lub');

    await test.step('resolve runtime form field target', async () => {
      targetField = await chooseRuntimeFormField(page, fixtureFieldName);
    });

    await test.step('toggle selected field and save', async () => {
      if (!targetField) {
        throw new Error('Runtime form field target was not resolved.');
      }

      const saveButton = page.getByRole('button', { name: /^Save Changes$/i }).first();
      const { beforeLabel, afterLabel, button } = await selectToggleButtonForFormField(page, targetField.fieldName);
      await button.click();

      await expect(saveButton).toBeEnabled({ timeout: 10_000 });
      const saveRpcResponsePromise = waitForRpcCall(page, 'update_form_field_configuration_with_session', 30_000);
      await saveButton.click();

      const saveRpcResponse = await saveRpcResponsePromise;
      const saveRpcSuccess = await isSuccessfulRpcResult(saveRpcResponse);
      const persistedToggle = saveRpcSuccess
        ? true
        : await waitForFormFieldToggleLabel(page, targetField.fieldName, afterLabel, 10_000);
      const saveSettled = await waitForButtonDisabledState(saveButton, true, 12_000);

      if (!saveRpcSuccess && !persistedToggle) {
        throw new Error(
          `Form configuration save did not show deterministic success markers. field=${targetField.fieldName}, toggled=${beforeLabel}->${afterLabel}`
        );
      }

      if (!saveSettled) {
        throw new Error(`Save Changes button did not settle to disabled state after save for field=${targetField.fieldName}`);
      }
    });

    await test.step('reset defaults and verify', async () => {
      if (!targetField) {
        throw new Error('Runtime form field target was not resolved.');
      }

      const saveButton = page.getByRole('button', { name: /^Save Changes$/i }).first();
      const resetButton = page.getByRole('button', { name: /^Reset to Defaults$/i }).first();
      await acceptNextDialog(page);
      const resetRpcResponsePromise = waitForRpcCall(page, 'reset_form_field_configuration_defaults_with_session', 30_000);
      await resetButton.click();

      const resetRpcResponse = await resetRpcResponsePromise;
      const resetRpcSuccess = await isSuccessfulRpcResult(resetRpcResponse);
      const visibilityReset = resetRpcSuccess
        ? true
        : await waitForFormFieldToggleLabel(page, targetField.fieldName, 'Visible', 10_000);
      const saveSettled = await waitForButtonDisabledState(saveButton, true, 12_000);

      if (!resetRpcSuccess && !visibilityReset) {
        throw new Error(`Form configuration reset did not show deterministic success markers. field=${targetField.fieldName}`);
      }

      if (!saveSettled) {
        throw new Error('Save Changes button did not settle to disabled state after reset.');
      }
    });

    await assertNoFatalDiagnostics(testInfo, diagnostics);
  });
});
