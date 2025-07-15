import React, { useState, createElement } from 'react'
// The App component's contents are currently a placeholder — please update this file first for a new design / component!

import { FileUploadZone } from './components/FileUploadZone'
import { ProductSearch } from './components/ProductSearch'
import { ProductDetails } from './components/ProductDetails'
import { SavedChanges } from './components/SavedChanges'
export default function App() {
  const [database, setDatabase] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [changedProducts, setChangedProducts] = useState(null)
  const handleFileUpload = (data) => {
    setDatabase(data)
  }
  const handleProductSelect = (product) => {
    setSelectedProduct(product)
  }
  const handleSaveChanges = (updatedProduct) => {
    // Update the database with the changed product
    setDatabase((prevDatabase) =>
      prevDatabase.map((product) =>
        product.id === updatedProduct.id ? updatedProduct : product,
      ),
    )
    // Add to changed products list if not already there
    setChangedProducts((prevChangedProducts) => {
      const exists = prevChangedProducts.some((p) => p.id === updatedProduct.id)
      if (exists) {
        return prevChangedProducts.map((p) =>
          p.id === updatedProduct.id ? updatedProduct : p,
        )
      } else {
        return [...prevChangedProducts, updatedProduct]
      }
    })
  }
  const handleExportDatabase = () => {
    const dataStr = JSON.stringify(database, null, 2)
    const dataBlob = new Blob([dataStr], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'updated_database.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Product Price Updater
          </h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {database.length === 0 ? (
            <FileUploadZone onFileUpload={handleFileUpload} />
          ) : (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Search Products
                </h2>
                <ProductSearch
                  products={database}
                  onProductSelect={handleProductSelect}
                />
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {database.length} products in database
                  </span>
                  <button
                    onClick={handleExportDatabase}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Export Updated Database
                  </button>
                </div>
              </div>
              {selectedProduct && (
                <div className="bg-white shadow rounded-lg p-6">
                  <ProductDetails
                    product={selectedProduct}
                    onSaveChanges={handleSaveChanges}
                  />
                </div>
              )}
              {changedProducts.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <SavedChanges changedProducts={changedProducts} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
