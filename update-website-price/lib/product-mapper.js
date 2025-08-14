export function mapRowToProductData(row) {
  const itemNumber = row["Item #"];
  const sku = row["SKU"];

  const productData = {
    itemNumber,
    sku,
    master: {
      fields: [
        { name: "name", required: true, value: row["Name"], callBackFn: (val) => val.toString() }
      ],
      attributes: [
        // These attributes are not functionally required to create a product,
        // so `required` is more for reference. They will default to "N/A" if missing.
        { name: "Full Name", value: row["Full Name"], isVisible: true, position: 1 },
        { name: "Synonyms", value: row["Synonyms"], isVisible: true, position: 2 },
        { name: "CAS Number", value: row["CAS Number"], isVisible: true, position: 3 },
        { name: "Molecular Formula", value: row["Molecular Formula"], isVisible: true, position: 4 },
        { name: "Molecular Weight", value: row["Molecular Weight"], isVisible: true, position: 5 },
        { name: "Appearance", value: row["Appearance"], isVisible: true, position: 6 },
        { name: "Storage", value: row["Storage"], isVisible: true, position: 7 },
        { name: "SMILES", value: row["SMILES"], isVisible: true, position: 8 },
        { name: "Functional Group", value: row["Functional Group"], isVisible: false, position: 9 },
        { name: "PEG-Length", value: row["PEG Length"], isVisible: false, position: 10 },
        { name: "Functional Group Prefix", value: row["Functional Group Prefix"], isVisible: false, position: 11 }
      ],
      categories: row["Categories"]
    },
    variation: {
      fields: [
        { name: "regular_price", value: row["List Price"], required: true, callBackFn: (val) => val.toFixed(2) },
        { name: "weight", value: row["Weight (g)"], required: true, callBackFn: (val) => val.toString() }
      ],
      meta_data: [
        { key: "_purity", required: true, value: row["Purity"] }
      ],
      // This attribute is functionally required to identify a variation
      attribute: { name: "Item #", value: itemNumber, isVariation: true, position: 0, required: true }
    }
  };

  return productData;
}
