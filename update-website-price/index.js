import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const master_data = firstSheet;



const api = new WooCommerceRestApi.default({
  url: process.env.WC_API_URL,
  consumerKey: process.env.WC_KEY,
  consumerSecret: process.env.WC_SECRET,
  version: 'wc/v3'
});

const CACHE_FILE = path.join(META_DIR, 'id_cache.json');
const LOG_FILE = path.join(META_DIR, 'price_update_log.csv');

let itemCache = {};
if (fs.existsSync(CACHE_FILE)) {
  itemCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`⚡ Loaded ${Object.keys(itemCache).length} cached item(s)`);
}

const updatedItems = [];

for (const row of master_data) {
  const itemNumber = row["Catalog Number"];
  const sku = row.Item;

  if (itemCache[itemNumber]) {
    const { productId, variationId } = itemCache[itemNumber];

    // Update the variation price directly
    await api.put(`products/${productId}/variations/${variationId}`, {
      regular_price: row["List Price"].toFixed(2)
    });

    console.log(`Updated price for Item Number ${itemNumber}, Item ID ${variationId}. `);
    updatedItems.push({
      itemNumber,
      variationId,
      sku,
      regular_price: row["Regular Price"],
    });
    continue;

  }

  try {
    // Step 1: Get the main product by SKU
    const productRes = await api.get(`products?sku=${row.Item}`);
    const product = productRes.data[0];
    const productId = product?.id;
    
    if (!productId) {
      console.warn(`❌ No product found for SKU: ${row.Item}`);
      continue;
    }

    const variationRes = await api.get(`products/${productId}/variations`, {
      params: { per_page: 100 }
    });

    const variation = variationRes.data.find(variation => {
      return variation.attributes.some(attr =>
        attr.name.toLowerCase() == 'item #' &&
        attr.option == row["Catalog Number"]
      );
    });

    if (!variation) {
      console.warn(`⚠️ Variation with item # ${row["Catalog Number"]} not found in SKU ${row.Item} (Product ID: ${productId})`);
      continue;
    }

    const masterPrice = row["List Price"];
    const variationId = variation.id;

    itemCache[itemNumber] = {
      variationId,
      productId,
      sku
    };

    await api.put(`products/${productId}/variations/${variationId}`, {
      regular_price: masterPrice.toFixed(2)
    });
    
    updatedItems.push({
      itemNumber,
      variationId,
      sku,
      regular_price: row["Regular Price"],
    });

    console.log(`Updated item number ${itemNumber}, ID ${variationId}`);

  } catch (error) {
    console.error(`❌ Error for SKU ${row.Item}:`, error.response?.data || error.message);
  }
}

fs.writeFileSync(CACHE_FILE, JSON.stringify(itemCache, null, 2));
console.log(`📦 Saved updated cache to ${CACHE_FILE}`);

const csvHeader = 'Item Number,Variation ID,SKU,Regular Price\n';
const csvRows = updatedItems.map(entry =>
  `${entry.itemNumber},${entry.variationId},${entry.sku},${entry.regular_price}`
);
fs.writeFileSync(LOG_FILE, csvHeader + csvRows.join('\n'));
console.log(`📝 Wrote update log to ${LOG_FILE}`);



