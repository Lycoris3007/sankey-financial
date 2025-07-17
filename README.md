# SankeyMATIC Financial
## Enhanced Financial Flow Diagram Builder
### A specialized [Sankey diagram](https://en.wikipedia.org/wiki/Sankey_diagram) tool for financial analysis

* **🆕 API Integration**: Automatically generate diagrams from Financial Modeling Prep API data
* **📊 Financial Templates**: Pre-built templates for income statements and revenue analysis
* **📈 Change Tracking**: Display year-over-year and quarter-over-quarter changes
* **🎯 Smart Formatting**: Automatic node name formatting and line breaks for readability
* **💼 Professional Output**: Export publication-ready financial diagrams with custom styling
* **🔧 Customizable**: Full control over colors, layout, fonts, and styling
* **🎨 Enhanced Typography**: AlibabaPuHuiTi-3 font integration for professional appearance
* **📏 Optimized Layout**: Custom margins, spacing, and label positioning for financial data

## 🚀 Key Features

### 1. **API Data Integration**
- Connect to Financial Modeling Prep API with your own API key
- Automatically fetch income statement and revenue segmentation data
- Support for both annual and quarterly data
- Historical period selection with automatic change calculation
- **Period Matching**: Ensures income statement and segmentation data are from the same period

### 2. **Financial Flow Logic**
- Accurate representation of financial statement relationships
- Revenue → Gross Profit → Operating Income → Net Income flow
- Proper handling of expenses, taxes, and other income/expenses
- Support for revenue segmentation by business units

### 3. **Professional Formatting**
- Automatic abbreviations (R&D, SG&A, G&A, S&M)
- Smart line breaks for long node names
- Consistent color coding for financial categories
- Currency formatting with millions/billions suffixes

### 4. **Change Analysis**
- Year-over-year (Y/Y) and quarter-over-quarter (Q/Q) comparisons
- Automatic percentage calculations from historical data
- Visual change indicators on each node
- Customizable change suffixes and formatting

### 5. **Enhanced Visual Design**
- Custom AlibabaPuHuiTi-3 font family for professional typography
- Optimized margins and spacing for financial diagrams (Left: 150px, Right: 200px, Top/Bottom: 80px)
- Granular font size control for different label components
- Color-coded node values based on financial statement categories
- Improved label positioning and line spacing (0.35) for better readability

Based on the original SankeyMATIC by **Steve Bogart** ([@nowthis@tilde.zone](https://tilde.zone/@nowthis))

## 📖 Quick Start Guide

### Method 1: API Data Integration (Recommended)

**Step 1: Get Your API Key**
1. Visit [Financial Modeling Prep](https://financialmodelingprep.com/developer/docs)
2. Sign up for a free account (250 API calls/month)
3. Copy your API key

**Step 2: Generate Financial Diagrams**
1. Click "Load from API" in the application
2. Enter your FMP API key
3. Enter a stock symbol (e.g., NVDA, AAPL, MSFT)
4. Select annual or quarterly data
5. Choose a specific reporting period
6. Click "Get Data" to automatically generate the diagram

**Features:**
- ✅ Automatic income statement flow generation
- ✅ Revenue segmentation by business units
- ✅ Year-over-year or quarter-over-quarter change tracking
- ✅ Professional formatting and color coding
- ✅ Smart node name formatting with line breaks
- ✅ Custom AlibabaPuHuiTi-3 font for enhanced readability
- ✅ Optimized layout with professional margins and spacing
- ✅ Color-coded financial values by category
- ✅ High-quality PNG export with embedded logo

### Method 2: Manual Input

Create flows between nodes using this simple format:
```
Source [Amount] Target
```

**Example:**
```
Revenue [1000] Operating Expenses
Revenue [500] Net Income
Operating Expenses [600] Salaries
Operating Expenses [400] Marketing
```

## 🎯 Input Format Reference

### 1. Basic Flows
The core building blocks of your diagram:

```
NodeA [100] NodeB
NodeA [50] NodeC
NodeB [75] NodeD
```

- **Source**: The starting node name
- **[Amount]**: The flow value in square brackets
- **Target**: The destination node name

### 2. Node Customization
Customize node appearance and add previous values for change tracking:

```
:NodeName #color .opacity [previousValue] >> <<
```

**Parameters:**
- `:NodeName` - Node identifier (required)
- `#color` - Hex color code (optional, e.g., `#057`, `#ff0000`)
- `.opacity` - Opacity value (optional, e.g., `.8`, `.5`)
- `[previousValue]` - Previous period value for change calculation (optional)
- `>>` or `<<` - Color inheritance indicators (optional)

**Examples:**
```
:Revenue #057                    // Blue color
:Profit #48e .8                  // Light blue with 80% opacity
:Expenses #d97 [450]             // Red color with previous value for changes
:Budget #057 [1600] >>           // Blue with previous value and color inheritance
```

### 3. Special Flow Operations

**Use remaining amount:**
```
Budget [*] Savings
```
The `[*]` automatically calculates and uses any remaining amount from the source node.

**Fill missing amount:**
```
Revenue [?] Unknown Expenses
```
The `[?]` fills in the amount needed to balance the flows.

### 4. Comments
Add comments to document your diagram:
```
// This is a comment
// Comments start with // or '
' This is also a comment
```

### 5. Settings Configuration
Configure diagram appearance using settings:

```
diagram_title 'Company Q3 2023 Income Statement'
labelchange_appears y
labelchange_suffix ' Y/Y'
title_size 28
title_color #333333
node_theme a
size_w 800
size_h 600
```

## 🔌 API Integration Guide

### Supported Data Sources
- **Financial Modeling Prep API**: Income statements and revenue segmentation
- **Supported Companies**: All publicly traded companies (NYSE, NASDAQ, etc.)
- **Data Types**: Annual (10-K) and Quarterly (10-Q) financial statements
- **Historical Data**: Up to 10+ years of historical data for trend analysis

### API Setup Instructions

**1. Get Your Free API Key:**
```
1. Visit: https://financialmodelingprep.com/developer/docs
2. Click "Sign Up" for a free account
3. Verify your email address
4. Navigate to Dashboard → API Keys
5. Copy your API key (format: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
```

**2. Using the API Integration:**
```
1. Open the application
2. Click "Load from API" button
3. Paste your API key in the "FMP API Key" field
4. Enter stock symbol (e.g., NVDA, AAPL, TSLA, MSFT)
5. Select period type: Annual or Quarterly
6. Choose specific period from dropdown
7. Check "Include revenue segmentation" if available
8. Click "Get Data"
```

**3. Generated Diagram Features:**
- **Income Statement Flow**: Revenue → Gross Profit → Operating Income → Net Income
- **Expense Breakdown**: R&D, SG&A, and other operating expenses
- **Revenue Segments**: Business unit breakdown (if available)
- **Change Analysis**: Automatic Y/Y or Q/Q percentage calculations
- **Professional Formatting**: Abbreviated names, smart line breaks, color coding
- **Enhanced Typography**: AlibabaPuHuiTi-3 font with optimized sizing hierarchy
- **Color-Coded Values**: Different colors for segmentation, revenue, expenses, and income nodes
- **Optimized Layout**: Professional margins (150px left, 200px right, 80px top/bottom)
- **High-Quality Export**: PNG export with embedded SankeyMATIC logo

### Supported Stock Symbols
The API supports thousands of companies. Popular examples:
- **Technology**: AAPL, MSFT, GOOGL, AMZN, NVDA, TSLA, META
- **Finance**: JPM, BAC, WFC, GS, MS, C
- **Healthcare**: JNJ, PFE, UNH, ABBV, MRK
- **Consumer**: KO, PEP, WMT, HD, MCD, NKE
- **Energy**: XOM, CVX, COP, EOG, SLB

### API Limitations
- **Free Tier**: 250 API calls per month
- **Rate Limits**: 300 calls per minute
- **Data Delay**: Real-time for premium, 15-minute delay for free
- **Historical Data**: 5+ years available for most companies

### Troubleshooting API Issues

**"Invalid API Key" Error:**
- Verify your API key is correct (32 characters)
- Check that your account is active
- Ensure you haven't exceeded monthly limits

**"No Data Found" Error:**
- Verify the stock symbol is correct
- Check if the company reports financial data
- Try a different time period

**"Rate Limit Exceeded" Error:**
- Wait a few minutes before trying again
- Consider upgrading to a paid plan for higher limits

## 📅 Period Matching Feature

The application includes intelligent period matching to ensure data consistency:

**Problem Solved:**
- Prevents mixing data from different periods (e.g., Q2 income statement with Q1 segmentation data)
- Ensures accurate financial analysis and comparisons

**How it Works:**
1. **Exact Period Matching**: Only uses segmentation data that matches the exact fiscal year and period of the income statement
2. **Smart Historical Comparison**: For change calculations, finds the correct comparison period:
   - **Quarter-over-Quarter (Q/Q)**: Q2 → Q1, Q1 → Q4 (previous fiscal year)
   - **Year-over-Year (Y/Y)**: Q2 2025 → Q2 2024, FY2025 → FY2024
3. **Graceful Handling**: If no matching segmentation data is found, displays income statement only (no mixed periods)

**User Benefits:**
- ✅ Data integrity guaranteed
- ✅ Accurate period comparisons
- ✅ Clear console logging for transparency
- ✅ No misleading mixed-period analysis

## 🚀 Getting Started

### Local Development
1. Clone this repository
2. Start a local server in the project root:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser

### Font Requirements
The application uses AlibabaPuHuiTi-3 font family for enhanced typography. The font files are included in the `AlibabaPuHuiTi-3/` directory and automatically loaded via CSS.

### Online Version
Deploy to any static hosting service (GitHub Pages, Netlify, Vercel, etc.)

## 📄 License

Based on the original SankeyMATIC project. Please refer to the original project for licensing information.

## 🤝 Contributing

This is an enhanced version with financial analysis features. For the original project, visit the [official SankeyMATIC repository](https://github.com/nowthis/sankeymatic).
