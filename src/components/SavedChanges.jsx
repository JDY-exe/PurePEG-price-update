import React from 'react'
export const SavedChanges = ({
  changedProducts,
}) => {
  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">Saved Changes</h3>
      <p className="text-sm text-gray-500 mb-4">
        You've updated prices for {changedProducts.length}{' '}
        {changedProducts.length === 1 ? 'product' : 'products'}.
      </p>
      <div className="overflow-hidden bg-white shadow sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {changedProducts.map((product) => (
            <li key={product.id}>
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm font-medium text-indigo-600">
                    {product.name}
                  </p>
                  <div className="ml-2 flex flex-shrink-0">
                    <p className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                      Updated
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500">
                      {product.variations.length} variations
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
