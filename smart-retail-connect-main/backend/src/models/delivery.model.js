import mongoose, {Schema} from "mongoose";

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  note: {
    type: String,
  },
  quantity: {
    type: String,
    required: true,
  },
});

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  note: {
    type: String,
    default: "",
  },
});

const deliverySchema = new Schema(
    {
        orderId: {
            type: Schema.Types.ObjectId,
            ref: "Order",
        },
        customer_name: {
            type: String,
            default: "",
        },
        customer_phone: {
            type: Number,
            required: true,
        },
        customer_address: {
            type: String,
            default: "",
        },
        customer_location: {
            lat: { type: Number, default: 18.5204 },
            lng: { type: Number, default: 73.8567 },
        },
        shopName: {
            type: String,
            default: "",
        },
        shopkeeper_name: {
            type: String,
            default: "",
        },
        shopkeeper_phone: {
            type: Number,
            required: true,
        },
        shopAddress: {
            type: String,
            default: "",
        },
        shop_location: {
            lat: { type: Number, default: 18.5304 },
            lng: { type: Number, default: 73.8467 },
        },
        deliveryPartner_phone: {
            type: Number,
            required: true,
            index: true,
        },
        deliveryPartner_name: {
            type: String,
            default: "",
        },
        driver_location: {
            lat: { type: Number, default: 18.5254 },
            lng: { type: Number, default: 73.8517 },
            updatedAt: { type: Date, default: Date.now },
        },
        city: {
            type: String,
            lowercase: true,
            default: "",
        },
        items: {
            type: [itemSchema],
            required: true,
        },
        totalPrice: {
            type: Number,
            default: 0,
        },
        deliveryFee: {
            type: Number,
            default: 40,
        },
        status: {
            type: String,
            enum: ["ASSIGNED", "ACCEPTED", "PREPARING", "PICKED_UP", "ON_THE_WAY", "DELIVERED", "CANCELLED"],
            default: "ASSIGNED",
            index: true,
        },
        timeline: {
            type: [timelineSchema],
            default: [],
        },
        otp: {
            type: String,
        },
        otp_expire: {
            type: Date,
        },
        otp_verified: {
            type: Boolean,
            default: false,
        },
        deliveredAt: {
            type: Date,
        },
    },
    {
        timestamps: true
    }
);

export const Delivery = mongoose.model("Delivery", deliverySchema);
