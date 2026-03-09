import xlsx from 'xlsx';
import { api, ATTRIBUTES } from './api.js';
import {
  writeCache,
  writeUpdatedProductsLog,
  writeErrorsLog,
  writeUpdatedWorkbook
} from './file-handler.js';
import {
  createParentProduct,
  createProductVariation,
  processCategories
} from './product-service.js';
import {
  getFieldValue,
  mergeAttributes,
  buildParentCacheItem,
  buildVariationPayload,
  buildVariationCacheItem
} from './payload-builders.js';

/**
 * Higher-level orchestration helpers for syncing workbook rows with WooCommerce.
 */

/**
 * Handles the cached-product update path.
 * Returns `handled: true` when a matching SKU+Item# exists in cache.
 *
 * @param {Object} args
 * @param {Object} args.productData
 * @param {Object} args.itemCache
 * @param {Array<Object>} args.updatedItems
 * @param {number} args.index
 * @param {number} args.urlColumnIndex
 * @param {xlsx.WorkSheet} args.worksheet
 * @param {boolean} args.updateWebsiteData
 * @returns {Promise<{handled: boolean}>}
 */
export async function processCachedProductRow({
  productData,
  itemCache,
  updatedItems,
  index,
  urlColumnIndex,
  worksheet,
  updateWebsiteData
}) {
  const { sku, itemNumber, master, variation } = productData;

  if (!(itemCache[sku] && itemCache[sku].variations && itemCache[sku].variations[itemNumber])) {
    return { handled: false };
  }

  const cachedItem = itemCache[sku];
  const cachedVariation = itemCache[sku].variations[itemNumber];
  const parentId = cachedItem.parentId;
  const variationId = cachedVariation.variationId;
  const fieldsUpdated = [];
  let productPermalink = null;

  const parentUpdatePayload = {};

  master.fields.forEach(field => {
    if (cachedItem[field.name] != field.value) {
      parentUpdatePayload[field.name] = field.value;
      fieldsUpdated.push({ field: field.name, newValue: field.value });
    }
  });

  const changedAttributes = master.attributes.filter(attr => cachedItem.attributes[attr.name] != attr.value);
  if (changedAttributes.length > 0) {
    changedAttributes.forEach(attr => {
      fieldsUpdated.push({ field: `Attribute: ${attr.name}`, newValue: attr.value ?? 'N/A' });
    });

    const { data: remoteProduct } = await api.get(`products/${parentId}`, { _fields: 'attributes' });
    parentUpdatePayload.attributes = mergeAttributes(remoteProduct.attributes, master.attributes, ATTRIBUTES);
  }

  const categoriesChanged = cachedItem.categories !== master.categories;
  if (categoriesChanged) {
    parentUpdatePayload.categories = await processCategories(master.categories, api);
    fieldsUpdated.push({ field: 'Categories', newValue: master.categories });
  }

  const shippingClassChanged =
    master.shippingClassSlug !== null && cachedItem.shipping_class !== master.shippingClassSlug;
  if (shippingClassChanged) {
    parentUpdatePayload.shipping_class = master.shippingClassSlug;
    fieldsUpdated.push({ field: 'shipping_class', newValue: master.shippingClassSlug });
  }

  if (Object.keys(parentUpdatePayload).length > 0) {
    if (updateWebsiteData) {
      const { data: updatedParent } = await api.put(`products/${parentId}`, parentUpdatePayload);
      productPermalink = updatedParent.permalink;
    }

    if (parentUpdatePayload.name) {
      itemCache[sku].name = parentUpdatePayload.name;
    }

    if (changedAttributes.length > 0) {
      master.attributes.forEach(attribute => {
        itemCache[sku].attributes[attribute.name] = attribute.value;
      });
    }

    if (categoriesChanged) {
      itemCache[sku].categories = master.categories;
    }
    if (shippingClassChanged) {
      itemCache[sku].shipping_class = master.shippingClassSlug;
    }
  }

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
    if (updateWebsiteData) {
      const { data: updatedVariation } = await api.put(`products/${parentId}/variations/${variationId}`, variationUpdatePayload);
      productPermalink = updatedVariation.permalink;
    }

    variation.fields.forEach(field => {
      itemCache[sku].variations[itemNumber][field.name] = field.value;
    });

    variation.meta_data.forEach(meta => {
      itemCache[sku].variations[itemNumber][meta.key] = meta.value;
    });
  }

  if (fieldsUpdated.length > 0) {
    updatedItems.push({
      itemNumber,
      sku,
      variationId,
      fields: fieldsUpdated.map(fieldUpdate => fieldUpdate.field).join(' / ')
    });
  }

  if (productPermalink == null && !productData.master.permalink && urlColumnIndex !== -1) {
    const { data: webData } = await api.get(`products/${parentId}/variations/${variationId}`);
    productPermalink = webData.permalink;
    insertURLIntoWorksheet(productPermalink, index, urlColumnIndex, worksheet);
  }

  return { handled: true };
}

/**
 * Resolves parent product for a row by using cache, adopting an existing remote product,
 * or creating a new one.
 *
 * @param {Object} args
 * @param {Object} args.productData
 * @param {Object} args.itemCache
 * @param {Array<Object>} args.updatedItems
 * @param {Array<Object>} args.errors
 * @param {number} args.index
 * @param {boolean} args.updateWebsiteData
 * @returns {Promise<{parentProduct: Object|null, productPermalink: string|null, skipRow: boolean}>}
 */
export async function resolveParentProduct({
  productData,
  itemCache,
  updatedItems,
  errors,
  index,
  updateWebsiteData
}) {
  const { sku, itemNumber, master } = productData;

  if (itemCache[sku]) {
    const { data: fullParentProduct } = await api.get(`products/${itemCache[sku].parentId}`);
    return { parentProduct: fullParentProduct, productPermalink: null, skipRow: false };
  }

  const { data: existingProducts } = await api.get('products', { sku });

  if (existingProducts.length > 0) {
    let parentProduct = existingProducts[0];
    const parentUpdatePayload = {
      name: getFieldValue(master.fields, 'name'),
      categories: await processCategories(master.categories, api),
      attributes: mergeAttributes(parentProduct.attributes, master.attributes, ATTRIBUTES)
    };
    if (master.shippingClassSlug !== null) {
      parentUpdatePayload.shipping_class = master.shippingClassSlug;
    }

    let productPermalink = null;
    if (updateWebsiteData) {
      const { data: updatedProduct } = await api.put(`products/${parentProduct.id}`, parentUpdatePayload);
      parentProduct = updatedProduct;
      productPermalink = updatedProduct.permalink;
    }

    itemCache[sku] = buildParentCacheItem({
      parentId: parentProduct.id,
      sku,
      master,
      shippingClassSlug:
        master.shippingClassSlug !== null ? master.shippingClassSlug : (parentProduct.shipping_class ?? null)
    });

    updatedItems.push({
      itemNumber,
      sku,
      variationId: 'N/A',
      fields: 'Parent Adopted & Synced from Sheet'
    });

    return { parentProduct, productPermalink, skipRow: false };
  }

  if (!updateWebsiteData) {
    errors.push({ index, sku, itemNumber, message: 'Dry Run: Parent would be created.' });
    return { parentProduct: null, productPermalink: null, skipRow: true };
  }

  const { newProduct, cacheItem } = await createParentProduct(productData, ATTRIBUTES, api);
  itemCache[sku] = cacheItem;

  updatedItems.push({
    itemNumber,
    sku,
    variationId: 'N/A',
    fields: 'New Parent Created'
  });

  return {
    parentProduct: newProduct,
    productPermalink: newProduct.permalink,
    skipRow: false
  };
}

/**
 * Resolves or creates a variation for a row when SKU exists but Item# is not yet cached.
 *
 * @param {Object} args
 * @param {Object} args.productData
 * @param {Object} args.parentProduct
 * @param {Object} args.itemCache
 * @param {Array<Object>} args.updatedItems
 * @param {Array<Object>} args.errors
 * @param {number} args.index
 * @param {boolean} args.updateWebsiteData
 * @returns {Promise<{productPermalink: string|null}>}
 */
export async function resolveOrCreateVariation({
  productData,
  parentProduct,
  itemCache,
  updatedItems,
  errors,
  index,
  updateWebsiteData
}) {
  const { sku, itemNumber, variation } = productData;

  if (!itemCache[sku].variations) {
    itemCache[sku].variations = {};
  }

  if (itemCache[sku].variations[itemNumber]) {
    return { productPermalink: null };
  }

  const { data: remoteVariations } = await api.get(`products/${parentProduct.id}/variations`, { per_page: 100 });
  const existingVariation = remoteVariations.find(remoteVariation =>
    remoteVariation.attributes.some(attribute => attribute.name === 'Item #' && attribute.option === itemNumber)
  );

  if (existingVariation) {
    let productPermalink = null;
    const updatePayload = buildVariationPayload(variation);

    if (updateWebsiteData) {
      const { data: updatedVariation } = await api.put(
        `products/${parentProduct.id}/variations/${existingVariation.id}`,
        updatePayload
      );
      productPermalink = updatedVariation.permalink;
    }

    itemCache[sku].variations[itemNumber] = buildVariationCacheItem(variation, existingVariation.id);

    updatedItems.push({
      itemNumber,
      sku,
      variationId: existingVariation.id,
      fields: 'Variation Adopted & Synced from Sheet'
    });

    return { productPermalink };
  }

  if (!updateWebsiteData) {
    errors.push({ index, sku, itemNumber, message: 'Dry Run: Variation would be created.' });
    return { productPermalink: null };
  }

  const { newVariation, cacheItem } = await createProductVariation(productData, parentProduct, ATTRIBUTES, api);
  itemCache[sku].variations[itemNumber] = cacheItem;

  updatedItems.push({
    itemNumber,
    sku,
    variationId: newVariation.id,
    fields: 'New Variation Created'
  });

  return { productPermalink: newVariation.permalink };
}

/**
 * Writes workbook/cache/log artifacts for the completed run.
 *
 * @param {Object} args
 * @param {string} args.outputFilePath
 * @param {Object} args.workbook
 * @param {string} args.cacheFile
 * @param {Object} args.itemCache
 * @param {string} args.logFile
 * @param {Array<Object>} args.updatedItems
 * @param {string} args.debugFile
 * @param {Array<Object>} args.errors
 * @returns {void}
 */
export function finalizeRun({
  outputFilePath,
  workbook,
  cacheFile,
  itemCache,
  logFile,
  updatedItems,
  debugFile,
  errors
}) {
  console.log(outputFilePath);
  writeUpdatedWorkbook(outputFilePath, workbook);
  writeCache(cacheFile, itemCache);
  writeUpdatedProductsLog(logFile, updatedItems);
  writeErrorsLog(debugFile, errors);

  console.log('\n\nProcess complete.');
  if (updatedItems.length > 0) {
    console.log(`[OK] ${updatedItems.length} items were created or updated.`);
  }
  if (errors.length > 0) {
    console.log(`Encountered ${errors.length} errors. Check ${debugFile} for details.\n`);
  }
}

/**
 * Writes a product URL into the "Product URL" worksheet column.
 *
 * Notes:
 * - `index` is zero-based from `masterData.entries()`.
 * - Excel row indices are one-based and include a header row.
 *
 * @param {string} productPermalink - URL returned by WooCommerce APIs.
 * @param {number} index - Zero-based data row index.
 * @param {number} urlColumnIndex - Zero-based index of "Product URL" in worksheet headers.
 * @param {xlsx.WorkSheet} worksheet - Worksheet object to mutate in memory.
 * @returns {void}
 */
export function insertURLIntoWorksheet(productPermalink, index, urlColumnIndex, worksheet) {
  if (urlColumnIndex < 0) {
    return;
  }

  productPermalink = productPermalink.split('?')[0];
  const rowIndex = index + 2;

  const colLetter = xlsx.utils.encode_col(urlColumnIndex);
  const cellAddress = `${colLetter}${rowIndex}`;

  xlsx.utils.sheet_add_aoa(worksheet, [[productPermalink]], { origin: cellAddress });
}
