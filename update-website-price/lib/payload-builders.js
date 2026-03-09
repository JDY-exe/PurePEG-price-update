import { splitEscapedString } from './product-service.js';

/**
 * Builder and validation helpers for row-derived product data.
 */

/**
 * Finds a field value in a `{ name, value }` array by field name.
 *
 * @param {Array<{name: string, value: any}>} fields
 * @param {string} fieldName
 * @returns {any}
 */
export function getFieldValue(fields, fieldName) {
  return fields.find(field => field.name === fieldName)?.value;
}

/**
 * Finds the worksheet column index for a specific header name.
 *
 * @param {Array<Object>} rows
 * @param {string} header
 * @returns {number}
 */
export function getColumnIndex(rows, header) {
  if (rows.length === 0) {
    return -1;
  }

  const headers = Object.keys(rows[0]);
  return headers.indexOf(header);
}

/**
 * Throws when required row-derived values are missing.
 *
 * @param {Object} productData
 * @returns {void}
 */
export function validateProductData(productData) {
  const { master, variation } = productData;

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
}

/**
 * Resolves a sheet-provided shipping class name to a WooCommerce shipping class slug.
 *
 * Rules:
 * - blank/empty name => null (leave unchanged)
 * - non-empty unknown name => throws error
 *
 * @param {string|null|undefined} shippingClassName
 * @param {Object<string, string>} shippingClassByName
 * @returns {string|null}
 */
export function resolveShippingClassSlug(shippingClassName, shippingClassByName) {
  if (shippingClassName === null || shippingClassName === undefined) {
    return null;
  }

  const normalizedName = shippingClassName.toString().trim();
  if (!normalizedName) {
    return null;
  }

  const slug = shippingClassByName[normalizedName.toLowerCase()];
  if (!slug) {
    throw new Error(
      `Shipping class "${normalizedName}" is not one of the available shipping class options.`
    );
  }

  return slug;
}

/**
 * Merges worksheet attributes into remote attributes.
 * Existing entries are updated, missing entries are appended.
 *
 * @param {Array<Object>} remoteAttributes
 * @param {Array<Object>} sheetAttributes
 * @param {Array<Object>} allAttributesRef
 * @returns {Array<Object>}
 */
export function mergeAttributes(remoteAttributes, sheetAttributes, allAttributesRef) {
  const mergedAttributes = remoteAttributes ?? [];

  sheetAttributes.forEach(attr => {
    const attrRef = allAttributesRef.find(reference => reference.name === attr.name);
    const remoteAttrIndex = mergedAttributes.findIndex(remote =>
      (attrRef && remote.id === attrRef.id) || remote.name === attr.name
    );
    const optionValue = attr.value ? splitEscapedString(attr.value.toString()) : ['N/A'];

    if (remoteAttrIndex !== -1) {
      mergedAttributes[remoteAttrIndex].options = optionValue;
      return;
    }

    if (!attrRef) {
      return;
    }

    mergedAttributes.push({
      id: attrRef.id,
      name: attr.name,
      visible: attr.isVisible ?? true,
      variation: attr.isVariation ?? false,
      position: attr.position ?? 0,
      options: optionValue
    });
  });

  return mergedAttributes;
}

/**
 * Returns a `{ [attributeName]: attributeValue }` object for cache persistence.
 *
 * @param {Array<{name: string, value: any}>} masterAttributes
 * @returns {Object<string, any>}
 */
export function toAttributeValueMap(masterAttributes) {
  return masterAttributes.reduce((accumulator, attribute) => {
    accumulator[attribute.name] = attribute.value;
    return accumulator;
  }, {});
}

/**
 * Builds the parent cache record from current sheet values.
 *
 * @param {Object} args
 * @param {number} args.parentId
 * @param {string|number} args.sku
 * @param {Object} args.master
 * @param {string|null} [args.shippingClassSlug]
 * @returns {Object}
 */
export function buildParentCacheItem({ parentId, sku, master, shippingClassSlug = null }) {
  return {
    parentId,
    name: getFieldValue(master.fields, 'name'),
    sku,
    categories: master.categories,
    shipping_class: shippingClassSlug,
    attributes: toAttributeValueMap(master.attributes),
    variations: {}
  };
}

/**
 * Builds a variation payload from mapped sheet row values.
 *
 * @param {Object} variation
 * @returns {Object}
 */
export function buildVariationPayload(variation) {
  const payload = {
    meta_data: []
  };

  variation.fields.forEach(field => {
    payload[field.name] = field.callBackFn ? field.callBackFn(field.value) : field.value;
  });

  variation.meta_data.forEach(meta => {
    payload.meta_data.push({
      key: meta.key,
      value: meta.callBackFn ? meta.callBackFn(meta.value) : meta.value.toString()
    });
  });

  return payload;
}

/**
 * Builds the variation cache row from sheet values.
 *
 * @param {Object} variation
 * @param {number} variationId
 * @returns {Object}
 */
export function buildVariationCacheItem(variation, variationId) {
  const cacheItem = { variationId };

  variation.fields.forEach(field => {
    cacheItem[field.name] = field.value;
  });

  variation.meta_data.forEach(meta => {
    cacheItem[meta.key] = meta.value;
  });

  return cacheItem;
}
