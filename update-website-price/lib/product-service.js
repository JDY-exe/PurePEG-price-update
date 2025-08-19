// Helper to process categories
export async function processCategories(rawCategories, api) {
  if (!rawCategories) return [];
  const categoryNames = new Set(
    rawCategories
      .split(',')
      .map(c => c.split('>').pop().trim())
      .filter(Boolean)
  );

  const fetchPromises = Array.from(categoryNames).map(name =>
    api.get('products/categories', { search: name })
      .then(res => {
        const matchingCategory = res.data.find(
          category => category.name.toLowerCase() === name.toLowerCase()
        );
        return matchingCategory ? { id: matchingCategory.id } : null;
      })
      .catch(() => null)
  );

  const settledPromises = await Promise.all(fetchPromises);
  return settledPromises.filter(Boolean);
}

// Helper to format attributes for an API payload
export function formatAttributes(attributes, allAttributesRef) {
  return attributes.map(attr => {
    const attrRef = allAttributesRef.find(a => a.name === attr.name);
    if (!attrRef) throw new Error(`Attribute reference not found for "${attr.name}"`);
    return {
      id: attrRef.id,
      name: attr.name,
      visible: attr.isVisible ?? true,
      variation: attr.isVariation ?? false,
      position: attr.position ?? 0,
      options: attr.value ? splitEscapedString(attr.value.toString()) : ["N/A"]
    };
  });
}

export function splitEscapedString(str) {
  const parts = str.split(/(?<!\\),/);
  const result = parts.map(part => part.replace(/\\,/g, ','));

  return result;
}

/**
 * Creates a new parent (variable) product.
 */
export async function createParentProduct(productData, allAttributesRef, api) {
  const { master, variation, sku } = productData;

  // --- Validation Block ---
  for (const field of master.fields) {
    if (field.required && !field.value) {
      throw new Error(`Required parent field "${field.name}" is missing.`);
    }
  }

  // 1. Get the standard descriptive attributes
  let finalAttributes = formatAttributes(master.attributes, allAttributesRef);

  // 2. Find the global reference for the "Item #" attribute
  const variationAttrDef = variation.attribute;
  const itemNumberAttrRef = allAttributesRef.find(a => a.name === variationAttrDef.name);
  if (!itemNumberAttrRef) {
    throw new Error(`Could not find a global attribute reference for "${variationAttrDef.name}"`);
  }

  finalAttributes.push({
    id: itemNumberAttrRef.id,
    name: variationAttrDef.name,
    // Pre-populate the parent with the first variation's item number
    options: [variationAttrDef.value.toString()],
    position: variationAttrDef.position,
    visible: false, // The "Item #" dropdown is usually not shown to customers
    variation: true // CRITICAL: This enables the attribute for variations
  });

  // 3. Build the complete payload for the new product
  const payload = {
    name: master.fields.find(f => f.name === 'name').value,
    sku: sku.toString(), //Maybe add callback here
    type: "variable",
    attributes: finalAttributes,
    categories: await processCategories(master.categories, api)
  };

  // 5. Create the parent product via the API
  const response = await api.post('products', payload);
  const newProduct = response.data;

  // 6. Build and return the cache item as before
  const cacheItem = {
    parentId: newProduct.id,
    name: newProduct.name,
    sku: sku,
    categories: master.categories,
    attributes: master.attributes.reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
    variations: {}
  };

  return { newProduct, cacheItem };
}

/**
 * Creates a new product variation.
 */
export async function createProductVariation(productData, parentProduct, allAttributesRef, api) {
  const { variation } = productData;

  for (const field of variation.fields) {
    if (field.required && !field.value) {
      throw new Error(`Required variation field "${field.name}" is missing.`);
    }
  }
  for (const meta of variation.meta_data) {
    if (meta.required && !meta.value) {
      throw new Error(`Required variation metadata "${meta.key}" is missing.`);
    }
  }
  if (variation.attribute.required && !variation.attribute.value) {
    throw new Error(`Required variation attribute "${variation.attribute.name}" is missing.`);
  }

  // 1. Ensure the parent product is configured for variations
  const parentAttributes = parentProduct.attributes;
  const variationAttrDef = variation.attribute;
  const attrForVariation = parentAttributes.find(a => a.name === variationAttrDef.name);

  if (!attrForVariation) {
  const newAttribute = {
    id: allAttributesRef.find(attr => attr.name == variationAttrDef.name).id,
    name: variationAttrDef.name,
    options: [],
    position: variationAttrDef.position,
    visible: false,
    variation: true
  };

  parentAttributes.push(newAttribute);
  attrForVariation = newAttribute;
}
  const newOptionValue = variationAttrDef.value.toString();

  if (!attrForVariation.options.includes(newOptionValue)) {
    attrForVariation.options.push(newOptionValue);
    attrForVariation.variation = true;
    await api.put(`products/${parentProduct.id}`, {
      attributes: parentAttributes
    });
  }


  // 2. Build the variation payload
  const payload = {
    attributes: [{
      id: attrForVariation.id,
      option: variationAttrDef.value.toString()
    }],
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

  // 3. Create the variation
  const response = await api.post(`products/${parentProduct.id}/variations`, payload);
  const newVariation = response.data;

  // 4. Prepare cache item for the new variation
  const cacheItem = { variationId: newVariation.id };
  [...variation.fields, ...variation.meta_data].forEach(item => {
    cacheItem[item.name || item.key] = item.value;
  });

  return cacheItem;
}

