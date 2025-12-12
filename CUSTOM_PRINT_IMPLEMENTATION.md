# Custom 3D Print Request Implementation Guide

## Overview

This guide outlines the complete transformation from product-based printing to custom upload-based print requests.

## ✅ Completed Components

### 1. Database Models

#### CustomPrintRequest Model (`models/CustomPrintRequest.js`)

- Handles user-uploaded 3D models
- Tracks print configuration and payment status
- Auto-sets 7-day deadline after payment
- Statuses: pending_upload → pending_config → configured → paid → printing → shipped → delivered
- Auto-cancellation support for unconfigured orders

#### PrintOrder Model (Updated)

- Marked as DEPRECATED with backwards compatibility
- Added `customPrintRequestId` and `isCustomUpload` fields
- Legacy support for existing product-based orders

### 2. Frontend Components

#### Print Page (`app/prints/PrintPage.jsx`)

- **New Feature**: "Request Custom Print" card at top of grid
- Eye-catching dashed border design with upload icon
- Clicking adds custom print item to cart
- Redirects to cart for model upload

#### Custom Print Upload Component (`components/Cart/CustomPrintUpload.jsx`)

- Drag-and-drop file upload interface
- Supports: STL, OBJ, GLB, GLTF, 3MF, PLY files
- 50MB file size limit
- Progress indicator during upload
- Success state with "Configure Print Settings" button
- Validates file type and size client-side

#### Editor Updates (`app/editor/page.jsx`)

- Now supports `requestId` query parameter
- Loads custom print requests from API
- Fetches user-uploaded 3D models from S3
- Sets `isCustomPrint` flag in store for context

### 3. API Endpoints

#### Custom Print API (`app/api/custom-print/route.js`)

- **POST**: Upload 3D model files
  - Validates file type and size
  - Uploads to S3 with organized path structure
  - Creates CustomPrintRequest record
  - Returns requestId and modelUrl
- **GET**: Retrieve custom print requests
  - Single request by `requestId`
  - All requests for authenticated user

## 🚧 Remaining Implementation Steps

### 4. Cart Integration

**File**: `app/cart/Cart.jsx`

```jsx
import CustomPrintUpload from "@/components/Cart/CustomPrintUpload";

// In the cart items render section:
{
  cartItem.isCustomPrint && (
    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-start gap-3 mb-3">
        <HiExclamationCircle className="text-yellow-600 text-xl shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-yellow-900">
            Upload Required
          </h4>
          <p className="text-xs text-yellow-700 mt-1">
            Please upload your 3D model to proceed with checkout
          </p>
        </div>
      </div>
      <CustomPrintUpload
        onUploadComplete={(data) => {
          // Update cart item with requestId
          updateCartItemRequestId(cartItem._id, data.requestId);
        }}
      />
    </div>
  );
}
```

### 5. Checkout Warnings

**File**: `app/checkout/CheckOut.jsx`

Add warning banner at top of checkout:

```jsx
{
  hasCustomPrintWithoutUpload && (
    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <HiExclamationCircle className="text-red-600 text-2xl shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-red-900 mb-1">
            Model Upload Required
          </h3>
          <p className="text-xs text-red-700">
            Please return to your cart and upload your 3D model before
            proceeding with payment.
          </p>
          <Link
            href="/cart"
            className="inline-block mt-2 px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
          >
            Go to Cart
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### 6. Order Display Updates

**File**: `components/Account/OrderSection.jsx`

Add pending configuration warnings:

```jsx
{
  order.orderType === "customPrintRequest" &&
    order.status === "pending_config" && (
      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start gap-2">
          <HiClock className="text-yellow-600 text-lg shrink-0 mt-0.5" />
          <div className="flex-1">
            <h5 className="text-xs font-semibold text-yellow-900 mb-1">
              Configuration Pending
            </h5>
            <p className="text-xs text-yellow-700 mb-2">
              Please configure your print settings within {daysRemaining} days
              or your order will be automatically cancelled.
            </p>
            <Link
              href={`/editor?requestId=${order.customPrintRequestId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white rounded text-xs font-medium hover:bg-yellow-700"
            >
              Configure Now →
            </Link>
          </div>
        </div>
      </div>
    );
}
```

**File**: `app/account/orders/[orderId]/OrderPage.jsx`

Add prominent configuration warning:

```jsx
{
  orderData.orderType === "customPrintRequest" &&
    orderData.status === "pending_config" && (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-6">
        <div className="flex items-start gap-4">
          <HiExclamationTriangle className="text-yellow-600 text-3xl shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-yellow-900 mb-2">
              ⚠️ Action Required: Configure Your Print
            </h3>
            <p className="text-sm text-yellow-800 mb-3">
              Your order is on hold until you configure your print settings. You
              have <strong>{daysRemaining} days remaining</strong> (
              {deadline.toLocaleDateString()}) to complete this step, or your
              order will be automatically cancelled and refunded.
            </p>
            <Link
              href={`/editor?requestId=${orderData.customPrintRequestId}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
            >
              <HiCog className="text-xl" />
              Configure Print Settings Now
            </Link>
          </div>
        </div>
      </div>
    );
}
```

### 7. Payment Success Page

**File**: `app/checkout/return/Return.jsx`

Add configuration reminder:

```jsx
{
  orderData.orderType === "customPrintRequest" && (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
      <div className="flex items-start gap-3">
        <HiInformationCircle className="text-blue-600 text-2xl shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-blue-900 mb-2">
            Next Step: Configure Your Print
          </h4>
          <p className="text-xs text-blue-700 mb-3">
            Your payment was successful! Please configure your print settings
            within 7 days to proceed with manufacturing. If not configured, your
            order will be automatically cancelled and refunded.
          </p>
          <Link
            href={`/editor?requestId=${orderData.customPrintRequestId}`}
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Configure Now
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### 8. Automated Cancellation & Reminders

**File**: `app/api/cron/check-print-deadlines/route.js` (NEW)

```javascript
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import CustomPrintRequest from "@/models/CustomPrintRequest";

export async function GET(req) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = new Date();

    // Find orders past deadline that are still pending config
    const expiredOrders = await CustomPrintRequest.find({
      status: { $in: ["paid", "pending_config"] },
      configDeadline: { $lt: now },
      autoCancelledAt: null,
    });

    const cancelledOrders = [];
    for (const order of expiredOrders) {
      order.status = "cancelled";
      order.autoCancelledAt = now;
      order.statusHistory.push({
        status: "cancelled",
        updatedAt: now,
        note: "Automatically cancelled - configuration not submitted within 7 days",
      });
      await order.save();
      cancelledOrders.push(order.requestId);

      // TODO: Trigger Stripe refund
      // TODO: Send cancellation email to user
      // TODO: Notify admin for manual refund processing
    }

    // Send reminders for orders approaching deadline (1 day before)
    const reminderThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const ordersNeedingReminder = await CustomPrintRequest.find({
      status: { $in: ["paid", "pending_config"] },
      configDeadline: { $lt: reminderThreshold, $gt: now },
      reminderSent: false,
    });

    const reminders = [];
    for (const order of ordersNeedingReminder) {
      order.reminderSent = true;
      await order.save();
      reminders.push(order.requestId);

      // TODO: Send reminder email to user
    }

    return NextResponse.json({
      success: true,
      cancelledOrders,
      remindersSent: reminders,
    });
  } catch (error) {
    console.error("Error checking print deadlines:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Setup**: Configure Vercel Cron Job in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-print-deadlines",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### 9. Admin Notifications

**File**: `components/Admin/CreatorPayments.jsx` (or new Admin panel)

Add filter for cancelled orders needing refunds:

```jsx
<button
  onClick={() => setFilterStatus("pending_refund")}
  className={`px-3 py-1.5 rounded text-xs ${
    filterStatus === "pending_refund"
      ? "bg-red-100 text-red-700"
      : "bg-baseColor"
  }`}
>
  Pending Refunds
</button>;

{
  filteredOrders
    .filter((o) => o.autoCancelledAt && !o.refundProcessed)
    .map((order) => (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-red-900">
              {order.requestId} - Auto-Cancelled
            </h4>
            <p className="text-xs text-red-700">
              Cancelled on{" "}
              {new Date(order.autoCancelledAt).toLocaleDateString()}
            </p>
            <p className="text-xs text-red-600 mt-1">
              Amount to refund: ${order.totalAmount}
            </p>
          </div>
          <button
            onClick={() => handleRefundProcessed(order.requestId)}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Mark Refunded
          </button>
        </div>
      </div>
    ));
}
```

## UI/UX Best Practices Implemented

1. **Clear Visual Hierarchy**: Custom print card stands out with dashed borders and "New" badge
2. **Progressive Disclosure**: Upload interface only shown when custom print item in cart
3. **Status Indicators**: Color-coded warnings (yellow for pending, red for urgent)
4. **Countdown Timers**: Shows days remaining for configuration
5. **Contextual Actions**: "Configure Now" buttons placed where users need them
6. **Error Prevention**: File type/size validation before upload
7. **Feedback**: Progress indicators during upload, success states after completion
8. **Urgency Communication**: Multiple touchpoints remind users of deadline
9. **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation support

## Data Flow

1. User clicks "Request Custom Print" on prints page
2. Custom print item added to cart (productId: 'custom-print-request')
3. Cart shows upload interface for custom print items
4. User uploads 3D model → Creates CustomPrintRequest record
5. User clicks "Configure Print Settings" → Opens editor with requestId
6. User configures print settings → Updates CustomPrintRequest.printConfiguration
7. User proceeds to checkout → Payment processed
8. Payment success → configDeadline set (7 days from payment)
9. Daily cron checks deadlines → Sends reminders at 1 day before
10. If not configured by deadline → Auto-cancel + notify admin for refund

## Testing Checklist

- [ ] Upload various 3D file formats
- [ ] Test file size limits (over 50MB should fail)
- [ ] Verify S3 upload and retrieval
- [ ] Test editor loading with requestId
- [ ] Configure print settings and save
- [ ] Complete checkout flow
- [ ] Verify deadline calculation
- [ ] Test reminder email (1 day before)
- [ ] Test auto-cancellation (past deadline)
- [ ] Verify admin refund notifications
- [ ] Test order history display
- [ ] Mobile responsiveness of all new components

## Environment Variables Required

```env
# S3 Configuration (lib/s3.js)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET_NAME=

# Cron Job Security
CRON_SECRET=

# Email Service (for reminders)
SENDGRID_API_KEY=
```

## Next Steps for Developer

1. Install dependencies: `npm install react-dropzone uuid`
2. Complete cart integration (Section 4)
3. Add checkout warnings (Section 5)
4. Update order display components (Section 6)
5. Implement cron job (Section 8)
6. Set up admin refund panel (Section 9)
7. Configure email templates for reminders
8. Test end-to-end flow
9. Deploy and configure Vercel cron job

## Notes

- Existing product-based print orders will continue to work (backwards compatibility)
- Custom print requests are now the primary print workflow
- Consider adding price calculator based on model volume/complexity
- May want to add preview thumbnail generation for uploaded models
- Consider adding model validation (manifold check, printability analysis)
