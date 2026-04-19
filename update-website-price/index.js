import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CATEGORIES,
  METADATA_FETCH_ERRORS,
  SHIPPING_CLASSES,
  SHIPPING_CLASS_BY_NAME
} from './lib/api.js';
import { selectExcelFile, readExcelWorkbook, loadCache } from './lib/file-handler.js';
import { mapRowToProductData } from './lib/product-mapper.js';
import { updateProgressBar } from './lib/utils.js';
import { getColumnIndex, validateProductData, resolveShippingClassSlug } from './lib/payload-builders.js';
import { handleStartupUpdate } from './lib/self-update.js';
import {
  processCachedProductRow,
  resolveParentProduct,
  resolveOrCreateVariation,
  finalizeRun,
  insertURLIntoWorksheet
} from './lib/sync-orchestrator.js';

/**
 * Orchestrator for syncing product data from an Excel workbook to WooCommerce.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Master switch to prevent accidental API writes during testing.
 * Set to false for dry-run style validation of the row processing pipeline.
 * @type {boolean}
 */
const UPDATE_WEBSITE_DATA = true;

/**
 * Returns the required working folder path argument.
 * @returns {string}
 */
function getRootFolderFromArgs() {
  const rootFolder = process.argv[2];
  if (!rootFolder) {
    console.error("❌ Please provide the working folder path as an argument.");
    process.exit(1);
  }

  return rootFolder;
}

/**
 * Ensures `meta/` exists and returns all run artifact file paths.
 * @returns {{ CACHE_FILE: string, LOG_FILE: string, DEBUG_FILE: string }}
 */
function getMetaFilePaths() {
  const metaDir = path.join(__dirname, 'meta');
  fs.mkdirSync(metaDir, { recursive: true });

  return {
    META_DIR: metaDir,
    CACHE_FILE: path.join(metaDir, 'product_cache.json'),
    LOG_FILE: path.join(metaDir, 'update_log.csv'),
    DEBUG_FILE: path.join(metaDir, 'debug_log.csv')
  };
}

/**
 * Preserves existing output naming behavior.
 * @param {string} excelFilePath
 * @returns {string}
 */
function getOutputFilePath(excelFilePath) {
  return excelFilePath.replace('.xlsm', '_temp.xlsm');
}

/**
 * Builds a descriptive error message from local or WooCommerce API failures.
 *
 * @param {Error & {response?: any}} error
 * @returns {string}
 */
function formatProcessingError(error) {
  const apiStatus = error.response?.status;
  const apiPayload = error.response?.data;
  const apiCode = apiPayload?.code;
  const apiMessage =
    typeof apiPayload === 'string'
      ? apiPayload
      : apiPayload?.message;

  const primary = apiMessage || error.message || 'Unknown error';
  const details = [];

  if (apiStatus) {
    details.push(`status=${apiStatus}`);
  }
  if (apiCode) {
    details.push(`code=${apiCode}`);
  }

  return details.length > 0 ? `${primary} (${details.join(', ')})` : primary;
}

/**
 * Entry point for the workbook synchronization flow.
 *
 * High-level flow:
 * 1. Prompt for workbook.
 * 2. Load workbook rows and local cache.
 * 3. For each row, validate and upsert parent + variation.
 * 4. Persist workbook changes, cache, and CSV logs.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.clear();
  const startedAt = new Date();

  const shouldExitAfterUpdate = await handleStartupUpdate(__dirname);
  if (shouldExitAfterUpdate) {
    process.exit(0);
  }

  const rootFolder = getRootFolderFromArgs();
  const { META_DIR, CACHE_FILE, LOG_FILE, DEBUG_FILE } = getMetaFilePaths();

  try {
    const excelFilePath = await selectExcelFile(rootFolder);
    const outputFilePath = getOutputFilePath(excelFilePath);

    const { workbook, worksheet, data: masterData } = readExcelWorkbook(excelFilePath);
    const itemCache = loadCache(CACHE_FILE);

    const updatedItems = [];
    const errors = [];

    const urlColumnIndex = getColumnIndex(masterData, 'Product URL');
    if (urlColumnIndex === -1) {
      console.warn('⚠️ Warning: "Product URL" column not found in the Excel sheet. Permalinks will not be saved.');
    }

    console.log(`\nStarting product processing for ${masterData.length} items...`);

    for (const [index, row] of masterData.entries()) {
      const productData = mapRowToProductData(row);
      const { itemNumber, sku } = productData;

      updateProgressBar(index, masterData.length, itemNumber);

      try {
        productData.master.shippingClassSlug = resolveShippingClassSlug(
          productData.master.shippingClassName,
          SHIPPING_CLASS_BY_NAME
        );
        validateProductData(productData);

        const cachedResult = await processCachedProductRow({
          productData,
          itemCache,
          updatedItems,
          index,
          urlColumnIndex,
          worksheet,
          updateWebsiteData: UPDATE_WEBSITE_DATA
        });
        if (cachedResult.handled) {
          continue;
        }

        const parentResult = await resolveParentProduct({
          productData,
          itemCache,
          updatedItems,
          errors,
          index,
          updateWebsiteData: UPDATE_WEBSITE_DATA
        });
        if (parentResult.skipRow) {
          continue;
        }

        const variationResult = await resolveOrCreateVariation({
          productData,
          parentProduct: parentResult.parentProduct,
          itemCache,
          updatedItems,
          errors,
          index,
          updateWebsiteData: UPDATE_WEBSITE_DATA
        });

        const productPermalink = variationResult.productPermalink ?? parentResult.productPermalink;
        if (productPermalink && urlColumnIndex !== -1) {
          insertURLIntoWorksheet(productPermalink, index, urlColumnIndex, worksheet);
        }
      } catch (error) {
        const errorMessage = formatProcessingError(error);
        errors.push({ index, sku, itemNumber, message: errorMessage });
      }
    }

    await finalizeRun({
      outputFilePath,
      workbook,
      cacheFile: CACHE_FILE,
      itemCache,
      logFile: LOG_FILE,
      updatedItems,
      debugFile: DEBUG_FILE,
      errors,
      metaDir: META_DIR,
      excelFilePath,
      totalRows: masterData.length,
      startedAt,
      finishedAt: new Date(),
      metadata: {
        shippingClasses: SHIPPING_CLASSES,
        categories: CATEGORIES,
        metadataErrors: METADATA_FETCH_ERRORS
      }
    });
  } catch (error) {
    console.error(`\n\nA critical error occurred: ${error.message}`);
    process.exit(1);
  }
}

main();
