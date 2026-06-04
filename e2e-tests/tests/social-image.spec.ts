import { test, expect } from '@playwright/test';

const FACEBOOK_IMAGE_SIZE = { width: 1200, height: 630 };
const TWITTER_IMAGE_SIZE = { width: 1200, height: 600 };

function getPngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function expectGeneratedPng(request, url: string, expectedSize = FACEBOOK_IMAGE_SIZE) {
  const response = await request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.toLowerCase()).toContain('image/png');

  const body = await response.body();
  expect(body.length).toBeGreaterThan(5_000);
  expect(getPngDimensions(body)).toEqual(expectedSize);
}

async function getOgImageUrlFromPageHtml(page, request, path: string) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']?.toLowerCase()).toContain('text/html');

  const html = await response.text();
  const imageUrl = await page.evaluate((pageHtml) => {
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    return doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  }, html);
  expect(imageUrl).toBeTruthy();
  return new URL(imageUrl!);
}

test.describe('Social image generation', () => {
  test('text ref page renders encoded og:image URL and generated PNG', async ({ page, request }) => {
    const selectedVersion = 'english|The_Contemporary_Torah,_Jewish_Publication_Society,_2006';
    const pagePath = `/Genesis.1.1?ven=${encodeURIComponent(selectedVersion)}&lang=en&with=Translations&lang2=en`;

    const imageUrl = await getOgImageUrlFromPageHtml(page, request, pagePath);
    expect(imageUrl.pathname).toBe('/api/img-gen/Genesis.1.1');
    expect(imageUrl.searchParams.get('platform')).toBe('facebook');
    expect(imageUrl.searchParams.get('lang')).toBe('en');
    expect(imageUrl.searchParams.get('ven')).toBe(selectedVersion);

    await expectGeneratedPng(request, `${imageUrl.pathname}${imageUrl.search}`);
  });

  test('static page renders og:image URL and generated PNG', async ({ page, request }) => {
    const imageUrl = await getOgImageUrlFromPageHtml(page, request, '/jobs');
    expect(imageUrl.pathname).toBe('/api/img-gen/jobs');
    expect(imageUrl.searchParams.get('platform')).toBe('facebook');

    await expectGeneratedPng(request, `${imageUrl.pathname}${imageUrl.search}`);
  });

  test('direct img-gen endpoint returns generated PNG', async ({ request }) => {
    await expectGeneratedPng(request, '/api/img-gen/Genesis.1.1?lang=en&platform=facebook');
  });

  test('direct img-gen endpoint returns fallback PNG', async ({ request }) => {
    await expectGeneratedPng(request, '/api/img-gen/not-a-ref?lang=en&platform=facebook');
  });

  test('direct img-gen endpoint without path returns fallback PNG', async ({ request }) => {
    await expectGeneratedPng(request, '/api/img-gen/?lang=en&platform=facebook');
  });

  test('direct img-gen endpoint returns twitter-sized PNG', async ({ request }) => {
    await expectGeneratedPng(request, '/api/img-gen/Genesis.1.1?lang=en&platform=twitter', TWITTER_IMAGE_SIZE);
  });

  test('direct img-gen endpoint returns Hebrew ref PNG', async ({ request }) => {
    await expectGeneratedPng(request, '/api/img-gen/Genesis.1.1?lang=he&platform=facebook');
  });
});
