import React, { useState } from 'react'

export const ProductDetails = ({
  product,
  onSaveChanges,
}) => {
  const [editedProduct, setEditedProduct] = useState<Product>({
    ...product,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const handlePriceChange = (
    variationIndex,
    field,
    value,
  ) => {
    const numericValue = parseFloat(value)
    if (isNaN(numericValue)) return
    const updatedVariations = [...editedProduct.variations]
    updatedVariations[variationIndex] = {
      ...updatedVariations[variationIndex],
      [field]: numericValue,
    }
    setEditedProduct({
      ...editedProduct,
      variations: updatedVariations,
    })
    setHasChanges(true)
  }
  const handleSave = () => {
    onSaveChanges(editedProduct)
    setHasChanges(false)
  }
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <div className="text-sm text-gray-700">
            <span className="font-medium">CAS Number:</span> {product.casNumber}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-medium">Item Number:</span>{' '}
            {product.itemNumber}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Product Variations
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Item Number
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Size
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Purity
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Discount Price
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Regular Price
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {editedProduct.variations.map((variation, index) => (
                <tr key={variation.itemNumber}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {variation.itemNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {variation.size}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {variation.purity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="relative mt-1 rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-gray-500 sm:text-sm">$</span>
                      </div>
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={variation.discountPrice}
                        onChange={(e) =>
                          handlePriceChange(
                            index,
                            'discountPrice',
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="relative mt-1 rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-gray-500 sm:text-sm">$</span>
                      </div>
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={variation.regularPrice}
                        onChange={(e) =>
                          handlePriceChange(
                            index,
                            'regularPrice',
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${hasChanges ? 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500' : 'bg-gray-300 cursor-not-allowed'}`}
          onClick={handleSave}
          disabled={!hasChanges}
        >
          Save Changes
        </button>
      </div>
    </div>
  )
}
