import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';
import { fileURLToPath, urlToHttpOptions } from 'url';
import { writeCache, writeUpdatedProductsLog, writeErrorsLog } from './meta/modules/writeLogs.js';
import { createParentProduct, createProductVariation } from './meta/modules/createProducts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.development.local') });

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

const CACHE_FILE = path.join(META_DIR, 'new_cache.json');
const LOG_FILE = path.join(META_DIR, 'price_update_log.csv');
const DEBUG_FILE = path.join(META_DIR, 'debug.csv');
const BAR_LENGTH = 40;
const UPDATE_WEBSITE_DATA = false;

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
  const itemNumber = row["Item #"];
  const sku = row["SKU"];
  const masterAttributes = [
    {
      name: "Full Name",
      value: row["Full Name"],
      isVisible: true,
      required: true,
    },
    {
      name: "Synonyms",
      value: row["Synonyms"],
      isVisible: true,
      required: true,
    },
    {
      name: "CAS Number",
      value: row["CAS Number"],
      isVisible: true,
      required: true,
    },
    {
      name: "Structure Formula",
      value: row["Molecular Formula"],
      isVisible: true,
      required: true,
    },
    {
      name: "Molecular Weight",
      value: row["Molecular Weight"],
      isVisible: true,
      required: true,
    },
    {
      name: "Appearance",
      value: row["Appearance"],
      isVisible: true,
      required: true,
    },
    {
      name: "Storage",
      value: row["Storage"],
      isVisible: true,
      required: true,
    },
    {
      name: "SMILES",
      value: row["SMILES"],
      required: true,
      isVisible: true,
    },
    {
      name: "PEG-Length",
      value: row["PEG length"],
      required: false,
      isVisible: true
    },
    {
      name: "Functional Group",
      value: row["Functional Group"],
      required: false,
      isVisible: true
    },
    {
      name: "Functional Group Prefix",
      value: row["Functional Group Prefix"],
      required: false,
      isVisible: true
    }
  ]
  const masterFields = [
    {
      name: "name",
      required: true,
      value: row["Name"]
    }
  ]
  const variationFields = [
    {
      name: "regular_price",
      value: row["List Price"],
      required: true,
      callBackFn: (val) => val.toFixed(2)
    },
    {
      name: "weight",
      value: row["Weight (g)"],
      required: true,
      callBackFn: (val) => val.toString()
    }
  ]
  const variationMetaData = [
    {
      key: "_purity",
      required: true,
      value: row["Purity"]
    }
  ]

  updateProgressBar(index, master_data.length, itemNumber);

  /* ===
   * If product does exist in the cache, try to update TODO: Add categories updating
   * ===
   */

  if (itemCache[sku] && itemCache[sku].variations && itemCache[sku].variations[itemNumber]) {
    try {
      const cachedItem = itemCache[sku];
      const cachedAttributes = itemCache[sku].attributes;
      const cachedVariation = itemCache[sku].variations[itemNumber];
      const parentId = cachedItem.parentId;
      const variationId = cachedVariation.variationId;
      let fieldsUpdated = [];

      const attributesChanged = masterAttributes.filter((attrInMasterSheet) => (cachedAttributes[attrInMasterSheet.name] != attrInMasterSheet.value));
      if (attributesChanged.length > 0) {
        let formerAttributes = [];
        if (UPDATE_WEBSITE_DATA) {
          try {
            const productRes = await api.get(`products?sku=${sku}&_fields=name,sku,id,attributes`);
            formerAttributes = productRes.data[0].attributes;
          } catch (error) {
            throw new Error("Could not get parent item attributes from API");
          }
          attributesChanged.forEach((attrInMasterSheet) => {
            const indexOfAttribute = formerAttributes.indexOf(attr => attrInMasterSheet.name == attr.name);
            if (indexOfAttribute == -1) {
              const attributeReference = ATTRIBUTES.find(attr => attrInMasterSheet.name == attr.name);
              if (!attributeReference) {
                throw new Error(`Could not find attribute named ${attrInMasterSheet.name}`)
              }
              formerAttributes.push({
                id: attributeReference.id,
                visible: attrInMasterSheet.isVisible,
                options: [attrInMasterSheet.value ? attrInMasterSheet.value.toString() : "N/A"]
              })
            }
            else {
              formerAttributes[indexOfAttribute].options = [attrInMasterSheet.value ? attrInMasterSheet.value.toString() : "N/A"]
            }
            fieldsUpdated.push({ field: attrInMasterSheet.name, newValue: attrInMasterSheet.value ?? "N/A" })
          })
          try {
            await api.put(`products/${parentId}/`, {
              attributes: formerAttributes
            });

          } catch (error) {
            throw new Error(`Could not update parent attributes from API ${error.message}`);
          }
        }
        attributesChanged.forEach((attrInMasterSheet) => {
          //update cache
          itemCache[sku].attributes[attrInMasterSheet.name] = attrInMasterSheet.value ?? "N/A";
        })
      }

      const parentFieldsChanged = masterFields.filter((fieldInMasterSheet) => cachedItem[fieldInMasterSheet.name] != fieldInMasterSheet.value);
      if (parentFieldsChanged.length > 0) {
        let updatedData = {};
        if (UPDATE_WEBSITE_DATA) {
          parentFieldsChanged.forEach((field) => {
            if (field.required && !field.value) {
              throw new Error(`Field ${field.name} is required`);
            }
            updatedData[field.name] = field.value;
            fieldsUpdated.push({ field: field.name, newValue: field.value ?? "N/A" });
          })
          try {
            await api.put(`products/${parentId}/`,
              updatedData
            );
          } catch (error) {
            throw new Error(`Could not update parent item from API ${error.message}`);
          }
        }
        parentFieldsChanged.forEach((fieldInMasterSheet) => {
          itemCache[sku][fieldInMasterSheet.name] = fieldInMasterSheet.value;
        })
      }

      const variationFieldsChanged = variationFields.filter((fieldInMasterSheet) => cachedVariation[fieldInMasterSheet.name] != fieldInMasterSheet.value);
      if (variationFieldsChanged > 0) {
        let updatedData = {};
        if (UPDATE_WEBSITE_DATA) {
          variationFieldsChanged.forEach((field) => {
            updatedData[field.name] = field.value;
            fieldsUpdated.push({ field: field.name, newValue: field.value ?? "N/A" });
          })
          try {
            await api.put(`products/${parentId}/variations/${variationId}`, updatedData);
          } catch (error) {
            throw new Error(`Could not update variation item from API ${error.message}`);
          }
        }
        variationFieldsChanged.forEach(fieldInMasterSheet => {
          itemCache[sku].variations[itemNumber][fieldInMasterSheet.name] = fieldInMasterSheet.value;
        })
      }

      const variationDatasChanged = variationMetaData.filter((dataInMasterSheet) => cachedVariation[dataInMasterSheet.name] != dataInMasterSheet.value);
      if (variationDatasChanged > 0) {
        let updatedMetadata = [];
        if (UPDATE_WEBSITE_DATA) {
          variationDatasChanged.forEach((meatdata) => {
            updatedMetadata.push({
              key: meatdata.name,
              value: meatdata.value ? meatdata.value.toString() : "N/A"
            })
            fieldsUpdated.push({ field: meatdata.name, newValue: meatdata.value ?? "N/A" });
          })
          try {
            await api.put(`products/${parentId}/variations/${variationId}`, {
              metadata: updatedMetadata
            });
          } catch (error) {
            throw new Error(`Could not update variation metadata from API ${error.message}`);
          }

        }
        variationDatasChanged.forEach((metadata) => {
          itemCache[sku].variations[itemNumber][metadata.name] = metadata.value;
        })
      }
      if (fieldsUpdated.length > 0) {
        updatedItems.push({ itemNumber, variationId, sku, fields: fieldsUpdated.map(obj => obj.field).join(" / ") })
      }
      continue;
    } catch (error) {
      errors.push({ index, sku, itemNumber, message: `Failed to update cached item: ${error.message}` })
      continue;
    }
  }

  /* ==========
   * If Main Product does not exist in the cache, try to update
   * ==========
   */
  let parentProductId = 0;
  let variationId = 0;
  let parent = null
  let variation = null;
  updatedItems.push({
    itemNumber, variationId: 0, sku, fields: "All fields (cache miss)"
  })

  if (!itemCache[sku]) {
    try {
      try {
        const productRes = await api.get(`products?sku=${sku}&_fields=sku,id`);
        parent = productRes.data[0];
        parentProductId = parent?.id;
      } catch (error) {
        throw new Error(`Failed to get main item from API: ${error.message}`);
      }
      if (!parentProductId) {
        debug(index, "Creating product")
        const { cacheItem, parentProduct } = await createParentProduct(row, ATTRIBUTES, api);
        itemCache[sku] = cacheItem;
        parentProductId = cacheItem.parentId;
        parent = parentProduct;
      }
      else {
        const updatedData = {};

        //Main fields
        masterFields.forEach((field) => {
          if (field.required && !field.value) {
            throw new Error(`Field ${field.name} is required`);
          }
          updatedData[field.name] = field.value.toString();
        })

        //Attributes
        let formerAttributes = [];
        try {
          const productRes = await api.get(`products?sku=${sku}&_fields=name,sku,id,attributes`);
          formerAttributes = productRes.data[0].attributes;
        } catch (error) {
          throw new Error("Could not get parent item attributes from API");
        }
        masterAttributes.forEach((attrInMasterSheet) => {
          const indexOfAttribute = formerAttributes.indexOf(attr => attrInMasterSheet.name == attr.name);
          if (indexOfAttribute == -1) {
            const attributeReference = ATTRIBUTES.find(attr => attrInMasterSheet.name == attr.name);
            if (!attributeReference) {
              throw new Error(`Could not find attribute named ${attrInMasterSheet.name}`)
            }
            formerAttributes.push({
              id: attributeReference.id,
              visible: attrInMasterSheet.isVisible,
              options: [attrInMasterSheet.value ? attrInMasterSheet.value.toString() : "N/A"]
            })
          }
          else {
            formerAttributes[indexOfAttribute].options = [attrInMasterSheet.value ? attrInMasterSheet.value.toString() : "N/A"]
          }
        })
        updatedData.attributes = formerAttributes;

        //update the parent item
        if (UPDATE_WEBSITE_DATA) {
          try {
            await api.put(`products/${parentProductId}/`, updatedData);
          } catch (error) {
            throw new Error(`Could not update parent attributes from API ${error.message}`);
          }
        }

        //update the cache
        updatedData.attributes = {};
        masterAttributes.forEach((attrInMasterSheet) => {
          updatedData.attributes[attrInMasterSheet.name] = attrInMasterSheet.value;
        })
        itemCache[sku] = updatedData;
        itemCache[sku].variations = {};
        itemCache[sku].parentId = parentProductId;
      }
    }
    catch (error) {
      console.log(error);
      errors.push({ index, sku, itemNumber, message: `Failed to update parent item that is not cached: ${error.message}` })
      continue;
    }
  } else {
    parentProductId = itemCache[sku].parentId;
  }

  /* ==========
   * If Variation Product does not exist in the cache, try to update
   * ==========
   */
  if (!itemCache[sku].variations || !itemCache[sku].variations[itemNumber]) {
    try {
      try {
        const variationRes = await api.get(`products/${parentProductId}/variations`, {
          params: { per_page: 100 }
        });
        variation = variationRes.data.find(variation => {
          return variation.attributes.some(attr =>
            attr.name.toLowerCase() == 'item #' &&
            attr.option == itemNumber
          );
        });
      } catch (error) {
        throw new Error(`Failed to get variation from API: ${error.message}`);
      }

      if (!variation) {
        const cacheItem = await createProductVariation(row, parent, ATTRIBUTES, api);
        variationId = cacheItem.variationId;
        itemCache[sku].variations[itemNumber] = cacheItem;
        continue;
      }

      variationId = variation.id;

      const updatedData = {
        metadata: []
      };
      const cacheItem = {
        variationId: variationId
      };
      variationFields.forEach((field) => {
        if (field.required && !field.value) {
          throw new Error(`Field ${field.name} is required`);
        }
        updatedData[field.name] = field.callBackFn ? field.callBackFn(field.value) : field.value.toString();
        cacheItem[field.name] = field.value;
      })

      variationMetaData.forEach((data) => {
        if (data.required && !data.value) {
          throw new Error(`Field ${data.name} is required`);
        }
        updatedData.metadata.push({
          key: data.key,
          value: data.value.toString()
        })
        cacheItem[data.key] = data.value;
      })
      if (UPDATE_WEBSITE_DATA) {
        try {
          await api.put(`products/${parentProductId}/variations/${variationId}`, updatedData);
        } catch (error) {
          throw new Error(`Failed to update API endpoint: ${error.message}`)
        }
      }
      if (!itemCache[sku].variations) {
        itemCache[sku].variations = {};
      }
      itemCache[sku].variations[itemNumber] = cacheItem;

    } catch (error) {
      console.log(error)
      errors.push({
        index, sku, itemNumber, message: `Failed to update variation item that is not cached: ${error.message}`
      })
    }
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

function debug(index, message) {
  const row = master_data[index];
  console.log(`\n i: ${index} item: ${row['Item #']} sku: ${row['SKU']} | ${message}`);
}