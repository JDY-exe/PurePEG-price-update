import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { api, ATTRIBUTES } from './lib/api.js';
import { selectExcelFile, readExcelData, loadCache, writeCache, writeUpdatedProductsLog, writeErrorsLog } from './lib/file-handler.js';
import { mapRowToProductData } from './lib/product-mapper.js';
import { createParentProduct, createProductVariation, processCategories, splitEscapedString } from './lib/product-service.js';
import { updateProgressBar } from './lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Master switch to prevent accidental API calls during testing
const UPDATE_WEBSITE_DATA = true;

async function main() {
  console.clear();
  const rootFolder = process.argv[2];
  if (!rootFolder) {
    console.error("❌ Please provide the working folder path as an argument.");
    process.exit(1);
  }

  const META_DIR = path.join(__dirname, 'meta');
  fs.mkdirSync(META_DIR, { recursive: true });

  // Define file paths
  const CACHE_FILE = path.join(META_DIR, 'product_cache.json');
  const LOG_FILE = path.join(META_DIR, 'update_log.csv');
  const DEBUG_FILE = path.join(META_DIR, 'debug_log.csv');

  try {
    const excelFilePath = await selectExcelFile(rootFolder);
    const masterData = readExcelData(excelFilePath);
    let itemCache = loadCache(CACHE_FILE);
    const updatedItems = [];
    const errors = [];


    console.log(`\nStarting product processing for ${masterData.length} items...`);

    // --- Main Processing Loop ---
    for (const [index, row] of masterData.entries()) {
      const productData = mapRowToProductData(row);
      const { sku, itemNumber, master, variation } = productData;
      updateProgressBar(index, masterData.length, itemNumber);

      try {
        for (const field of master.fields) {
          if (field.required && !field.value) {
            throw new Error(`Required parent field "${field.name}" is missing for update.`);
          }
        }
        for (const field of variation.fields) {
          if (field.required && !field.value) {
            throw new Error(`Required variation field "${field.name}" is missing for update.`);
          }
        }
        for (const meta of variation.meta_data) {
          if (meta.required && !meta.value) {
            throw new Error(`Required variation metadata "${meta.key}" is missing for update.`);
          }
        }
        if (variation.attribute.required && !variation.attribute.value) {
          throw new Error(`Required variation attribute "${variation.attribute.name}" is missing.`);
        }
        //================================================
        // 1. Handle Cached Product (Update Logic)
        //================================================
        if (itemCache[sku] && itemCache[sku].variations && itemCache[sku].variations[itemNumber]) {
          const cachedItem = itemCache[sku];
          const cachedVariation = itemCache[sku].variations[itemNumber];
          const parentId = cachedItem.parentId;
          const variationId = cachedVariation.variationId;

          let fieldsUpdated = [];
          // --- Parent Product Update ---
          const parentUpdatePayload = {};


          // Compare master fields
          master.fields.forEach(field => {
            if (cachedItem[field.name] != field.value) {
              parentUpdatePayload[field.name] = field.value;
              fieldsUpdated.push({ field: field.name, newValue: field.value });
            }
          });

          // Compare attributes
          const changedAttributes = master.attributes.filter(attr => cachedItem.attributes[attr.name] != attr.value);

          // Proceed only if there are actual changes
          if (changedAttributes.length > 0) {
            changedAttributes.forEach(attr => {
              fieldsUpdated.push({ field: `Attribute: ${attr.name}`, newValue: attr.value ?? "N/A" });
            });

            const { data: remoteProduct } = await api.get(`products/${parentId}`, { _fields: 'attributes' });
            let remoteAttributes = remoteProduct.attributes;

            master.attributes.forEach(attr => {
              const remoteAttrIndex = remoteAttributes.findIndex(ra => ra.id === ATTRIBUTES.find(a => a.name === attr.name)?.id);
              const optionValue = attr.value ? splitEscapedString(attr.value.toString()) : ["N/A"];

              if (remoteAttrIndex !== -1) {
                // Update an existing attribute
                remoteAttributes[remoteAttrIndex].options = optionValue;
              } else {
                // Add a new attribute that wasn't on the product before
                const attrRef = ATTRIBUTES.find(a => a.name === attr.name);
                if (attrRef) {
                  remoteAttributes.push({
                    id: attrRef.id,
                    name: attr.name,
                    visible: attr.isVisible ?? true,
                    variation: attr.isVariation ?? false,
                    position: attr.position ?? 0,
                    options: optionValue
                  });
                }
              }
            });

            // 4. Add the complete, updated attribute array to the payload
            parentUpdatePayload.attributes = remoteAttributes;
          }


          const categoriesChanged = cachedItem.categories !== master.categories;
          if (categoriesChanged) {

            const categoryPayload = await processCategories(master.categories, api);
            parentUpdatePayload.categories = categoryPayload;
            fieldsUpdated.push({ field: 'Categories', newValue: master.categories });
          }


          if (Object.keys(parentUpdatePayload).length > 0) {
            if (UPDATE_WEBSITE_DATA) {
              await api.put(`products/${parentId}`, parentUpdatePayload);
            }
            // Update cache on success
            if (parentUpdatePayload.name) itemCache[sku].name = parentUpdatePayload.name;
            if (changedAttributes.length > 0) {
              master.attributes.forEach(attr => itemCache[sku].attributes[attr.name] = attr.value);
            }
            if (categoriesChanged) {
              itemCache[sku].categories = master.categories;
            }
          }




          // --- Variation Product Update ---
          const variationUpdatePayload = {};
          variation.fields.forEach(field => {
            if (cachedVariation[field.name] != field.value) {
              variationUpdatePayload[field.name] = field.callBackFn ? field.callBackFn(field.value) : field.value;
              fieldsUpdated.push({ field: field.name, newValue: field.value });
            }
          });

          const metaDataChanged = variation.meta_data.some(meta => cachedVariation[meta.key] != meta.value);
          if (metaDataChanged) {
            variationUpdatePayload.meta_data = variation.meta_data.map(meta => ({
              key: meta.key,
              value: meta.callBackFn ? meta.callBackFn(meta.value) : meta.value.toString()
            }));
            fieldsUpdated.push({ field: 'Meta Data', newValue: 'Updated' });
          }

          if (Object.keys(variationUpdatePayload).length > 0) {
            if (UPDATE_WEBSITE_DATA) {
              await api.put(`products/${parentId}/variations/${variationId}`, variationUpdatePayload);
            }
            // Update cache on success
            variation.fields.forEach(field => itemCache[sku].variations[itemNumber][field.name] = field.value);
            variation.meta_data.forEach(meta => itemCache[sku].variations[itemNumber][meta.key] = meta.value);
          }

          if (fieldsUpdated.length > 0) {
            updatedItems.push({ itemNumber, sku, variationId, fields: fieldsUpdated.map(f => f.field).join(' / ') });
          }
          continue; // Move to next item
        }

        //================================================
        // 2. Handle New Product (Creation Logic)
        //================================================
        let parentProduct;

        if (!itemCache[sku]) {

          const { data: existingProducts } = await api.get('products', { sku });

          if (existingProducts.length > 0) {
            parentProduct = existingProducts[0];

            let remoteAttributes = parentProduct.attributes;

            const parentUpdatePayload = {
              name: master.fields.find(f => f.name === 'name').value,
              categories: await processCategories(master.categories, api)
            };

            master.attributes.forEach(attrFromSheet => {
              const remoteAttrIndex = remoteAttributes.findIndex(ra => ra.name === attrFromSheet.name);
              const optionValue = attrFromSheet.value ? splitEscapedString(attrFromSheet.value.toString()) : ["N/A"];

              if (remoteAttrIndex !== -1) {
                remoteAttributes[remoteAttrIndex].options = optionValue;
              } else {
                const attrRef = ATTRIBUTES.find(a => a.name === attrFromSheet.name);
                if (attrRef) {
                  remoteAttributes.push({
                    id: attrRef.id,
                    name: attrFromSheet.name,
                    visible: attrFromSheet.isVisible ?? true,
                    variation: attrFromSheet.isVariation ?? false,
                    position: attrFromSheet.position ?? 0,
                    options: optionValue
                  });
                }
              }
            });

            parentUpdatePayload.attributes = remoteAttributes;

            if (UPDATE_WEBSITE_DATA) {
              await api.put(`products/${parentProduct.id}`, parentUpdatePayload);
            }

            itemCache[sku] = {
              parentId: parentProduct.id,
              name: master.fields.find(f => f.name === 'name').value,
              sku: sku,
              categories: master.categories,
              attributes: master.attributes.reduce((acc, attr) => ({ ...acc, [attr.name]: attr.value }), {}),
              variations: {}
            };

            updatedItems.push({ itemNumber, sku, variationId: 'N/A', fields: 'Parent Adopted & Synced from Sheet' });
          }
          else {
            // The product does not exist on the site, so we create it
            if (UPDATE_WEBSITE_DATA) {
              const { newProduct, cacheItem } = await createParentProduct(productData, ATTRIBUTES, api);
              parentProduct = newProduct;
              itemCache[sku] = cacheItem;
              updatedItems.push({ itemNumber, sku, variationId: 'N/A', fields: 'New Parent Created' });
            } else {
              errors.push({ index, sku, itemNumber, message: 'Dry Run: Parent would be created.' });
              continue;
            }
          }
        } else {
          // Parent is in cache, so we just need its full data for the variation step.
          const { data: fullParentProduct } = await api.get(`products/${itemCache[sku].parentId}`);
          parentProduct = fullParentProduct;
        }


        //================================================
        // 3. Handle New Variation (Creation Logic)
        //================================================
        if (!itemCache[sku].variations[itemNumber]) {


          const { data: remoteVariations } = await api.get(`products/${parentProduct.id}/variations`, { per_page: 100 });
          const existingVariation = remoteVariations.find(v =>
            v.attributes.some(attr => attr.name === 'Item #' && attr.option === itemNumber)
          );

          if (existingVariation) {
            const updatePayload = {
              meta_data: []
            };

            variation.fields.forEach(field => {
              updatePayload[field.name] = field.callBackFn ? field.callBackFn(field.value) : field.value;
            });

            variation.meta_data.forEach(meta => {
              updatePayload.meta_data.push({
                key: meta.key,
                value: meta.callBackFn ? meta.callBackFn(meta.value) : meta.value.toString()
              });
            });
            if (UPDATE_WEBSITE_DATA) {
              await api.put(`products/${parentProduct.id}/variations/${existingVariation.id}`, updatePayload);
            }

            const variationCacheItem = {
              variationId: existingVariation.id
            };

            variation.fields.forEach(field => {
              variationCacheItem[field.name] = field.value;
            });
            variation.meta_data.forEach(meta => {
              variationCacheItem[meta.key] = meta.value;
            });

            // --- Save the up-to-date information to the local cache and log the action ---
            itemCache[sku].variations[itemNumber] = variationCacheItem;
            updatedItems.push({
              itemNumber,
              sku,
              variationId: existingVariation.id,
              fields: 'Variation Adopted & Synced from Sheet' // More descriptive log message
            });

          } else {
            // 4. If not found, it's safe to create a new one.
            if (UPDATE_WEBSITE_DATA) {
              const newVariationCacheItem = await createProductVariation(productData, parentProduct, ATTRIBUTES, api);
              itemCache[sku].variations[itemNumber] = newVariationCacheItem;
              updatedItems.push({ itemNumber, sku, variationId: newVariationCacheItem.variationId, fields: 'New Variation Created' });
            }
            else {
              errors.push({ index, sku, itemNumber, message: 'Dry Run: Variation would be created.' });
            }
          }
        }
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        errors.push({ index, sku, itemNumber, message: errorMessage });
      }
    }
    // --- Finalize ---
    writeCache(CACHE_FILE, itemCache);
    writeUpdatedProductsLog(LOG_FILE, updatedItems);
    writeErrorsLog(DEBUG_FILE, errors);

    console.log('\n\nProcess complete.');
    if (updatedItems.length > 0) console.log(`✅ ${updatedItems.length} items were created or updated.`);
    if (errors.length > 0) console.log(`Encountered ${errors.length} errors. Check ${DEBUG_FILE} for details.\n`);

  } catch (error) {
    console.error(`\n\nA critical error occurred: ${error.message}`);
    process.exit(1);
  }
}

main();

