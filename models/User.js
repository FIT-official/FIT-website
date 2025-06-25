import { m } from "framer-motion";
import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        variantId: { type: String, default: null },
        chosenDeliveryType: { type: String, required: true },
        price: { type: Number, required: true, default: 0, min: 0 },
    },
    { timestamps: true }
);

const OrderSchema = new mongoose.Schema(
    {
        cartItem: { type: CartItemSchema, default: {} },
        status: {
            type: String,
            enum: ["pending", "shipped", "delivered", "cancelled"],
            default: "pending",
        },
    },
    { timestamps: true }
);

const ContactSchema = new mongoose.Schema({
    phone: {
        countryCode: { type: String, required: true },
        number: { type: String, required: true },
    },
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        postalCode: { type: String, required: true },
        country: { type: String, required: true },
        unitNumber: { type: String, required: true },
    },
});

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    orderHistory: { type: [OrderSchema], default: [] },
    cart: { type: [CartItemSchema], default: [] },
    contact: { type: ContactSchema, required: false, default: undefined },
    usedPromoCodes: { type: [String], default: [] },
    metadata: {
        role: { type: String, default: "Customer", required: true },
    },
    creatorBannerUrl: { type: String, default: undefined },
    creatorProducts: { type: [String], default: [] },
    schemaVersion: { type: Number, default: 1 },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
