import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';

/**
 * File-system and workbook helpers for:
 * - interactive workbook selection,
 * - workbook parsing and writing,
 * - cache/log persistence.
 */

/**
 * @typedef {Object} UpdatedItemLogRow
 * @property {string|number} itemNumber
 * @property {string|number} sku
 * @property {string|number} variationId
 * @property {string} fields
 */

/**
 * @typedef {Object} ErrorLogRow
 * @property {number} index
 * @property {string|number} sku
 * @property {string|number} itemNumber
 * @property {string} message
 */

/**
 * Prompts the user to select an Excel file (`.xlsx`/`.xlsm`) from a folder.
 *
 * @param {string} folderPath - Directory containing workbook candidates.
 * @returns {Promise<string>} Absolute path to selected workbook.
 * @throws {Error} When no matching workbook files are found.
 */
export async function selectExcelFile(folderPath) {
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsm') || f.endsWith('.xlsx'));
  if (files.length === 0) {
    throw new Error(`No .xlsx or .xlsm files found in folder: ${folderPath}`);
  }

  const { selectedFile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedFile',
      message: '📂 Select the Excel file to process:\nNote: The first sheet must be the master database.\n',
      choices: files
    }
  ]);

  return path.join(folderPath, selectedFile);
}

/**
 * Loads workbook and returns first worksheet as JSON rows.
 * The first sheet is treated as the source "master" sheet.
 *
 * @param {string} filePath - Workbook file path.
 * @returns {{workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet, data: Array<Object>}}
 */
export function readExcelWorkbook(filePath) {
  console.log(`\nReading Excel file: ${path.basename(filePath)}`);
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  console.log(`Found ${data.length} rows to process.`);
  return { workbook, worksheet, data };
}



/**
 * Loads the product cache from disk if present.
 *
 * @param {string} cacheFile - Path to cache JSON file.
 * @returns {Object<string, Object>} Parsed cache keyed by SKU.
 */
export function loadCache(cacheFile) {
  if (fs.existsSync(cacheFile)) {
    const data = fs.readFileSync(cacheFile, 'utf-8');
    const cache = JSON.parse(data);
    console.log(`Loaded ${Object.keys(cache).length} cached item(s).`);
    return cache;
  }
  return {};
}

/**
 * Persists the in-memory cache to JSON.
 *
 * @param {string} cacheFile - Path to cache JSON file.
 * @param {Object<string, Object>} data - Cache object keyed by SKU.
 * @returns {void}
 */
export function writeCache(cacheFile, data) {
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nCache saved to ${cacheFile}`);
}

/**
 * Writes created/updated product summary rows to CSV.
 *
 * @param {string} logFile - Destination CSV path.
 * @param {Array<UpdatedItemLogRow>} updatedItems - Rows to write.
 * @returns {void}
 */
export function writeUpdatedProductsLog(logFile, updatedItems) {
  if (updatedItems.length === 0) return;
  const header = 'Item Number,SKU,Variation ID,Updated Fields\n';
  const rows = updatedItems.map(item => `${item.itemNumber},${item.sku},${item.variationId},"${item.fields}"`).join('\n');
  fs.writeFileSync(logFile, header + rows);
  console.log(`Update log saved to ${logFile}`);
}

/**
 * Writes processing errors to CSV for post-run triage.
 *
 * @param {string} debugFile - Destination CSV path.
 * @param {Array<ErrorLogRow>} errors - Error rows to write.
 * @returns {void}
 */
export function writeErrorsLog(debugFile, errors) {
  if (errors.length === 0) return;
  const header = 'Index,SKU,Item Number,Message\n';
  const rows = errors.map(e => `${e.index},${e.sku},${e.itemNumber},"${e.message}"`).join('\n');
  fs.writeFileSync(debugFile, header + rows);
  console.log(`Errors log saved to ${debugFile}`);
}

/**
 * Writes an in-memory workbook back to disk.
 *
 * @param {string} filePath - Full output workbook path.
 * @param {XLSX.WorkBook} workbook - Workbook object to persist.
 * @returns {void}
 */
export function writeUpdatedWorkbook(filePath, workbook) {
  try {
    XLSX.writeFile(workbook, filePath);
    console.log(`\n💾 Formatted workbook saved to: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error writing workbook to file: ${error.message}`);
  }
}

