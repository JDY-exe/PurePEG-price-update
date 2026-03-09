/**
 * Maps a raw worksheet row into the normalized payload used across the app.
 * This is the central schema bridge between Excel column names and API/cache fields.
 */

/**
 * @typedef {Object} ProductFieldDefinition
 * @property {string} name - WooCommerce field key.
 * @property {*} value - Raw value read from workbook.
 * @property {boolean} [required] - Whether value is required before write operations.
 * @property {(value: any) => any} [callBackFn] - Optional value formatter for API payloads.
 */

/**
 * @typedef {Object} ProductAttributeDefinition
 * @property {string} name - Attribute display name in WooCommerce.
 * @property {*} value - Raw attribute value from worksheet.
 * @property {boolean} [isVisible] - Whether attribute is customer-visible.
 * @property {boolean} [isVariation] - Whether attribute participates in variations.
 * @property {number} [position] - Attribute order in WooCommerce UI.
 * @property {boolean} [required] - Whether attribute is required by local validation.
 */

/**
 * @typedef {Object} ProductMetaDefinition
 * @property {string} key - WooCommerce variation metadata key.
 * @property {*} value - Metadata value from worksheet.
 * @property {boolean} [required] - Whether metadata is required by local validation.
 * @property {(value: any) => any} [callBackFn] - Optional value formatter.
 */

/**
 * @typedef {Object} ProductData
 * @property {string|number} itemNumber
 * @property {string|number} sku
 * @property {{
 *   fields: Array<ProductFieldDefinition>,
 *   attributes: Array<ProductAttributeDefinition>,
 *   categories: string,
 *   permalink: string,
 *   shippingClassName: string,
 *   shippingClassSlug: string|null
 * }} master
 * @property {{
 *   fields: Array<ProductFieldDefinition>,
 *   meta_data: Array<ProductMetaDefinition>,
 *   attribute: ProductAttributeDefinition
 * }} variation
 */

/**
 * Maps one worksheet row into the internal `ProductData` shape.
 *
 * @param {Object<string, any>} row - Parsed worksheet row keyed by column header.
 * @returns {ProductData}
 */
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
      categories: row["Categories"],
      permalink: row["Product URL"],
      shippingClassName: row["Shipping class"],
      shippingClassSlug: null
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
