const BAR_LENGTH = 40;

/**
 * Renders a single-line terminal progress bar for row processing.
 *
 * @param {number} index - Zero-based index of current row.
 * @param {number} total - Total number of rows.
 * @param {string|number} currentItem - Identifier shown beside progress bar.
 * @returns {void}
 */
export function updateProgressBar(index, total, currentItem) {
  const progress = (index + 1) / total;
  const filled = Math.round(BAR_LENGTH * progress);
  const bar = '='.repeat(filled) + '-'.repeat(BAR_LENGTH - filled);
  const percent = (progress * 100).toFixed(1);

  process.stdout.write(`\r[${bar}] ${index + 1}/${total} (${percent}%) | Current: ${currentItem}      `);
}
