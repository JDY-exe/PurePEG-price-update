import React, { useEffect, useState } from 'react'
import { SearchIcon } from 'lucide-react'
export const ProductSearch = ({
  products,
  onProductSelect,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([])
      return
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase()
    const results = products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        product.casNumber.toLowerCase().includes(lowerCaseSearchTerm) ||
        product.itemNumber.toLowerCase().includes(lowerCaseSearchTerm),
    )
    setSearchResults(results)
  }, [searchTerm, products])
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setIsDropdownOpen(true)
  }
  const handleProductClick = (product) => {
    onProductSelect(product)
    setSearchTerm('')
    setIsDropdownOpen(false)
  }
  return (
    <div className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          placeholder="Search products by name, CAS number, or item number"
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={() => setIsDropdownOpen(true)}
          onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
        />
      </div>
      {isDropdownOpen && searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {searchResults.map((product) => (
            <div
              key={product.id}
              className="cursor-pointer hover:bg-gray-100 px-4 py-2"
              onClick={() => handleProductClick(product)}
            >
              <div className="font-medium text-gray-900">{product.name}</div>
              <div className="text-sm text-gray-500">
                CAS: {product.casNumber} | Item: {product.itemNumber}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
