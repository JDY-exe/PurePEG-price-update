export async function createParentProduct(row, ATTRIBUTES, api) {
  // Note: isMainAttribute is true if the attribute is a direct attribute of the product. (e.g. SKU)
  // it is false if it belongs in the attribute array. (e.g. M.F.)
  const productMainAttributes = [
    {
      name: "sku",
      required: true,
      value: row["Item"].toString()
    },
    {
      name: "name",
      required: true,
      value: row["Item_name"]
    },
    // {
    //   name: "weight",
    //   required: false,     //TODO: verify if weight required, assuming unit is always grams
    //   value: row["Size"]
    // }
  ]
  const productSideAttributes = [
    {
      name: "Appearance",
      required: false,
      value: row["Appearance"],
      fallbackValue: null,
      isVisible: true
    },
    {
      name: "CAS Number",
      required: false,
      value: row["CAS #"],
      fallbackValue: null,
      isVisible: true
    },
    {
      name: "SMILES",
      required: true,
      value: row["SMILES"],
      fallbackValue: null,
      isVisible: true
    },
    {
      name: "Full Name",
      required: false,
      value: row["Full_Name"],
      fallbackValue: row["Item_name"],
      isVisible: true
    },
    { 
      name: "Synonyms",
      required: false,
      value: row["Synonyms"],
      fallbackValue: row["Item_name"],
      isVisible: true
    },
    { 
      name: "Structure Formula", 
      required: false,
      value: row["M.F."], 
      fallbackValue: null,
      isVisible: true
    },
    { 
      name: "Molecular Weight",
      required: false,
      value: row["M.W."],
      fallbackValue: null,
      isVisible: true
    },
    { 
      name: "Storage", 
      required: false,
      value: row["Storage"],
      fallbackValue: null,
      isVisible: true
    },

    { 
      name: "PEG-Length", 
      required: false,
      value: row["PEG_length"],
      fallbackValue: null,
      isVisible: true
    },
  ]

  const product = {
    "type": "variable",
    "attributes": []
  };
  productMainAttributes.forEach((attrInArray) => {
    if (attrInArray.required && !attrInArray.value) {
      throw new Error(`Main product attribute ${attrInArray.name} is missing! (required)`);
    }
    product[attrInArray.name] = attrInArray.value;
  })
  productSideAttributes.forEach((attrInArray) => {
    const attributeRef = ATTRIBUTES.find((attr) => attr.name == attrInArray.name);
    if (!attributeRef) {
      throw new Error(`Main product attribute ${attrInArray.name} cannot be found or is not a valid attribute`);
    }
    if (attrInArray.required && !attrInArray.value) {
      throw new Error(`Main product attribute ${attrInArray.name} is missing! (required)`);
    }
    if (!attrInArray.value) {
      attrInArray.value = attrInArray.fallbackValue;
    }
    product.attributes.push({
      id: attributeRef.id,
      visible: attrInArray.isVisible,
      options: [attrInArray.value ? attrInArray.value.toString() : 'N/A']
    });
  })
  try {
    const response = await api.post('products', product);
    const mainProduct = response.data;
    return mainProduct;
  } catch (error) {
    throw error;
  }
}

export async function createProductVariation(row, mainProduct, ATTRIBUTES, api) {
  const mainProductId = mainProduct.id;
  const variationAttributes = [
    {
      name: "Item #",
      required: true,
      value: row["Catalog Number"],
      isMainAttribute: false
    },
    {
      name: "weight",
      required: true,     //TODO: verify if weight required, assuming unit is always grams
      value: row["Size"].toString(),
      isMainAttribute: true
    },
    {
      name: "regular_price",
      required: true,
      value: row["List Price"].toFixed(2),
      isMainAttribute: true
    }
  ]
  const variationMetadata = [
    {
      key: "_purity",
      required: true,
      value: row["Purity"]
    },
  ]
  const itemNumberAttr = variationAttributes.find(attr => attr.name === "Item #");
  const itemNumber = itemNumberAttr.value;
  if (!itemNumber || !itemNumber.toString().includes("-")) {
    throw new Error("This product doesn't have the right item # format (SKU-VAR). It is probably not a variation");
  }
  const product = {
    "attributes": [],
    "metadata": []
  };
  variationAttributes.forEach((attribute) => {
    if (attribute.required && !attribute.value) {
      throw new Error(`Attribute ${attribute.name} (required) is missing for this item!`);
    }
    if (!attribute.required && !attribute.value) {
      if (attribute.fallbackValue) {
        attribute.value = attribute.fallbackValue;
      }
      else {
        attribute.value = "N/A"; 
      }
    }
    if (attribute.isMainAttribute) {
      product[attribute.name] = attribute.value;
    }
    else {
      const attributeFormat = ATTRIBUTES.find(element => element.name == attribute.name);
      product.attributes.push({
        "id": attributeFormat.id,
        "option": attribute.value.toString()
      })
    }
  })

  variationMetadata.forEach((metadata) => {
    if (metadata.required && !metadata.value) {
      throw new Error(`Attribute ${metadata.key} (required) is missing for this item!`);
    }
    if (!metadata.required && !metadata.value) {
      if (metadata.fallbackValue) {
        metadata.value = metadata.fallbackValue;
      }
      else {
        metadata.value = "N/A"; 
      }
    }
    product.metadata.push({
      "key": metadata.key,
      "value": metadata.value.toString()
    })
  })
  try {
    let mainProductAttributes = mainProduct.attributes;
    const itemNumberAttributeIndex = mainProductAttributes.findIndex((attr) => attr.name == "Item #");
    if (itemNumberAttributeIndex == -1) {
      mainProductAttributes.push({
        "id": ATTRIBUTES.find(element => element.name == "Item #").id,
        "options": [itemNumber],
        "variation": true
      })
    } else {
      mainProductAttributes[itemNumberAttributeIndex].options.push(itemNumber);
    }
    await api.put(`products/${mainProductId}`, {
      "attributes": mainProductAttributes
    })
    const response = await api.post(`products/${mainProductId}/variations`, 
      product
    );
    const variationProductId = response.data?.id;
    return variationProductId;
  } catch(error) {
    console.log(error);
    throw new Error("Unable to create variation " + error.message);
  }
}