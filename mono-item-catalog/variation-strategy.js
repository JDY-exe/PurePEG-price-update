function parsePurity(value) {
    const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
    if (!match) return null;

    const purity = Number(match[0]);
    return Number.isFinite(purity) ? purity : null;
}

/**
 * Strategy 1: retain every variation in the product's lowest numeric purity
 * group. If none of the variations has a usable purity, retain all of them so
 * incomplete source data is not silently discarded.
 */
function keepLowestPurityVariations(variations) {
    const parsedPurities = variations.map(variation => parsePurity(variation["Purity"]));
    const validPurities = parsedPurities.filter(purity => purity !== null);

    if (validPurities.length === 0) return variations;

    const lowestPurity = Math.min(...validPurities);
    return variations.filter((variation, index) => parsedPurities[index] === lowestPurity);
}

export { keepLowestPurityVariations, parsePurity };
