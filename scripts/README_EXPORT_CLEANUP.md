# Database Export and Cleanup Script

## Overview

This script provides a comprehensive solution for:

1. **Exporting all products** with complete data to Excel
2. **Downloading all S3 assets** (images, models, paid assets, review media)
3. **Creating a zip archive** with everything
4. **Safely deleting** all database collections except products

## What Gets Exported

### Product Data

- Complete product information in Excel format with multiple sheets:
  - **Products Sheet**: All product fields including pricing, variants, delivery options, metadata
  - **Reviews Sheet**: All product reviews with ratings, comments, media, and verification status
  - **Sales Sheet**: Complete sales history with user info, quantities, and pricing

### Assets

- Product images
- 3D models (viewableModel)
- Paid assets (downloadable files)
- Review media (images/videos)

### Metadata Files

- `asset-mapping.json`: Maps products to their S3 assets
- `export-metadata.json`: Export timestamp, counts, and source info

## Prerequisites

Ensure your `.env.local` file has these variables:

```env
MONGODB_URI=your_mongodb_connection_string
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET_NAME=your_bucket_name
```

## Installation

The required dependencies are already installed:

- `archiver` - For creating zip files
- `exceljs` - For generating Excel spreadsheets
- `@aws-sdk/client-s3` - For downloading S3 assets
- `mongoose` - For database operations

## Usage

### Run the script:

```bash
node scripts/export-and-cleanup.js
```

### The script will:

1. **Phase 1: Export**

   - Connect to MongoDB
   - Fetch all products
   - Generate comprehensive Excel file with all data
   - Download all S3 assets referenced by products
   - Create a zip file containing everything
   - Progress indicators show download status

2. **Phase 2: Cleanup (Optional)**
   - Lists all collections in database
   - Shows what will be deleted and what will be kept
   - Requires explicit confirmation: type `DELETE EVERYTHING`
   - Only proceeds if you confirm

### Output Structure

```
exports/
└── database-export-YYYY-MM-DD/
    ├── products-complete-YYYY-MM-DD.xlsx
    ├── asset-mapping.json
    ├── export-metadata.json
    └── assets/
        ├── product-image-1_jpg
        ├── product-model-1_glb
        └── ... (all downloaded assets)
└── database-export-YYYY-MM-DD.zip
```

## Safety Features

### Multiple Confirmations

1. After export completes, asks if you want to proceed with cleanup
2. Before deletion, requires typing `DELETE EVERYTHING` exactly

### Protected Data

- **Products collection is NEVER deleted**
- All other collections can be removed (Users, Orders, etc.)

### What Gets Deleted

When you confirm cleanup, these collections are removed:

- `users`
- `orders`
- `checkoutsessions`
- `digitalproducttransactions`
- `printorders`
- `customprintrequests`
- `events`
- `blogposts`
- `appsettings`

**Note**: The `products` collection is preserved with all data intact.

## Excel Export Details

### Products Sheet Columns

- Basic Info: ID, Name, Creator, Slug, Description
- Pricing: Base Price (Amount & Currency), Credits, Stock
- Categories: Category ID, Subcategory ID (new + legacy)
- Media: Images, 3D Model, Paid Assets
- Variants: Complete variant type and option definitions
- Delivery: All delivery type configurations
- Dimensions: Length, Width, Height, Weight
- Stats: Downloads, Prints, Sales Count, Revenue, Ratings, Likes
- Status: Hidden, Flagged for Moderation
- Discounts: Percentage, Dates, Minimum Amount
- Timestamps: Created At, Updated At
- Technical: Schema Version

### Reviews Sheet Columns

- Product reference (ID and Name)
- Review ID
- User info (ID, Username, Profile Image)
- Rating (1-5 stars)
- Comment text
- Verified purchase status
- Purchased variants (which specific variant was bought)
- Media URLs
- Helpful count
- Timestamp

### Sales Sheet Columns

- Product reference (ID and Name)
- Sale ID
- User ID
- Quantity sold
- Price per unit
- Total amount
- Sale timestamp

## Example Usage

```bash
# Run the script
node scripts/export-and-cleanup.js

# Output:
# ✅ Connected to MongoDB
# ✅ Found 150 products
# 📊 Creating Excel export...
# ✅ Excel file created
# 📋 Found 450 unique S3 assets
# 📦 Downloading 450 assets from S3...
# ⏳ Progress: 450/450 (445 successful, 5 failed)
# 📦 Creating zip archive...
# ✅ Zip created: exports/database-export-2024-11-24.zip (1.2 GB)

# Do you want to proceed with database cleanup? (yes/no): yes

# Collections to DELETE:
#    ❌ users
#    ❌ orders
#    ...

# Collections to KEEP:
#    ✅ products

# Type "DELETE EVERYTHING" to confirm deletion: DELETE EVERYTHING

# ✅ Deletion complete! 9 collections deleted.
# ✅ Products collection preserved with all data intact.
```

## Troubleshooting

### S3 Download Failures

- Some assets may fail to download if they no longer exist in S3
- Failed downloads are counted but don't stop the process
- Check the progress indicator for success/fail counts

### Missing Environment Variables

- Script will exit immediately if required env vars are missing
- Verify your `.env.local` file is properly configured

### MongoDB Connection Issues

- Ensure your MongoDB URI is correct and accessible
- Check network connectivity and firewall settings

### Memory Issues with Large Exports

- For very large databases (10,000+ products with many assets), the script may need more memory
- Run with increased memory: `node --max-old-space-size=4096 scripts/export-and-cleanup.js`

## Recovery

If you need to restore data after cleanup:

1. Extract the zip file created during export
2. Use the Excel file to view all product data
3. Assets are in the `assets/` directory with their original S3 keys (with slashes replaced by underscores)
4. Use `asset-mapping.json` to map products to their assets

## Important Notes

⚠️ **Before running cleanup:**

- Ensure the export completed successfully
- Verify the zip file is created and accessible
- Download the zip to a safe location
- Consider backing up your database separately

✅ **After cleanup:**

- Products remain in database with all data intact
- You can continue using the application with products
- User-related data is removed (no users, orders, etc.)
- You'll need to re-seed other collections if needed

## Support

If you encounter issues:

1. Check the console output for specific error messages
2. Verify all environment variables are set correctly
3. Ensure you have sufficient disk space for the export
4. Check AWS credentials have permission to read from S3
