# Changelog

## 2026-06-23

- Updated the website price sync variation mapping to read the spreadsheet `Sale Price` column and send it to WooCommerce as `sale_price`.
- Blank `Sale Price` values now send an empty `sale_price`, allowing existing variation sale prices to be cleared.

## 2026-06-05 (In email correspondence with Rebecca's email on Jun 3, 2026)

- Preserved the original parent-column order by reading the first worksheet header row and passing an explicit output header list to SheetJS.
- Appended all generated `Variation N ...` columns after the parent columns, preventing late-discovered variation columns from appearing after `Stock` or `In Stock`.
- Sorted each product's variations before output so `Item #` values ending in `L` appear first.
- Sorted variations by ascending `List Price` within both the `L` suffix group and the non-`L` group.
- Added numeric price parsing so formatted prices such as `$1,234.50` sort correctly, while blank or non-numeric prices fall to the end.
