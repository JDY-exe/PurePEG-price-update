import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

/**
 * Escapes untrusted values for safe HTML output.
 *
 * @param {any} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts any value into a compact display string.
 *
 * @param {any} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Builds git-diff style lines from a change record.
 *
 * @param {Object} change
 * @returns {Array<{type: string, text: string}>}
 */
function buildDiffLines(change) {
  if (change?.kind === 'info') {
    return [{ type: 'info', text: `~ ${change.field}: ${formatValue(change.after)}` }];
  }

  const beforeValue = change?.before;
  const afterValue = change?.after;
  const fieldLabel = change?.field ?? 'field';

  if (beforeValue === undefined && afterValue !== undefined) {
    return [{ type: 'add', text: `+ ${fieldLabel}: ${formatValue(afterValue)}` }];
  }

  if (beforeValue !== undefined && afterValue === undefined) {
    return [{ type: 'remove', text: `- ${fieldLabel}: ${formatValue(beforeValue)}` }];
  }

  if (beforeValue === afterValue) {
    return [{ type: 'info', text: `~ ${fieldLabel}: ${formatValue(afterValue)}` }];
  }

  return [
    { type: 'remove', text: `- ${fieldLabel}: ${formatValue(beforeValue)}` },
    { type: 'add', text: `+ ${fieldLabel}: ${formatValue(afterValue)}` }
  ];
}

/**
 * Formats a date for display in the report.
 *
 * @param {Date|string|number|null|undefined} dateInput
 * @returns {string}
 */
function formatDate(dateInput) {
  if (!dateInput) {
    return 'N/A';
  }

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString();
}

/**
 * Returns a file-system-safe timestamp for artifact names.
 *
 * @param {Date} date
 * @returns {string}
 */
function toFileTimestamp(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

/**
 * Generates a static HTML report for a single run.
 *
 * @param {Object} args
 * @param {string} args.metaDir
 * @param {string} args.excelFilePath
 * @param {string} args.outputFilePath
 * @param {string} args.logFile
 * @param {string} args.debugFile
 * @param {string} args.cacheFile
 * @param {Array<Object>} args.updatedItems
 * @param {Array<Object>} args.errors
 * @param {number} args.totalRows
 * @param {Date|string|number} args.startedAt
 * @param {Date|string|number} args.finishedAt
 * @param {Object} args.metadata
 * @returns {string} Absolute path to the generated report.
 */
export function writeRunReport({
  metaDir,
  excelFilePath,
  outputFilePath,
  logFile,
  debugFile,
  cacheFile,
  updatedItems,
  errors,
  totalRows,
  startedAt,
  finishedAt,
  metadata
}) {
  const reportsDir = path.join(metaDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportTimestamp = toFileTimestamp(new Date());
  const reportPath = path.join(reportsDir, `run-report-${reportTimestamp}.html`);

  const shippingClasses = metadata?.shippingClasses ?? [];
  const categories = metadata?.categories ?? [];
  const metadataErrors = metadata?.metadataErrors ?? [];

  const updatesHtml = updatedItems.length === 0
    ? '<p class="empty">No products were changed during this run.</p>'
    : updatedItems.map(item => {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      const diffLines = changes.length === 0
        ? [{ type: 'info', text: `~ ${item.fields || 'Update recorded'}` }]
        : changes.flatMap(buildDiffLines);

      const diffHtml = diffLines.map(line => {
        const cssClass =
          line.type === 'add' ? 'diff-add' :
          line.type === 'remove' ? 'diff-remove' :
          'diff-info';
        return `<div class="diff-line ${cssClass}">${escapeHtml(line.text)}</div>`;
      }).join('');

      const rowDisplay = item.rowIndex != null ? Number(item.rowIndex) + 2 : 'N/A';

      return `
        <section class="card">
          <h3>Row ${escapeHtml(rowDisplay)} | SKU ${escapeHtml(item.sku)} | Item # ${escapeHtml(item.itemNumber)}</h3>
          <div class="meta">Variation ID: ${escapeHtml(item.variationId)}</div>
          <div class="diff">${diffHtml}</div>
        </section>
      `;
    }).join('');

  const errorsHtml = errors.length === 0
    ? '<p class="empty">No errors recorded.</p>'
    : `
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>SKU</th>
            <th>Item #</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          ${errors.map(error => `
            <tr>
              <td>${escapeHtml(Number(error.index) + 2)}</td>
              <td>${escapeHtml(error.sku)}</td>
              <td>${escapeHtml(error.itemNumber)}</td>
              <td>${escapeHtml(error.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  const shippingClassRows = shippingClasses.length === 0
    ? '<tr><td colspan="2">No shipping classes fetched.</td></tr>'
    : shippingClasses.map(shippingClass => `
      <tr>
        <td>${escapeHtml(shippingClass.name)}</td>
        <td>${escapeHtml(shippingClass.slug)}</td>
      </tr>
    `).join('');

  const categoryRows = categories.length === 0
    ? '<tr><td colspan="3">No categories fetched.</td></tr>'
    : categories.map(category => `
      <tr>
        <td>${escapeHtml(category.id)}</td>
        <td>${escapeHtml(category.name)}</td>
        <td>${escapeHtml(category.slug)}</td>
      </tr>
    `).join('');

  const metadataErrorHtml = metadataErrors.length === 0
    ? '<p class="empty">No metadata fetch warnings.</p>'
    : `
      <ul>
        ${metadataErrors.map(message => `<li>${escapeHtml(message)}</li>`).join('')}
      </ul>
    `;

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PurePEG Update Run Report</title>
  <style>
    :root {
      --bg: #f6f8fa;
      --card: #ffffff;
      --text: #101828;
      --muted: #475467;
      --border: #d0d5dd;
      --add-bg: #ecfdf3;
      --add-text: #05603a;
      --remove-bg: #fef3f2;
      --remove-text: #b42318;
      --info-bg: #eef4ff;
      --info-text: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(140deg, #f6f8fa 0%, #eef2f8 100%);
      color: var(--text);
    }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 1.75rem; }
    h2 { margin-top: 32px; font-size: 1.2rem; }
    .summary {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .summary .card, .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
    }
    .meta {
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 10px;
    }
    .diff {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .diff-line {
      padding: 8px 10px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 0.9rem;
      border-top: 1px solid var(--border);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .diff-line:first-child { border-top: none; }
    .diff-add { background: var(--add-bg); color: var(--add-text); }
    .diff-remove { background: var(--remove-bg); color: var(--remove-text); }
    .diff-info { background: var(--info-bg); color: var(--info-text); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-top: 1px solid var(--border);
      vertical-align: top;
    }
    thead th {
      border-top: none;
      background: #f2f4f7;
    }
    .empty { color: var(--muted); }
    code {
      background: #eef2f8;
      padding: 1px 6px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <h1>PurePEG Website Update Report</h1>
  <div class="summary">
    <div class="card"><strong>Started</strong><br />${escapeHtml(formatDate(startedAt))}</div>
    <div class="card"><strong>Finished</strong><br />${escapeHtml(formatDate(finishedAt))}</div>
    <div class="card"><strong>Total Rows</strong><br />${escapeHtml(totalRows)}</div>
    <div class="card"><strong>Updated Rows</strong><br />${escapeHtml(updatedItems.length)}</div>
    <div class="card"><strong>Error Count</strong><br />${escapeHtml(errors.length)}</div>
  </div>

  <h2>Artifacts</h2>
  <div class="card">
    <div><strong>Input Workbook:</strong> <code>${escapeHtml(excelFilePath)}</code></div>
    <div><strong>Output Workbook:</strong> <code>${escapeHtml(outputFilePath)}</code></div>
    <div><strong>Update CSV:</strong> <code>${escapeHtml(logFile)}</code></div>
    <div><strong>Error CSV:</strong> <code>${escapeHtml(debugFile)}</code></div>
    <div><strong>Cache File:</strong> <code>${escapeHtml(cacheFile)}</code></div>
    <div><strong>Report File:</strong> <code>${escapeHtml(reportPath)}</code></div>
  </div>

  <h2>Changes (Diff Style)</h2>
  ${updatesHtml}

  <h2>Errors</h2>
  ${errorsHtml}

  <h2>Fetched Metadata</h2>
  <div class="card">
    <div><strong>Shipping Classes Fetched:</strong> ${escapeHtml(shippingClasses.length)}</div>
    <div><strong>Categories Fetched:</strong> ${escapeHtml(categories.length)}</div>
  </div>

  <h3>Shipping Classes</h3>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Slug</th>
      </tr>
    </thead>
    <tbody>${shippingClassRows}</tbody>
  </table>

  <h3>Categories</h3>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Slug</th>
      </tr>
    </thead>
    <tbody>${categoryRows}</tbody>
  </table>

  <h3>Metadata Warnings</h3>
  ${metadataErrorHtml}
</body>
</html>
`;

  fs.writeFileSync(reportPath, html, 'utf8');
  return reportPath;
}

/**
 * Opens a local HTML report in the default browser.
 *
 * @param {string} reportPath
 * @returns {Promise<void>}
 */
export function openReportInBrowser(reportPath) {
  const resolvedPath = path.resolve(reportPath).replace(/\\/g, '/');
  const fileUrl = `file:///${resolvedPath}`;
  const command =
    process.platform === 'win32'
      ? `start "" "${fileUrl}"`
      : process.platform === 'darwin'
        ? `open "${fileUrl}"`
        : `xdg-open "${fileUrl}"`;

  return new Promise((resolve, reject) => {
    exec(command, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
