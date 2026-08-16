import { readFileSync } from 'node:fs';

import { expect, test, type Download, type Page, type Route } from '@playwright/test';
import JSZip from 'jszip';

const REPORT_TOKEN = 'a'.repeat(32);
const VIEW_TOKEN = 'b'.repeat(32);
const ALLOWED_FIELDS = [
  { key: 'full_name', label: 'Name' },
  { key: 'company', label: 'Company / Organization' },
  { key: 'gender', label: 'Gender' },
  { key: 'meal_preference', label: 'Meal Preference' },
  { key: 'badge_code', label: 'Badge Number' },
];
const DEFAULT_SUMMARIES = [
  {
    key: 'gender',
    label: 'Gender',
    items: [
      { value: 'male', count: 20 },
      { value: 'female', count: 9 },
      { value: null, count: 31 },
    ],
  },
  {
    key: 'meal_preference',
    label: 'Meal Preference',
    items: [
      { value: 'veg', count: 40 },
      { value: 'non_veg', count: 20 },
    ],
  },
];

/** Mirrors BADGE_SAVE_HINT in src/pages/EventPublicReport.tsx. */
const BADGE_SAVE_HINT = "Use the Save badge ZIP link below, or look for it in your browser's downloads.";

const DEFAULT_ROWS: Array<Record<string, string | null>> = [
  {
    full_name: '=2+2',
    company: 'Sensitive Formula Co',
    gender: 'male',
    meal_preference: 'veg',
    badge_code: 'EVT-0001',
  },
  {
    full_name: 'Anita Rao',
    company: 'Anita Industries',
    gender: null,
    meal_preference: 'non_veg',
    badge_code: 'EVT-0002',
  },
];

type SummaryFixture = typeof DEFAULT_SUMMARIES;

type RowsRequest = {
  p_view_token: string;
  p_field_keys: string[] | null;
  p_limit: 25 | 50 | 100 | null;
  p_offset: number;
  p_sort_key: string | null;
  p_sort_direction: 'asc' | 'desc';
};

type BulkRowsMode = 'normal' | 'truncated' | 'fields_changed';

async function mockReportRpc(
  page: Page,
  options: {
    allowedFields?: typeof ALLOWED_FIELDS;
    summaries?: SummaryFixture;
    total?: number;
    eventStartAt?: string | null;
    eventEndAt?: string | null;
    bulkRowsMode?: BulkRowsMode;
    badgeStatuses?: Record<string, number[]>;
    /** Holds every badge response in flight for this long before answering. */
    badgeDelayMs?: number;
    rows?: Array<Record<string, string | null>>;
  } = {},
) {
  const rowsRequests: RowsRequest[] = [];
  const badgeRequests: string[] = [];
  const badgeAttempts = new Map<string, number>();
  let rejectNextSortedRequest = false;
  let invalidateNextRowsRequest = false;
  let removeBadgeOnNextRowsRequest = false;
  const allowedFields = options.allowedFields ?? ALLOWED_FIELDS;
  const summaries = options.summaries ?? DEFAULT_SUMMARIES;
  const total = options.total ?? 60;

  await page.route('**/functions/v1/event-badge-download?**', async (route: Route) => {
    const code = (new URL(route.request().url()).searchParams.get('code') ?? '').toUpperCase();
    badgeRequests.push(code);
    const attempt = badgeAttempts.get(code) ?? 0;
    badgeAttempts.set(code, attempt + 1);
    const statuses = options.badgeStatuses?.[code] ?? [200];
    const status = statuses[Math.min(attempt, statuses.length - 1)] ?? 200;

    if (options.badgeDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.badgeDelayMs));
    }

    if (status === 200) {
      await route.fulfill({
        status,
        contentType: 'image/jpeg',
        body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      });
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error_code: status === 410 ? 'event_ended' : 'badge_unavailable' }),
    });
  });

  await page.route('**/rest/v1/rpc/open_public_event_report', async (route: Route) => {
    const body = route.request().postDataJSON() as { p_token?: string; p_password?: string };
    if (body.p_token !== REPORT_TOKEN || body.p_password !== 'Committee7') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error_code: 'access_denied',
          error: 'Invalid report link or password',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          view_token: VIEW_TOKEN,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          event: {
            title: 'Vendor Development Programme',
            location: 'LUB Hall, Hyderabad',
            start_at: options.eventStartAt === undefined ? '2099-08-20T04:30:00.000Z' : options.eventStartAt,
            end_at: options.eventEndAt === undefined ? '2099-08-20T10:30:00.000Z' : options.eventEndAt,
          },
          fields: allowedFields,
          total,
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/get_public_event_report_rows', async (route: Route) => {
    const body = route.request().postDataJSON() as RowsRequest;
    rowsRequests.push(body);

    if (invalidateNextRowsRequest) {
      invalidateNextRowsRequest = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error_code: 'view_session_invalid',
          error: 'Report view session is no longer valid',
        }),
      });
      return;
    }

    if (removeBadgeOnNextRowsRequest) {
      removeBadgeOnNextRowsRequest = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error_code: 'fields_changed',
          error: 'The available report fields changed',
          data: { fields: allowedFields.filter((field) => field.key !== 'badge_code') },
        }),
      });
      return;
    }

    const isBulkBadgeRequest =
      body.p_limit === null &&
      body.p_offset === 0 &&
      body.p_sort_key === 'badge_code' &&
      body.p_field_keys?.length === 1 &&
      body.p_field_keys[0] === 'badge_code';

    if (isBulkBadgeRequest && options.bulkRowsMode === 'fields_changed') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error_code: 'fields_changed',
          error: 'The available report fields changed',
          data: { fields: allowedFields.filter((field) => field.key !== 'badge_code') },
        }),
      });
      return;
    }

    if (rejectNextSortedRequest && body.p_sort_key) {
      rejectNextSortedRequest = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error_code: 'invalid_sort_key',
          error: 'Sort field is not available in this report view',
        }),
      });
      return;
    }

    const requestedKeys = body.p_field_keys ?? allowedFields.map((field) => field.key);
    const fields = allowedFields.filter((field) => requestedKeys.includes(field.key));
    const fullRows = total === 0 ? [] : options.rows ?? DEFAULT_ROWS;
    const rows = fullRows.map((row) =>
      Object.fromEntries(requestedKeys.map((key) => [key, row[key] ?? null])),
    );

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          fields,
          rows,
          summaries,
          total,
          limit: body.p_limit,
          offset: body.p_offset,
          truncated: isBulkBadgeRequest && options.bulkRowsMode === 'truncated',
        },
      }),
    });
  });

  return {
    rowsRequests,
    badgeRequests,
    rejectNextSort: () => {
      rejectNextSortedRequest = true;
    },
    invalidateNextRowsSession: () => {
      invalidateNextRowsRequest = true;
    },
    removeBadgeOnNextRows: () => {
      removeBadgeOnNextRowsRequest = true;
    },
  };
}

/**
 * Direct browser probe of an object URL. A live blob URL answers with its bytes;
 * a revoked one cannot be fetched at all, which is the difference between the
 * save link being hidden and the file actually being released.
 */
async function probeObjectUrl(page: Page, objectUrl: string): Promise<{ ok: boolean; size: number }> {
  return page.evaluate(async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return { ok: false, size: 0 };
      const blob = await response.blob();
      return { ok: true, size: blob.size };
    } catch {
      return { ok: false, size: 0 };
    }
  }, objectUrl);
}

async function openReport(page: Page) {
  await page.goto(`/r/${REPORT_TOKEN}`);
  await page.getByLabel('Password').fill('Committee7');
  await page.getByRole('button', { name: 'View report' }).click();
  await expect(page.getByRole('heading', { name: 'Vendor Development Programme' })).toBeVisible();
}

test.describe('public event registration report', () => {
  test('pins the not-specified summary bucket after named values in the deployed RPC definition', () => {
    const migration = readFileSync(
      'supabase/migrations/20260812103000_public_event_report_summary_null_bucket_order.sql',
      'utf8',
    );
    expect(migration).toContain('(counts.normalized_value IS NULL) ASC');
    expect(migration).toContain('counts.response_count DESC');
  });

  test('gates metadata and supports pagination, field narrowing, and exact-column CSV', async ({ page }) => {
    const reportMock = await mockReportRpc(page);
    const { rowsRequests } = reportMock;
    await page.goto(`/r/${REPORT_TOKEN}`);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { name: 'Registration report' })).toBeVisible();
    await expect(page.getByText('Vendor Development Programme')).toHaveCount(0);

    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'View report' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect password');
    await expect(page.getByText('Vendor Development Programme')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Registration summary' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toHaveCount(0);

    await page.getByLabel('Password').fill('Committee7');
    await page.getByRole('button', { name: 'View report' }).click();

    await expect(page.getByRole('heading', { name: 'Vendor Development Programme' })).toBeVisible();
    await expect(page.getByText('LUB Hall, Hyderabad')).toBeVisible();
    await expect(page.getByLabel('Rows')).toHaveValue('50');
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Company / Organization' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Gender' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Meal Preference' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Badge Number' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download badge EVT-0001' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download badge EVT-0002' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeEnabled();

    const summarySection = page.getByRole('region', { name: 'Registration summary' });
    await expect(summarySection).toBeVisible();
    const genderCard = summarySection.getByRole('heading', { name: 'Gender' }).locator('..');
    await expect(genderCard).toBeVisible();
    await expect(genderCard.locator('dt')).toHaveText(['Male', 'Female', 'Not specified']);
    await expect(summarySection.getByText('Male', { exact: true })).toBeVisible();
    await expect(summarySection.getByText('Female', { exact: true })).toBeVisible();
    await expect(summarySection.getByText('Not specified', { exact: true })).toBeVisible();
    await expect(summarySection.getByRole('heading', { name: 'Meal Preference' })).toBeVisible();
    await expect(summarySection.getByText('Veg', { exact: true })).toBeVisible();
    await expect(summarySection.getByText('Non Veg', { exact: true })).toBeVisible();
    await expect(summarySection.getByText('40', { exact: true })).toBeVisible();

    await expect.poll(() => rowsRequests.length).toBeGreaterThan(0);
    expect(rowsRequests[0]).toMatchObject({
      p_view_token: VIEW_TOKEN,
      p_field_keys: ['full_name', 'company', 'gender', 'meal_preference', 'badge_code'],
      p_limit: 50,
      p_offset: 0,
      p_sort_key: null,
      p_sort_direction: 'asc',
    });
    expect(rowsRequests[0].p_field_keys).not.toContain('email');
    expect(rowsRequests[0].p_field_keys).not.toContain('aadhaar_number');

    const [singleBadgeDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download badge EVT-0001' }).click(),
    ]);
    expect(singleBadgeDownload.suggestedFilename()).toBe('event-badge-EVT-0001.jpg');
    const singleBadgePath = await singleBadgeDownload.path();
    expect(singleBadgePath).not.toBeNull();
    expect(readFileSync(singleBadgePath as string)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const requestsBeforeBulk = rowsRequests.length;
    const [badgeZipDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download all badges (ZIP)' }).click(),
    ]);
    expect(badgeZipDownload.suggestedFilename()).toMatch(
      /^event-badges-vendor-development-programme-\d{4}-\d{2}-\d{2}\.zip$/,
    );
    const badgeZipPath = await badgeZipDownload.path();
    expect(badgeZipPath).not.toBeNull();
    const badgeZip = await JSZip.loadAsync(readFileSync(badgeZipPath as string));
    expect(Object.keys(badgeZip.files).sort()).toEqual([
      'badges/',
      'badges/0001-badge-EVT-0001.jpg',
      'badges/0002-badge-EVT-0002.jpg',
    ]);
    expect(
      rowsRequests.slice(requestsBeforeBulk).some(
        (request) =>
          request.p_view_token === VIEW_TOKEN &&
          request.p_field_keys?.length === 1 &&
          request.p_field_keys[0] === 'badge_code' &&
          request.p_limit === null &&
          request.p_offset === 0 &&
          request.p_sort_key === 'badge_code' &&
          request.p_sort_direction === 'asc',
      ),
    ).toBe(true);
    await expect(
      page.getByText(`Badge ZIP ready with all 2 badges. ${BADGE_SAVE_HINT}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveAttribute(
      'download',
      badgeZipDownload.suggestedFilename(),
    );

    await page.getByRole('button', { name: 'Next' }).click();
    await expect.poll(() => rowsRequests.some((request) => request.p_offset === 50)).toBe(true);

    const nameHeader = page.getByRole('columnheader', { name: 'Name' });
    const nameSortIcon = nameHeader.getByRole('button', { name: 'Name' }).locator('svg');
    await expect(nameSortIcon).toHaveCSS('width', '10px');
    await expect(nameSortIcon).toHaveCSS('height', '10px');
    await nameHeader.getByRole('button', { name: 'Name' }).click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect
      .poll(() =>
        rowsRequests.some(
          (request) =>
            request.p_sort_key === 'full_name' &&
            request.p_sort_direction === 'asc' &&
            request.p_offset === 0,
        ),
      )
      .toBe(true);

    await nameHeader.getByRole('button', { name: 'Name' }).click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    await expect
      .poll(() =>
        rowsRequests.some(
          (request) => request.p_sort_key === 'full_name' && request.p_sort_direction === 'desc',
        ),
      )
      .toBe(true);

    await expect(page.locator('tbody td').first()).toHaveCSS('white-space', 'nowrap');

    const requestsBeforeRejectedSort = rowsRequests.length;
    reportMock.rejectNextSort();
    await page.getByRole('columnheader', { name: 'Badge Number' }).getByRole('button').click();
    await expect
      .poll(() =>
        rowsRequests
          .slice(requestsBeforeRejectedSort)
          .some((request) => request.p_sort_key === null && request.p_offset === 0),
      )
      .toBe(true);
    await expect(page.getByRole('columnheader', { name: 'Badge Number' })).toHaveAttribute('aria-sort', 'none');

    await page.getByLabel('Rows').selectOption('25');
    await expect.poll(() => rowsRequests.some((request) => request.p_limit === 25 && request.p_offset === 0)).toBe(true);
    await page.getByLabel('Rows').selectOption('100');
    await expect.poll(() => rowsRequests.some((request) => request.p_limit === 100)).toBe(true);
    await page.getByLabel('Rows').selectOption('all');
    await expect.poll(() => rowsRequests.some((request) => request.p_limit === null)).toBe(true);

    await page.getByRole('columnheader', { name: 'Company / Organization' }).getByRole('button').click();
    await expect(page.getByRole('columnheader', { name: 'Company / Organization' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const requestsBeforeHidingSortedField = rowsRequests.length;
    await page.getByRole('button', { name: /Columns \(5\/5\)/ }).click();
    await page.getByLabel('Company / Organization').uncheck();
    await expect(page.getByRole('columnheader', { name: 'Company / Organization' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Columns \(4\/5\)/ })).toBeVisible();
    await expect
      .poll(() =>
        rowsRequests
          .slice(requestsBeforeHidingSortedField)
          .some((request) => request.p_sort_key === null && request.p_offset === 0),
      )
      .toBe(true);

    await page.getByLabel('Gender').uncheck();
    await expect(page.getByRole('columnheader', { name: 'Gender' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Columns \(3\/5\)/ })).toBeVisible();
    await expect(summarySection.getByRole('heading', { name: 'Gender' })).toBeVisible();
    await expect(summarySection.getByText('Male', { exact: true })).toBeVisible();

    await page.getByLabel('Badge Number').uncheck();
    await expect(page.getByRole('columnheader', { name: 'Badge Number' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeVisible();
    await page.getByLabel('Badge Number').check();
    await expect(page.getByRole('columnheader', { name: 'Badge Number' })).toBeVisible();

    await nameHeader.getByRole('button', { name: 'Name' }).click();
    await nameHeader.getByRole('button', { name: 'Name' }).click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download all 60 registrations \(CSV\)/ }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const csv = readFileSync(downloadPath as string, 'utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Name,Meal Preference,Badge Number');
    expect(csv).not.toContain('Company / Organization');
    expect(csv).not.toContain('Gender');
    expect(csv).not.toContain('Sensitive Formula Co');
    expect(csv).toContain("'=2+2,Veg,EVT-0001");

    const downloadRequest = rowsRequests.at(-1);
    expect(downloadRequest).toMatchObject({
      p_field_keys: ['full_name', 'meal_preference', 'badge_code'],
      p_limit: null,
      p_offset: 0,
      p_sort_key: 'full_name',
      p_sort_direction: 'desc',
    });
  });

  test('retries an individual badge only for a transient server failure', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      badgeStatuses: { 'EVT-0001': [500, 200] },
    });
    await openReport(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download badge EVT-0001' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('event-badge-EVT-0001.jpg');
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0001')).toHaveLength(2);
  });

  test('creates an honestly labelled partial ZIP and does not retry a permanent badge error', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      badgeStatuses: { 'EVT-0002': [404] },
    });
    await openReport(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download all badges (ZIP)' }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zip = await JSZip.loadAsync(readFileSync(downloadPath as string));
    expect(Object.keys(zip.files).sort()).toEqual(['badges/', 'badges/0001-badge-EVT-0001.jpg']);
    await expect(
      page.getByText(`Badge ZIP ready with 1 of 2 badges; 1 could not be fetched. ${BADGE_SAVE_HINT}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0002')).toHaveLength(1);
  });

  test('keeps the generated ZIP saveable from the fallback link without regenerating it', async ({
    page,
  }) => {
    const reportMock = await mockReportRpc(page);
    await openReport(page);

    // The automatic attempt is best effort; Playwright observes it here, but the
    // page must not depend on the browser having accepted it.
    const [automaticDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download all badges (ZIP)' }).click(),
    ]);
    const zipFileName = automaticDownload.suggestedFilename();
    expect(zipFileName).toMatch(
      /^event-badges-vendor-development-programme-\d{4}-\d{2}-\d{2}\.zip$/,
    );

    await expect(
      page.getByText(`Badge ZIP ready with all 2 badges. ${BADGE_SAVE_HINT}`, { exact: true }),
    ).toBeVisible();
    const saveLink = page.getByRole('link', { name: 'Save badge ZIP' });
    await expect(saveLink).toBeVisible();
    await expect(saveLink).toHaveAttribute('download', zipFileName);
    // The save action is a sibling of the polite live region, not part of the
    // announcement, and it never pulls focus to itself.
    await expect(page.locator('[role="status"]').getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    await expect(saveLink).not.toBeFocused();

    const rowsRequestsBeforeSave = reportMock.rowsRequests.length;
    const badgeRequestsBeforeSave = reportMock.badgeRequests.length;

    const [fallbackDownload] = await Promise.all([
      page.waitForEvent('download'),
      saveLink.click(),
    ]);
    expect(fallbackDownload.suggestedFilename()).toBe(zipFileName);
    const fallbackPath = await fallbackDownload.path();
    expect(fallbackPath).not.toBeNull();
    const fallbackZip = await JSZip.loadAsync(readFileSync(fallbackPath as string));
    expect(Object.keys(fallbackZip.files).sort()).toEqual([
      'badges/',
      'badges/0001-badge-EVT-0001.jpg',
      'badges/0002-badge-EVT-0002.jpg',
    ]);

    // The already-generated ZIP is handed straight to the browser: no rows RPC
    // and no badge render is issued a second time.
    expect(reportMock.rowsRequests).toHaveLength(rowsRequestsBeforeSave);
    expect(reportMock.badgeRequests).toHaveLength(badgeRequestsBeforeSave);
    // Saving does not consume the file - the link stays available.
    await expect(saveLink).toBeVisible();
    await expect(
      page.getByText(`Badge ZIP ready with all 2 badges. ${BADGE_SAVE_HINT}`, { exact: true }),
    ).toBeVisible();
  });

  test('strands an in-flight bulk run when the badge window closes before the badges arrive', async ({
    page,
  }) => {
    // The whole point is real elapsed time: the deadline has to fall between the
    // badge requests going out and their responses coming back.
    test.setTimeout(150_000);
    const badgeWindowMs = 12 * 60 * 60 * 1000;
    const deadlineDelayMs = 15_000;
    const now = Date.now();
    const reportMock = await mockReportRpc(page, {
      eventStartAt: new Date(now - badgeWindowMs - 60_000).toISOString(),
      eventEndAt: new Date(now - badgeWindowMs + deadlineDelayMs).toISOString(),
      badgeDelayMs: 30_000,
    });
    await openReport(page);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));

    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeEnabled();
    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();

    // Genuinely mid-flight: both renders were requested and neither has answered.
    await expect.poll(() => reportMock.badgeRequests.length).toBe(2);
    await expect(page.getByRole('button', { name: /Preparing badges 0\/2/ })).toBeVisible();

    // The client deadline shuts while those responses are still outstanding -
    // the per-row links go first, and the run is still busy behind them.
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Preparing badges 0\/2/ })).toBeVisible();

    // The run then completes and produces a ZIP that is no longer authorized.
    // The button reverting to its idle label is the end-of-run signal.
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeDisabled({
      timeout: 90_000,
    });
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    await expect(page.getByText(/Badge ZIP ready/)).toHaveCount(0);
    expect(downloads).toHaveLength(0);
  });

  test('drops an already-ready badge ZIP when the report session is invalidated', async ({ page }) => {
    const reportMock = await mockReportRpc(page);
    await openReport(page);

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download all badges (ZIP)' }).click(),
    ]);
    const saveLink = page.getByRole('link', { name: 'Save badge ZIP' });
    await expect(saveLink).toBeVisible();

    // Capture the object URL while it is still held, and confirm the probe can
    // actually read it - otherwise "unfetchable afterwards" would prove nothing.
    const capturedHref = await saveLink.getAttribute('href');
    expect(capturedHref).toMatch(/^blob:/);
    const zipObjectUrl = capturedHref as string;
    const liveProbe = await probeObjectUrl(page, zipObjectUrl);
    expect(liveProbe.ok).toBe(true);
    expect(liveProbe.size).toBeGreaterThan(0);

    // A real release transition rather than a simulated one: the next rows
    // request loses the view session, which sends the page back to the gate.
    reportMock.invalidateNextRowsSession();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Registration report' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Your report session expired');
    await expect(saveLink).toHaveCount(0);
    await expect(page.getByText(/Badge ZIP ready/)).toHaveCount(0);

    // The file is released, not merely unlinked: the captured URL no longer
    // resolves to any blob in this document.
    await expect
      .poll(async () => (await probeObjectUrl(page, zipObjectUrl)).ok, {
        message: 'the captured badge ZIP object URL should be revoked, not just hidden',
      })
      .toBe(false);
  });

  test('explains when Badge Number is removed while badge files are still arriving', async ({ page }) => {
    test.setTimeout(60_000);
    const reportMock = await mockReportRpc(page, { badgeDelayMs: 10_000 });
    await openReport(page);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));

    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect.poll(() => reportMock.badgeRequests.length).toBe(2);
    await expect(page.getByRole('button', { name: /Preparing badges 0\/2/ })).toBeVisible();

    reportMock.removeBadgeOnNextRows();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(
      page.getByText(
        'The organiser changed this report while you were viewing it. Badge downloads are no longer available for this report.',
        { exact: true },
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    await expect(page.getByText(/Badge ZIP ready/)).toHaveCount(0);
    expect(downloads).toHaveLength(0);
  });

  test('creates no ZIP when every badge fails permanently', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      badgeStatuses: {
        'EVT-0001': [404],
        'EVT-0002': [404],
      },
    });
    await openReport(page);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));

    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect(
      page.getByText(
        'No badges could be downloaded, so no ZIP file was created. Check your connection and try again.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(downloads).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    // A 404 is a permanent answer, so neither code is retried.
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0001')).toHaveLength(1);
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0002')).toHaveLength(1);
    // The window is still open, so the action stays available for a retry.
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeEnabled();
  });

  test('renders blank and unusable Badge Number cells as plain text with no badge link', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      total: 3,
      rows: [
        {
          full_name: 'Blank Badge',
          company: 'Blank Co',
          gender: 'male',
          meal_preference: 'veg',
          badge_code: '   ',
        },
        {
          full_name: 'Missing Badge',
          company: 'Missing Co',
          gender: 'female',
          meal_preference: 'veg',
          badge_code: null,
        },
        {
          full_name: 'Unusable Badge',
          company: 'Unusable Co',
          gender: 'male',
          meal_preference: 'non_veg',
          badge_code: 'EVT 0003',
        },
      ],
    });
    await openReport(page);

    const badgeColumn = ALLOWED_FIELDS.findIndex((field) => field.key === 'badge_code') + 1;
    const badgeCells = page.locator(`tbody tr td:nth-child(${badgeColumn})`);
    // Blank and null both fall back to the em dash; a code that cannot be
    // normalized stays readable text rather than becoming a broken link.
    await expect(badgeCells).toHaveText(['—', '—', 'EVT 0003']);
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(badgeCells.getByRole('link')).toHaveCount(0);

    // The bulk action stays authorized; it simply finds nothing to fetch.
    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect(
      page.getByText('There are no badge numbers to download for this event yet.', { exact: true }),
    ).toBeVisible();
    expect(reportMock.badgeRequests).toHaveLength(0);
  });

  test('refuses an incomplete bulk set when the report rows response is truncated', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      total: 10_001,
      bulkRowsMode: 'truncated',
    });
    await openReport(page);

    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect(page.getByText(/above the 10,000 row limit.*No ZIP file was created/)).toBeVisible();
    expect(reportMock.badgeRequests).toHaveLength(0);
    expect(reportMock.rowsRequests.at(-1)).toMatchObject({
      p_view_token: VIEW_TOKEN,
      p_field_keys: ['badge_code'],
      p_limit: null,
      p_offset: 0,
      p_sort_key: 'badge_code',
      p_sort_direction: 'asc',
    });
  });

  test('removes badge actions and explains when the organiser removes Badge Number', async ({ page }) => {
    const reportMock = await mockReportRpc(page, { bulkRowsMode: 'fields_changed' });
    await openReport(page);

    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(page.getByText(/Badge downloads are no longer available for this report/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    expect(reportMock.badgeRequests).toHaveLength(0);
  });

  test('disables badge actions after the event badge window closes', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      eventStartAt: '2020-08-20T04:30:00.000Z',
      eventEndAt: '2020-08-20T10:30:00.000Z',
    });
    await openReport(page);

    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toBeVisible();
    expect(reportMock.badgeRequests).toHaveLength(0);
  });

  test('closes the badge window in place when the deadline passes while the report is open', async ({
    page,
  }) => {
    // Mirrors BADGE_WINDOW_MS: the deadline is COALESCE(end_at, start_at) + 12h,
    // placed a few seconds out so the boundary is crossed during the test.
    const badgeWindowMs = 12 * 60 * 60 * 1000;
    const now = Date.now();
    await mockReportRpc(page, {
      eventStartAt: new Date(now - badgeWindowMs - 60_000).toISOString(),
      eventEndAt: new Date(now - badgeWindowMs + 10_000).toISOString(),
    });
    await openReport(page);

    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Download badge EVT-0001' })).toBeVisible();

    // No reload and no polling: a single timer wakes the page at the deadline.
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
  });

  test('opens the report closed when the deadline passes while the viewer is still at the gate', async ({
    page,
  }) => {
    // The page clock is captured when the gate mounts, before the event is
    // known. Waiting past the deadline at the gate makes that clock stale by
    // the time the report renders - the window must still read as closed.
    const badgeWindowMs = 12 * 60 * 60 * 1000;
    const deadlineDelayMs = 4_000;
    const now = Date.now();
    const reportMock = await mockReportRpc(page, {
      eventStartAt: new Date(now - badgeWindowMs - 60_000).toISOString(),
      eventEndAt: new Date(now - badgeWindowMs + deadlineDelayMs).toISOString(),
    });

    await page.goto(`/r/${REPORT_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Registration report' })).toBeVisible();
    await page.waitForTimeout(deadlineDelayMs + 1_500);

    await page.getByLabel('Password').fill('Committee7');
    await page.getByRole('button', { name: 'View report' }).click();
    await expect(page.getByRole('heading', { name: 'Vendor Development Programme' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Download badge/ })).toHaveCount(0);
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toBeVisible();
    expect(reportMock.badgeRequests).toHaveLength(0);
  });

  test('stops bulk processing and creates no ZIP when the renderer returns 410', async ({ page }) => {
    const reportMock = await mockReportRpc(page, {
      badgeStatuses: {
        'EVT-0001': [410],
        'EVT-0002': [410],
      },
    });
    await openReport(page);

    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));

    await page.getByRole('button', { name: 'Download all badges (ZIP)' }).click();
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toBeDisabled();
    expect(downloads).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Save badge ZIP' })).toHaveCount(0);
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0001').length).toBeLessThanOrEqual(1);
    expect(reportMock.badgeRequests.filter((code) => code === 'EVT-0002').length).toBeLessThanOrEqual(1);
  });

  test('shows an empty authorized summary and hides the section when no summary fields are allowed', async ({
    page,
  }) => {
    await mockReportRpc(page, {
      allowedFields: [{ key: 'gender', label: 'Gender' }],
      summaries: [{ key: 'gender', label: 'Gender', items: [] }],
      total: 0,
    });
    await page.goto(`/r/${REPORT_TOKEN}`);
    await page.getByLabel('Password').fill('Committee7');
    await page.getByRole('button', { name: 'View report' }).click();

    const summarySection = page.getByRole('region', { name: 'Registration summary' });
    await expect(summarySection).toBeVisible();
    await expect(summarySection.getByText('No responses', { exact: true })).toBeVisible();

    await page.unrouteAll({ behavior: 'wait' });
    await page.evaluate(() => sessionStorage.clear());
    await mockReportRpc(page, {
      allowedFields: [{ key: 'full_name', label: 'Name' }],
      summaries: [],
    });
    await page.goto(`/r/${REPORT_TOKEN}`);
    await page.getByLabel('Password').fill('Committee7');
    await page.getByRole('button', { name: 'View report' }).click();

    await expect(page.getByRole('heading', { name: 'Registration summary' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download all badges (ZIP)' })).toHaveCount(0);
    await expect(page.getByText('Badge downloads are closed for this event.', { exact: true })).toHaveCount(0);
  });
});
