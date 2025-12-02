# Cortana Document Filler - Umbrel App

A 100% local/offline web application that fills DOCX and PDF templates with placeholder data while preserving formatting.

## Features

- **🔒 100% Local Processing**: No data is sent anywhere - everything runs locally
- **📄 Multi-Format Support**: Upload .docx and .pdf files with placeholders
- **🎯 Smart Placeholder Detection**: Automatically detects and parses placeholders
- **📝 Dynamic Form Generation**: Creates forms based on detected placeholders
- **💾 Data Import/Export**: Save and load form data as JSON
- **🎨 Format Preservation**: Maintains original formatting (DOCX) or creates clean PDFs
- **📱 Responsive Design**: Works on desktop and mobile devices

## Installation

This app is designed to run on Umbrel. To install:

1. Add this Community App Store to your Umbrel instance
2. Navigate to the App Store in Umbrel
3. Find "Cortana Document Filler" and click Install

## Usage

1. **Upload Template**: Drag and drop or click to upload a .docx or .pdf file with placeholders
2. **Review Placeholders**: The app will show all detected placeholders with their types
3. **Fill Form**: Complete the auto-generated form with your data
4. **Download**: Click "Download Filled Document" to get your completed document

## Placeholder Syntax

### Basic Placeholders
- `{{client_name}}` - Simple text field
- `{{amount:number}}` - Number input
- `{{date:date}}` - Date picker
- `{{notes:multiline}}` - Multi-line text area

### Advanced Features
- `{{state|QLD}}` - Default value (QLD)
- `{{middle_name?optional}}` - Optional field (not required)
- `{{fee:number|0}}` - Number with default value 0

### Type Hints
- `:text` (default) - Text input
- `:number` - Number input
- `:date` - Date picker
- `:multiline` - Textarea

## Technical Details

- **Frontend**: TypeScript + Vite
- **Backend**: Node.js + Express
- **DOCX Processing**: docxtemplater + pizzip
- **PDF Processing**: pdf-lib, pdfjs-dist
- **OCR**: Tesseract.js (client-side)

## Privacy & Security

- ✅ No data is sent to external servers
- ✅ No analytics or tracking
- ✅ All processing happens locally
- ✅ Open source and auditable

## License

This project uses open-source libraries with MIT licenses.

