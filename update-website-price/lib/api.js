import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * API bootstrap module.
 * - Loads credentials from `.env`.
 * - Creates a shared WooCommerce API client.
 * - Resolves product attributes and shipping classes once at startup.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Shared WooCommerce REST API client for product operations.
 * @type {WooCommerceRestApi.default}
 */
const api = new WooCommerceRestApi.default({
  url: process.env.WC_API_URL,
  consumerKey: process.env.WC_KEY,
  consumerSecret: process.env.WC_SECRET,
  version: 'wc/v3'
});

/**
 * Fetches all shipping classes from the exact v2 endpoint.
 *
 * @param {string} baseUrl
 * @param {string} consumerKey
 * @param {string} consumerSecret
 * @returns {Promise<Array<Object>>}
 */
async function fetchAllShippingClasses(baseUrl, consumerKey, consumerSecret) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const endpoint = `${normalizedBaseUrl}/wp-json/wc/v2/products/shipping_classes`;
  const perPage = 100;
  let page = 1;
  let allShippingClasses = [];

  while (true) {
    const response = await axios.get(endpoint, {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        per_page: perPage,
        page
      }
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Shipping classes response was not an array.');
    }

    allShippingClasses = allShippingClasses.concat(response.data);
    if (response.data.length < perPage) {
      break;
    }

    page += 1;
  }

  return allShippingClasses;
}

/**
 * Builds case-insensitive lookup map: shipping class name -> slug.
 * Throws if duplicate names map to different slugs.
 *
 * @param {Array<{name: string, slug: string}>} shippingClasses
 * @returns {Object<string, string>}
 */
function buildShippingClassLookup(shippingClasses) {
  const map = {};

  shippingClasses.forEach(shippingClass => {
    const normalizedName = shippingClass.name?.toString().trim().toLowerCase();
    if (!normalizedName) {
      return;
    }

    const existingSlug = map[normalizedName];
    if (existingSlug && existingSlug !== shippingClass.slug) {
      throw new Error(`Duplicate shipping class name detected: "${shippingClass.name}".`);
    }

    map[normalizedName] = shippingClass.slug;
  });

  return map;
}

/**
 * Cached set of global WooCommerce attribute definitions.
 * @type {Array<Object>}
 */
let ATTRIBUTES = [];
/**
 * Cached shipping class definitions loaded at startup.
 * @type {Array<Object>}
 */
let SHIPPING_CLASSES = [];
/**
 * Case-insensitive map of shipping class name -> slug.
 * @type {Object<string, string>}
 */
let SHIPPING_CLASS_BY_NAME = {};

try {
  const response = await api.get('products/attributes');
  ATTRIBUTES = response.data;
  console.log('[OK] Fetched product attributes successfully.');
} catch (error) {
  console.error('[ERROR] Failed to fetch WooCommerce attributes:', error.message);
  process.exit(1);
}

try {
  SHIPPING_CLASSES = await fetchAllShippingClasses(
    process.env.WC_API_URL,
    process.env.WC_KEY,
    process.env.WC_SECRET
  );
  SHIPPING_CLASS_BY_NAME = buildShippingClassLookup(SHIPPING_CLASSES);
  console.log(`[OK] Fetched ${SHIPPING_CLASSES.length} shipping class(es) successfully.`);
} catch (error) {
  console.error('[ERROR] Failed to fetch WooCommerce shipping classes:', error.message);
  process.exit(1);
}

export { api, ATTRIBUTES, SHIPPING_CLASSES, SHIPPING_CLASS_BY_NAME };
