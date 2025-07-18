import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

console.clear();
// Root folder is passed in as argument
const rootFolder = process.argv[2];
if (!rootFolder) {
  console.error("❌ Please pass the working folder path.");
  process.exit(1);
}

const META_DIR = path.join(__dirname, 'meta');
fs.mkdirSync(META_DIR, { recursive: true });

// Step 1: Prompt for Excel file
const files = fs.readdirSync(rootFolder).filter(f => (f.endsWith('.xlsm') || f.endsWith('.xlsx')));
if (files.length === 0) {
  console.error('❌ No .xlsm files found in folder:', rootFolder);
  process.exit(1);
}

const { selectedFile } = await inquirer.prompt([
  {
    type: 'list',
    name: 'selectedFile',
    message: '📂 Select the Excel file to process:\nNote: First sheet in excel file has to be the master database\n\n',
    choices: files
  }
]);

const workbook = XLSX.readFile(path.join(rootFolder, selectedFile));
const firstSheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
const master_data = firstSheet.splice(0, 20);



const api = new WooCommerceRestApi.default({
  url: process.env.WC_API_URL,
  consumerKey: process.env.WC_KEY,
  consumerSecret: process.env.WC_SECRET,
  version: 'wc/v3'
});

const CACHE_FILE = path.join(META_DIR, 'id_cache.json');
const LOG_FILE = path.join(META_DIR, 'price_update_log.csv');
const DEBUG_FILE = path.join(META_DIR, 'debug.csv');
const BAR_LENGTH = 40;

let itemCache = {};
if (fs.existsSync(CACHE_FILE)) {
  itemCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`⚡ Loaded ${Object.keys(itemCache).length} cached item(s)`);
}

const updatedItems = [];
const errors = [];

for (const [index, product] of master_data.entries()) {
  updateProgressBar(index, master_data.length);
  const itemNumber = product["Catalog Number"];
  const sku = product.Item;
  const masterPrice = product["List Price"];

  //If item is cached
  if (itemCache[itemNumber]) {
    const { productId, variationId, price } = itemCache[itemNumber];
    if (!price || price != masterPrice) {
      await api.put(`products/${productId}/variations/${variationId}`, {
        regular_price: masterPrice.toFixed(2)
      });

      updatedItems.push({
        itemNumber,
        variationId,
        sku,
        regular_price: masterPrice,
      });

      itemCache[itemNumber].price = masterPrice;
    }
    continue;
  }

  //if item is not cached
  try {
    // Step 1: Get the main product by SKU
    const productRes = await api.get(`products?sku=${sku}&_fields=id`);
    const product = productRes.data[0];
    const productId = product?.id;

    if (!productId) {
      errors.push({index, sku, itemNumber: 0, message: "No product found for SKU"})
      console.warn(`❌ No product found for SKU: ${sku}`);
      continue;
    }

    const variationRes = await api.get(`products/${productId}/variations?_fields=id,sku,price,attributes`, {
      params: { per_page: 100 }
    });

    const variation = variationRes.data.find(variation => {
      return variation.attributes.some(attr =>
        attr.name.toLowerCase() == 'item #' &&
        attr.option == itemNumber
      );
    });

    if (!variation) {
      errors.push({index, sku, itemNumber, message: "No variations found for product"})
      console.warn(`⚠️ Variation with item # ${itemNumber} not found in SKU ${sku} (Product ID: ${productId})`);
      continue;
    }

    const masterPrice = product["List Price"];
    const variationId = variation.id;

    itemCache[itemNumber] = {
      variationId,
      productId,
      sku,
      price: masterPrice ? masterPrice : 0
    };
    if (masterPrice) {
      await api.put(`products/${productId}/variations/${variationId}`, {
        regular_price: masterPrice.toFixed(2)
      });
      updatedItems.push({
        itemNumber,
        variationId,
        sku,
        regular_price: product["Regular Price"],
      });
      console.log(`Updated item number ${itemNumber}, ID ${variationId}`);
    }
    else {
      errors.push({index, sku, itemNumber, message: "Price is zero or undefined for this product"})
    }
  } catch (error) {
    console.error(`❌ Error for SKU ${product.Item}:`, error.response?.data || error.message);
  }
}

fs.writeFileSync(CACHE_FILE, JSON.stringify(itemCache, null, 2));
console.log(`\n📦 Saved updated cache to ${CACHE_FILE}`);

const logHeader = 'Item Number,Variation ID,SKU,Regular Price\n';
const csvLog = updatedItems.map(entry =>
  `${entry.itemNumber},${entry.variationId},${entry.sku},${entry.regular_price}`
);
fs.writeFileSync(LOG_FILE, logHeader + csvLog.join('\n'));
const errorHeader = 'Line number (index),SKU,Catalog number (item #),Message\n';
const csvErrors = errors.map(entry =>
  `${entry.index},${entry.sku},${entry.itemNumber},${entry.message}`
);
fs.writeFileSync(DEBUG_FILE, errorHeader + csvErrors.join('\n'));
console.log(`📝 Wrote update log to ${LOG_FILE}`);
console.log(`✅ Updated ${updatedItems.length} items in total`);

function updateProgressBar(index, total) {
  const progress = (index + 1) / total;
  const filled = Math.round(BAR_LENGTH * progress);
  const bar = '='.repeat(filled) + '-'.repeat(BAR_LENGTH - filled);
  const percent = (progress * 100).toFixed(1);

  process.stdout.write(`\r[${bar}] ${index + 1}/${total} (${percent}%)`);
}