import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

const REPORT_TOKEN = 'a'.repeat(32);
const VIEW_TOKEN = 'b'.repeat(32);
const ALLOWED_FIELDS = [
  { key: 'full_name', label: 'Name' },
  { key: 'company', label: 'Company / Organization' },
  { key: 'badge_code', label: 'Badge Number' },
];

type RowsRequest = {
  p_view_token: string;
  p_field_keys: string[] | null;
  p_limit: 25 | 50 | 100 | null;
  p_offset: number;
  p_sort_key: string | null;
  p_sort_direction: 'asc' | 'desc';
};

async function mockReportRpc(page: Page) {
  const rowsRequests: RowsRequest[] = [];
  let rejectNextSortedRequest = false;

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
          fields: ALLOWED_FIELDS,
          total: 60,
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

    const requestedKeys = body.p_field_keys ?? ALLOWED_FIELDS.map((field) => field.key);
    const fields = ALLOWED_FIELDS.filter((field) => requestedKeys.includes(field.key));
    const fullRows = [
      { full_name: '=2+2', company: 'Sensitive Formula Co', badge_code: 'EVT-0001' },
      { full_name: 'Anita Rao', company: 'Anita Industries', badge_code: 'EVT-0002' },
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
          total: 60,
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

    await page.getByLabel('Password').fill('Committee7');
    await page.getByRole('button', { name: 'View report' }).click();

    await expect(page.getByRole('heading', { name: 'Vendor Development Programme' })).toBeVisible();
    await expect(page.getByText('LUB Hall, Hyderabad')).toBeVisible();
    await expect(page.getByLabel('Rows')).toHaveValue('50');
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Company / Organization' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Badge Number' })).toBeVisible();

    await expect.poll(() => rowsRequests.length).toBeGreaterThan(0);
    expect(rowsRequests[0]).toMatchObject({
      p_view_token: VIEW_TOKEN,
      p_field_keys: ['full_name', 'company', 'badge_code'],
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
    await page.getByRole('button', { name: /Columns \(3\/3\)/ }).click();
    await page.getByLabel('Company / Organization').uncheck();
    await expect(page.getByRole('columnheader', { name: 'Company / Organization' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Columns \(2\/3\)/ })).toBeVisible();
    await expect
      .poll(() =>
        rowsRequests
          .slice(requestsBeforeHidingSortedField)
          .some((request) => request.p_sort_key === null && request.p_offset === 0),
      )
      .toBe(true);

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
    expect(csv).toContain('Name,Badge Number');
    expect(csv).not.toContain('Company / Organization');
    expect(csv).not.toContain('Sensitive Formula Co');
    expect(csv).toContain("'=2+2,EVT-0001");

    const downloadRequest = rowsRequests.at(-1);
    expect(downloadRequest).toMatchObject({
      p_field_keys: ['full_name', 'badge_code'],
      p_limit: null,
      p_offset: 0,
      p_sort_key: 'full_name',
      p_sort_direction: 'desc',
    });
  });
});
