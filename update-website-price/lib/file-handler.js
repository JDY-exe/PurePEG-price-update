import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import XLSX from 'xlsx';

/**
 * Prompts the user to select an Excel file from a given folder.
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
 * Reads and parses the selected Excel file.
 */
export function readExcelData(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
}

/**
 * Loads the cache from a JSON file.
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
 * Writes data to the cache file.
 */
export function writeCache(cacheFile, data) {
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nCache saved to ${cacheFile}`);
}

/**
 * Writes updated product information to a CSV log.
 */
export function writeUpdatedProductsLog(logFile, updatedItems) {
  if (updatedItems.length === 0) return;
  const header = 'Item Number,SKU,Variation ID,Updated Fields\n';
  const rows = updatedItems.map(item => `${item.itemNumber},${item.sku},${item.variationId},"${item.fields}"`).join('\n');
  fs.writeFileSync(logFile, header + rows);
  console.log(`Update log saved to ${logFile}`);
}

/**
 * Writes errors to a CSV debug log.
 */
export function writeErrorsLog(debugFile, errors) {
  if (errors.length === 0) return;
  const header = 'Index,SKU,Item Number,Message\n';
  const rows = errors.map(e => `${e.index},${e.sku},${e.itemNumber},"${e.message}"`).join('\n');
  fs.writeFileSync(debugFile, header + rows);
  console.log(`Errors log saved to ${debugFile}`);
}
