import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

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

type SummaryFixture = typeof DEFAULT_SUMMARIES;

type RowsRequest = {
  p_view_token: string;
  p_field_keys: string[] | null;
  p_limit: 25 | 50 | 100 | null;
  p_offset: number;
  p_sort_key: string | null;
  p_sort_direction: 'asc' | 'desc';
};

async function mockReportRpc(
  page: Page,
  options: {
    allowedFields?: typeof ALLOWED_FIELDS;
    summaries?: SummaryFixture;
    total?: number;
  } = {},
) {
  const rowsRequests: RowsRequest[] = [];
  let rejectNextSortedRequest = false;
  const allowedFields = options.allowedFields ?? ALLOWED_FIELDS;
  const summaries = options.summaries ?? DEFAULT_SUMMARIES;
  const total = options.total ?? 60;

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
            start_at: '2026-08-20T04:30:00.000Z',
            end_at: '2026-08-20T10:30:00.000Z',
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
    const fullRows = total === 0 ? [] : [
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
    const rows = fullRows.map((row) =>
      Object.fromEntries(requestedKeys.map((key) => [key, row[key as keyof typeof row] ?? null])),
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
          truncated: false,
        },
      }),
    });
  });

  return {
    rowsRequests,
    rejectNextSort: () => {
      rejectNextSortedRequest = true;
    },
  };
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
  });
});
