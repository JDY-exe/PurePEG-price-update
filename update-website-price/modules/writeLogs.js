import fs from 'fs';
export function writeCache(CACHE_FILE, cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`\n📦 Saved updated cache to ${CACHE_FILE}`);
}

export function writeUpdatedProductsLog(LOG_FILE, updatedItems) {
  const logHeader = 'Item Number,Variation ID,SKU,Regular Price\n';
  const csvLog = updatedItems.map(entry =>
    `${entry.itemNumber},${entry.variationId},${entry.sku},${entry.regular_price}`
  );
  fs.writeFileSync(LOG_FILE, logHeader + csvLog.join('\n'));
  console.log(`📝 Updated ${updatedItems.length} items, view in to ${LOG_FILE}`);
}

export function writeErrorsLog(DEBUG_FILE, errors) {

  const errorHeader = 'Line number (index),SKU,Catalog number (item #),Message\n';
  const csvErrors = errors.map(entry =>
    `${entry.index},${entry.sku},${entry.itemNumber},${entry.message}`
  );
  fs.writeFileSync(DEBUG_FILE, errorHeader + csvErrors.join('\n'));
  console.log(`⚠️ There were ${errors.length} non-critical errors, view in ${DEBUG_FILE}`)
}