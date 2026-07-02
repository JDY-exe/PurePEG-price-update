import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLowestPurityVariations, parsePurity } from './variation-strategy.js';

test('parses the purity formats used by the master sheet', () => {
    assert.equal(parsePurity('min.95%'), 95);
    assert.equal(parsePurity('min.98.5%'), 98.5);
    assert.equal(parsePurity('&gt;98.00%'), 98);
    assert.equal(parsePurity(''), null);
});

test('keeps all variations belonging to the lowest purity', () => {
    const variations = [
        { "Item #": '100L', "Purity": 'min.95%' },
        { "Item #": '250L', "Purity": 'min.95' },
        { "Item #": '100H', "Purity": 'min.99%' },
        { "Item #": '250H', "Purity": 'min.99%' },
        { "Item #": '500H', "Purity": 'min.99%' }
    ];

    assert.deepEqual(
        keepLowestPurityVariations(variations).map(variation => variation["Item #"]),
        ['100L', '250L']
    );
});

test('excludes missing purity when a valid purity group exists', () => {
    const variations = [
        { "Item #": 'unknown', "Purity": '' },
        { "Item #": 'known', "Purity": 'min.97%' }
    ];

    assert.deepEqual(keepLowestPurityVariations(variations), [variations[1]]);
});

test('keeps all variations when no purity can be compared', () => {
    const variations = [
        { "Item #": 'one', "Purity": '' },
        { "Item #": 'two', "Purity": undefined }
    ];

    assert.equal(keepLowestPurityVariations(variations), variations);
});
