import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { writeCache, writeUpdatedProductsLog, writeErrorsLog } from './modules/writeLogs.js';
import { createParentProduct, createProductVariation } from './modules/createProducts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.development') });

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
const master_data = firstSheet.splice(1, 1);



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

let ATTRIBUTES;
try {
  const response = await api.get('products/attributes');
  ATTRIBUTES = response.data;
} catch (error) {
  console.log(error.message);
}

let itemCache = {};
if (fs.existsSync(CACHE_FILE)) {
  itemCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`⚡ Loaded ${Object.keys(itemCache).length} cached item(s)`);
}

const updatedItems = [];
const errors = [];

for (const [index, row] of master_data.entries()) {
  const itemNumber = row["Catalog Number"];
  const sku = row.Item;
  const masterPrice = row["List Price"];
  updateProgressBar(index, master_data.length, itemNumber);

  /* ===
   * If product does exist in the cache, try to update
   * ===
   */

  if (itemCache[itemNumber]) {
    const { productId, variationId, price } = itemCache[itemNumber];

    if ((!price || price != masterPrice) && masterPrice) {
      try {
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
      } catch (err) {
        errors.push({ index, sku, itemNumber, message: err.message })
      }
    }
    continue;
  }

  /* ==========
   * If product does not exist in the cache, try to update
   * ==========
   */
  try {
    // Step 1: Get the main product by SKU
    const productRes = await api.get(`products?sku=${sku}&_fields=id`);
    let product = productRes.data[0];
    let productId = product?.id;
    let variation = null;

    //Product does not exist, create the product
    if (!productId) {
      try {
        const mainProductId = await createParentProduct(row, ATTRIBUTES, api);
        if (mainProductId) {
          productId = mainProductId;
        }
      }
      catch (error) {
        console.log(error)
        errors.push({ index, sku, itemNumber: 0, message: "Error creating product" })
      }
    }
    else {
      const variationRes = await api.get(`products/${productId}/variations?_fields=id,sku,price,attributes`, {
        params: { per_page: 100 }
      });

      variation = variationRes.data.find(variation => {
        return variation.attributes.some(attr =>
          attr.name.toLowerCase() == 'item #' &&
          attr.option == itemNumber
        );
      });
    }

    //Variation does not exist, create the variation
    if (!variation) {
      try {
        const variationId = await createProductVariation(row, productId, ATTRIBUTES, api);
        itemCache[itemNumber] = {
          variationId,
          productId,
          sku,
          price: masterPrice
        }
        updatedItems.push({
          itemNumber,
          variationId,
          sku,
          regular_price: masterPrice
        })
      }
      catch (error) {
        errors.push({ index, sku, itemNumber, message: error.message })
      }
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
        regular_price: masterPrice,
      });
    }
    else {
      errors.push({ index, sku, itemNumber, message: "Price is zero or undefined for this product" })
    }
  } catch (error) {
    console.error(`❌ Error for SKU ${product.Item}:`, error.response?.data || error.message);
  }
}

writeCache(CACHE_FILE, itemCache);
writeUpdatedProductsLog(LOG_FILE, updatedItems);
writeErrorsLog(DEBUG_FILE, errors);

function updateProgressBar(index, total, itemNumber) {
  const progress = (index + 1) / total;
  const filled = Math.round(BAR_LENGTH * progress);
  const bar = '='.repeat(filled) + '-'.repeat(BAR_LENGTH - filled);
  const percent = (progress * 100).toFixed(1);

  process.stdout.write(`\r[${bar}] ${index + 1}/${total} (${percent}%) Currently updating: ${itemNumber}`);
}
