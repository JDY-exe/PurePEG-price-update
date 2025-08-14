const BAR_LENGTH = 40;

export function updateProgressBar(index, total, currentItem) {
  const progress = (index + 1) / total;
  const filled = Math.round(BAR_LENGTH * progress);
  const bar = '='.repeat(filled) + '-'.repeat(BAR_LENGTH - filled);
  const percent = (progress * 100).toFixed(1);

  process.stdout.write(`\r[${bar}] ${index + 1}/${total} (${percent}%) | Current: ${currentItem}      `);
}