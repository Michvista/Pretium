import { extractProductFromLink } from '../src/services/linkExtractor';

const HTML = `<!doctype html>
<html>
<head>
  <title>Nike Air Force 1 &amp; White</title>
  <meta property="og:title" content="Nike Air Force 1 &amp; White">
  <meta property="og:site_name" content="Example Store">
  <meta property="og:description" content="Classic sneaker">
  <meta property="og:image" content="https://img.example.com/shoe.png">
  <meta property="og:price:amount" content="129.99">
  <meta property="og:price:currency" content="USD">
</head>
</html>`;

describe('extractProductFromLink', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps Open Graph tags onto a Product', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(HTML) })
    ) as jest.Mock;

    const product = await extractProductFromLink('https://example.com/product');
    expect(product).toMatchObject({
      name: 'Nike Air Force 1 & White',
      brand: 'Example Store',
      description: 'Classic sneaker',
      imageUrl: 'https://img.example.com/shoe.png',
      price: 129.99,
      currency: 'USD',
      source: 'link',
      sourceUrl: 'https://example.com/product',
    });
  });

  it('throws when the URL is unreachable', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 })) as jest.Mock;
    await expect(extractProductFromLink('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('throws when no og:title is present', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>nothing</body></html>') })
    ) as jest.Mock;
    await expect(extractProductFromLink('https://example.com/nothing')).rejects.toThrow(
      'No product title'
    );
  });
});