import React, { useState, useRef } from 'react'
export const FileUploadZone = ({
  onFileUpload,
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef(null)
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) {
      setIsDragging(true)
    }
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }
  const processFile = (file) => {
    setError(null)
    if (file.type !== 'application/json') {
      setError('Please upload a JSON file')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = e.target?.result
        if (typeof result === 'string') {
          const parsedData = JSON.parse(result)
          if (Array.isArray(parsedData)) {
            onFileUpload(parsedData)
          } else {
            setError('Invalid data format. Expected an array of products.')
          }
        }
      } catch (error) {
        setError('Error parsing file. Please make sure it contains valid JSON.')
      }
    }
    reader.onerror = () => {
      setError('Error reading file')
    }
    reader.readAsText(file)
  }
  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-12 text-center ${isDragging ? 'border-gray-600 bg-gray-50' : 'border-gray-300'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="space-y-4">
        <div className="mx-auto h-20 w-20 flex items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-10 w-10 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <div className="text-lg font-medium text-gray-900">
          Drag and drop your database file here
        </div>
        <p className="text-sm text-gray-500">
          or{' '}
          <button
            type="button"
            className="text-gray-600 hover:text-gray-500 font-medium focus:outline-none cursor-pointer"
            onClick={handleBrowseClick}
          >
            browse
          </button>{' '}
          to choose a file
        </p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".json,application/json"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
