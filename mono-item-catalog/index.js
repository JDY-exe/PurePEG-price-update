import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import inquirer from 'inquirer';

/**
 * This script combines two processes into a single, in-memory operation:
 * 1. Restructures a master database by pivoting product variations into columns.
 * 2. Injects the restructured data directly into a template Excel file to create a final catalog,
 * without creating any intermediate files.
 */



async function main() {
    console.clear();
    const currentDirectory = process.cwd();
    const rootFolder = process.argv[2];
    if (!rootFolder) {
        console.error("❌ Please provide the working folder path as an argument.");
        process.exit(1);
    }
    const excelFilePath = await selectExcelFile(rootFolder);
    const sourceData = readExcelData(excelFilePath);

    try {

        // --- Step 2: Group all variations by their parent SKU ---
        console.log('🔄 Grouping variations by SKU...');
        const productsBySku = {};
        const variationFields = ["Item #", "Weight (g)", "Purity", "List Price"];

        for (const row of sourceData) {
            const sku = row['SKU'];
            if (!sku) continue; // Skip rows without an SKU

            // If we haven't seen this SKU yet, create its parent entry
            if (!productsBySku[sku]) {
                productsBySku[sku] = {
                    parentData: {},
                    variations: []
                };
                // Copy all non-variation fields as parent data
                for (const key in row) {
                    if (!variationFields.includes(key)) {
                        productsBySku[sku].parentData[key] = row[key];
                    }
                }
            }

            // Extract the variation-specific data
            const variationData = {};
            for (const field of variationFields) {
                variationData[field] = row[field];
            }
            productsBySku[sku].variations.push(variationData);
        }

        // --- Step 3: Flatten the grouped data into the final row format ---
        console.log('✨ Preparing the new spreadsheet structure...');
        const outputRows = [];
        let maxVariations = 0;

        // Find the maximum number of variations for any single product
        for (const sku in productsBySku) {
            const numVariations = productsBySku[sku].variations.length;
            if (numVariations > maxVariations) {
                maxVariations = numVariations;
            }
        }

        // Create the new rows
        for (const sku in productsBySku) {
            const product = productsBySku[sku];
            const newRow = { ...product.parentData };

            // Add each variation as a set of new columns
            product.variations.forEach((variation, index) => {
                const i = index + 1;
                newRow[`Variation ${i} Item #`] = variation["Item #"];
                newRow[`Variation ${i} Weight (g)`] = variation["Weight (g)"];
                newRow[`Variation ${i} Purity`] = variation["Purity"];
                newRow[`Variation ${i} List Price`] = variation["List Price"];
            });

            outputRows.push(newRow);
        }

        // --- Step 4: Write the restructured data to a new Excel file ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFileName = `mono-item-master-${timestamp}.xlsx`;
        const outputDirectory = "mono-item-catalog"
        console.log(`\n✍️ Writing ${outputRows.length} products to "${outputFileName}"...`);

        const newWorksheet = XLSX.utils.json_to_sheet(outputRows);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Restructured Data');
        XLSX.writeFile(newWorkbook, path.join(outputDirectory, outputFileName));

        console.log('\n✅ Success! The new file has been created.');

    } catch (error) {
        console.error('\n💥 An error occurred during the process:');
        console.error(error);
    }
}

async function selectExcelFile(folderPath) {
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
function readExcelData(filePath) {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
}
main();
