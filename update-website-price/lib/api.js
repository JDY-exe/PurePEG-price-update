import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const api = new WooCommerceRestApi.default({
  url: process.env.WC_API_URL,
  consumerKey: process.env.WC_KEY,
  consumerSecret: process.env.WC_SECRET,
  version: 'wc/v3'
});

let ATTRIBUTES = [];
try {
  const response = await api.get('products/attributes');
  ATTRIBUTES = response.data;
  console.log('✅ Fetched product attributes successfully.');
} catch (error) {
  console.error('❌ Failed to fetch WooCommerce attributes:', error.message);
  process.exit(1);
}

export { api, ATTRIBUTES };
