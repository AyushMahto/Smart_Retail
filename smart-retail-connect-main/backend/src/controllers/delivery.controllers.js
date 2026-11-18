import { Delivery } from "../models/delivery.model.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// Helper to generate 6-digit OTP
export const generateSixDigitOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Legacy getOrder: Preserved for backward compatibility.
 * Returns the latest active delivery order for a delivery partner.
 */
export const getOrder = async (req, res) => {
  try {
    const { phone } = req.params;
    const partnerPhone = Number(phone);

    // Look for active delivery first
    const activeDelivery = await Delivery.findOne({
      deliveryPartner_phone: partnerPhone,
      status: { $ne: "DELIVERED" },
    }).sort({ createdAt: -1 });

    if (activeDelivery) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            _id: activeDelivery._id,
            deliveryId: activeDelivery._id,
            orderId: activeDelivery.orderId,
            customer_name: activeDelivery.customer_name,
            customer_phone: activeDelivery.customer_phone,
            customer_address: activeDelivery.customer_address,
            shopName: activeDelivery.shopName,
            shopkeeper_name: activeDelivery.shopkeeper_name,
            shopkeeper_phone: activeDelivery.shopkeeper_phone,
            shopAddress: activeDelivery.shopAddress,
            city: activeDelivery.city,
            totalPrice: activeDelivery.totalPrice,
            delivery_status: activeDelivery.status.toLowerCase(),
            status: activeDelivery.status,
            timeline: activeDelivery.timeline,
            driver_location: activeDelivery.driver_location,
            customer_location: activeDelivery.customer_location,
            shop_location: activeDelivery.shop_location,
            items: activeDelivery.items,
          },
          "Delivery Order fetched successfully"
        )
      );
    }

    // Fallback to User confirmedOrder
    const order = await User.findOne({ phone: partnerPhone });
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          order?.confirmedOrder || null,
          "Delivery Order fetched successfully"
        )
      );
  } catch (error) {
    console.error("Error fetching delivery order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch delivery order",
    });
  }
};

/**
 * Get all orders assigned to a delivery partner with summary stats & filters.
 */
export const getOrdersByPartner = async (req, res) => {
  try {
    const { phone } = req.params;
    const { status, search } = req.query;
    const partnerPhone = Number(phone);

    // Build query
    const query = { deliveryPartner_phone: partnerPhone };

    if (status && status !== "ALL") {
      query.status = status.toUpperCase();
    }

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { customer_name: regex },
        { customer_address: regex },
        { shopName: regex },
        { shopAddress: regex },
      ];
      // Check if search term is numeric (phone or price)
      if (!isNaN(search.trim())) {
        query.$or.push({ customer_phone: Number(search.trim()) });
      }
    }

    const orders = await Delivery.find(query).sort({ createdAt: -1 });

    // Aggregate statistics across all orders for this partner
    const allPartnerOrders = await Delivery.find({ deliveryPartner_phone: partnerPhone });

    const totalAssigned = allPartnerOrders.length;
    const pendingOrders = allPartnerOrders.filter(
      (o) => o.status === "ASSIGNED"
    ).length;
    const activeDeliveries = allPartnerOrders.filter((o) =>
      ["ACCEPTED", "PREPARING", "PICKED_UP", "ON_THE_WAY"].includes(o.status)
    ).length;
    const completedDeliveries = allPartnerOrders.filter(
      (o) => o.status === "DELIVERED"
    ).length;

    // Earnings calculation: sum of deliveryFee for delivered orders
    const deliveredOrders = allPartnerOrders.filter((o) => o.status === "DELIVERED");
    const totalEarnings = deliveredOrders.reduce(
      (sum, o) => sum + (o.deliveryFee || 40),
      0
    );

    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEarnings = deliveredOrders
      .filter((o) => new Date(o.deliveredAt || o.updatedAt) >= today)
      .reduce((sum, o) => sum + (o.deliveryFee || 40), 0);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          orders,
          summary: {
            totalAssigned,
            pendingOrders,
            activeDeliveries,
            completedDeliveries,
            totalEarnings,
            todayEarnings,
          },
        },
        "Delivery orders and summary fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching delivery partner orders:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch orders",
    });
  }
};

/**
 * Accept Order: Transition from ASSIGNED -> ACCEPTED
 */
export const acceptOrder = async (req, res) => {
  try {
    const { deliveryId, deliveryPartner_phone } = req.body;
    const partnerPhone = Number(deliveryPartner_phone);

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    // Check driver authorization
    if (delivery.deliveryPartner_phone !== partnerPhone) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized driver access: This order is not assigned to you",
      });
    }

    // Enforce valid status transition: only ASSIGNED can be accepted
    if (delivery.status !== "ASSIGNED") {
      return res.status(400).json({
        status: "error",
        message: `Cannot accept order. Current status is ${delivery.status}, expected ASSIGNED`,
      });
    }

    delivery.status = "ACCEPTED";
    delivery.timeline.push({
      status: "ACCEPTED",
      timestamp: new Date(),
      note: "Order accepted by delivery partner",
    });

    await delivery.save();

    // Update User.confirmedOrder for backward compatibility
    await User.updateOne(
      { phone: partnerPhone, "confirmedOrder.customer_phone": delivery.customer_phone },
      { $set: { "confirmedOrder.delivery_status": "accepted" } }
    );

    return res.status(200).json(
      new ApiResponse(200, delivery, "Order accepted successfully")
    );
  } catch (error) {
    console.error("Error accepting order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to accept order",
    });
  }
};

/**
 * Update Delivery Status:
 * Enforces valid transitions:
 * ACCEPTED -> PREPARING
 * PREPARING -> PICKED_UP
 * PICKED_UP -> ON_THE_WAY
 * Note: ON_THE_WAY -> DELIVERED is strictly prohibited here; it requires verifyOtpAndDeliver.
 */
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { deliveryId, deliveryPartner_phone, nextStatus, note } = req.body;
    const partnerPhone = Number(deliveryPartner_phone);

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    // Check driver authorization
    if (delivery.deliveryPartner_phone !== partnerPhone) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized driver access: This order is not assigned to you",
      });
    }

    // Prevent direct setting of DELIVERED without OTP verification
    if (nextStatus === "DELIVERED") {
      return res.status(400).json({
        status: "error",
        message: "Delivery completion requires successful OTP verification",
      });
    }

    // Enforce valid status transitions
    const validTransitions = {
      ASSIGNED: ["ACCEPTED"],
      ACCEPTED: ["PREPARING", "PICKED_UP"],
      PREPARING: ["PICKED_UP"],
      PICKED_UP: ["ON_THE_WAY"],
    };

    const allowed = validTransitions[delivery.status] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid status transition from ${delivery.status} to ${nextStatus}. Allowed transitions: ${allowed.join(", ") || "None"}`,
      });
    }

    delivery.status = nextStatus;
    delivery.timeline.push({
      status: nextStatus,
      timestamp: new Date(),
      note: note || `Status updated to ${nextStatus}`,
    });

    await delivery.save();

    // Update Order deliveryStatus if orderId exists
    if (delivery.orderId) {
      await Order.findByIdAndUpdate(delivery.orderId, {
        deliveryStatus: nextStatus,
      });
    }

    return res.status(200).json(
      new ApiResponse(200, delivery, `Order status updated to ${nextStatus}`)
    );
  } catch (error) {
    console.error("Error updating delivery status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update delivery status",
    });
  }
};

/**
 * Verify OTP and Complete Delivery:
 * Transition: ON_THE_WAY -> DELIVERED
 * Validates:
 * 1. Driver authorization (403 if unauthorized)
 * 2. Current status must be ON_THE_WAY (400 if invalid)
 * 3. Expired OTP rejection (400 if expired)
 * 4. Reuse of an OTP rejection (400 if already verified)
 * 5. Incorrect OTP rejection (400 if mismatched)
 * On success: Sets status DELIVERED, records deliveredAt, marks otp_verified true, appends timeline.
 */
export const verifyOtpAndDeliver = async (req, res) => {
  try {
    const { deliveryId, deliveryPartner_phone, otp } = req.body;
    const partnerPhone = Number(deliveryPartner_phone);

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    // 1. Unauthorized driver access check
    if (delivery.deliveryPartner_phone !== partnerPhone) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized driver access: You are not authorized to deliver this order",
      });
    }

    // 2. Status check: Must be ON_THE_WAY
    if (delivery.status !== "ON_THE_WAY") {
      return res.status(400).json({
        status: "error",
        message: `Cannot deliver order. Current status is ${delivery.status}, but must be ON_THE_WAY`,
      });
    }

    // 3. Reuse of an OTP rejection check
    if (delivery.otp_verified) {
      return res.status(400).json({
        status: "error",
        message: "OTP has already been used. Reusing an OTP is rejected",
      });
    }

    // 4. Expired OTP rejection check
    if (delivery.otp_expire && new Date() > new Date(delivery.otp_expire)) {
      return res.status(400).json({
        status: "error",
        message: "OTP has expired. Please ask customer to request a new OTP",
      });
    }

    // 5. Correct OTP verification check
    if (!otp || String(delivery.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        status: "error",
        message: "Incorrect OTP. Verification failed. Please enter the valid OTP from customer",
      });
    }

    // Successful OTP verification -> Mark as DELIVERED
    delivery.status = "DELIVERED";
    delivery.otp_verified = true;
    delivery.deliveredAt = new Date();
    delivery.timeline.push({
      status: "DELIVERED",
      timestamp: new Date(),
      note: "Delivery successfully completed with verified customer OTP",
    });

    await delivery.save();

    // Clear confirmedOrder on user to complete legacy cycle
    await User.updateOne(
      { phone: partnerPhone },
      { $unset: { confirmedOrder: "" } }
    );

    // Update order status if orderId exists
    if (delivery.orderId) {
      await Order.findByIdAndUpdate(delivery.orderId, {
        deliveryStatus: "DELIVERED",
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        delivery,
        "OTP verified successfully. Order marked as DELIVERED"
      )
    );
  } catch (error) {
    console.error("Error verifying OTP and completing delivery:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to verify OTP and complete delivery",
    });
  }
};

/**
 * Update Driver GPS Location
 */
export const updateDriverLocation = async (req, res) => {
  try {
    const { deliveryId, deliveryPartner_phone, lat, lng } = req.body;
    const partnerPhone = Number(deliveryPartner_phone);

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    // Authorization check
    if (delivery.deliveryPartner_phone !== partnerPhone) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized driver access",
      });
    }

    delivery.driver_location = {
      lat: Number(lat),
      lng: Number(lng),
      updatedAt: new Date(),
    };

    await delivery.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        { driver_location: delivery.driver_location },
        "Driver location updated successfully"
      )
    );
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update location",
    });
  }
};

/**
 * Resend / Regenerate OTP
 */
export const resendOtp = async (req, res) => {
  try {
    const { deliveryId } = req.body;

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    if (delivery.status === "DELIVERED") {
      return res.status(400).json({
        status: "error",
        message: "Order has already been delivered",
      });
    }

    const newOtp = generateSixDigitOtp();
    delivery.otp = newOtp;
    delivery.otp_expire = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    delivery.otp_verified = false;

    await delivery.save();

    // If linked to Order, update order OTP as well
    if (delivery.orderId) {
      await Order.findByIdAndUpdate(delivery.orderId, {
        otp: newOtp,
        otp_expire: delivery.otp_expire,
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          otp: newOtp,
          otp_expire: delivery.otp_expire,
        },
        "New OTP generated successfully"
      )
    );
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to resend OTP",
    });
  }
};

/**
 * Assign an order directly to a delivery partner (useful for testing & manual dispatch)
 */
export const assignOrder = async (req, res) => {
  try {
    const {
      orderId,
      deliveryPartner_phone,
      customer_phone,
      customer_name,
      customer_address,
      shopName,
      shopkeeper_name,
      shopkeeper_phone,
      shopAddress,
      city,
      items,
      totalPrice,
    } = req.body;

    const partnerPhone = Number(deliveryPartner_phone);
    const driver = await User.findOne({ phone: partnerPhone });
    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Delivery partner not found",
      });
    }

    const otp = generateSixDigitOtp();
    const otp_expire = new Date(Date.now() + 30 * 60 * 1000);

    const delivery = await Delivery.create({
      orderId: orderId || null,
      customer_name: customer_name || "Valued Customer",
      customer_phone: Number(customer_phone),
      customer_address: customer_address || "Customer Address",
      customer_location: { lat: 18.5204, lng: 73.8567 },
      shopName: shopName || "Smart Retail Store",
      shopkeeper_name: shopkeeper_name || "Shopkeeper",
      shopkeeper_phone: Number(shopkeeper_phone),
      shopAddress: shopAddress || "Market Yard, Pune",
      shop_location: { lat: 18.5304, lng: 73.8467 },
      deliveryPartner_phone: partnerPhone,
      deliveryPartner_name: driver.fullName,
      driver_location: { lat: 18.5254, lng: 73.8517, updatedAt: new Date() },
      city: city || driver.city || "Pune",
      items: items || [{ name: "Grocery Items", quantity: "1 pkg" }],
      totalPrice: Number(totalPrice) || 250,
      deliveryFee: 40,
      status: "ASSIGNED",
      timeline: [
        {
          status: "ASSIGNED",
          timestamp: new Date(),
          note: `Order assigned to ${driver.fullName}`,
        }
      ],
      otp,
      otp_expire,
      otp_verified: false,
    });

    // Update driver confirmedOrder for backward compatibility
    await User.findByIdAndUpdate(driver._id, {
      $set: {
        confirmedOrder: {
          customer_name: delivery.customer_name,
          customer_phone: delivery.customer_phone,
          customer_address: delivery.customer_address,
          shopName: delivery.shopName,
          shopkeeper_name: delivery.shopkeeper_name,
          shopkeeper_phone: delivery.shopkeeper_phone,
          shopAddress: delivery.shopAddress,
          city: delivery.city,
          totalPrice: delivery.totalPrice,
          delivery_status: "pending",
        },
      },
    });

    return res.status(201).json(
      new ApiResponse(200, delivery, "Order assigned to delivery partner successfully")
    );
  } catch (error) {
    console.error("Error assigning order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to assign order",
    });
  }
};

/**
 * Get single delivery order details (including timeline, GPS coordinates, and items)
 */
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const delivery = await Delivery.findById(orderId);
    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "Delivery order not found",
      });
    }

    return res.status(200).json(
      new ApiResponse(200, delivery, "Order details fetched successfully")
    );
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch order details",
    });
  }
};

/**
 * Track order: Customer or driver tracking endpoint
 */
export const trackOrder = async (req, res) => {
  try {
    const { identifier } = req.params; // Can be deliveryId or customer phone

    let delivery = null;
    if (identifier.length === 24) {
      delivery = await Delivery.findById(identifier);
    }

    if (!delivery && !isNaN(identifier)) {
      delivery = await Delivery.findOne({ customer_phone: Number(identifier) }).sort({ createdAt: -1 });
    }

    if (!delivery) {
      return res.status(404).json({
        status: "error",
        message: "No active order found to track",
      });
    }

    return res.status(200).json(
      new ApiResponse(200, delivery, "Tracking data fetched successfully")
    );
  } catch (error) {
    console.error("Error tracking order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to track order",
    });
  }
};

/**
 * Legacy deliveryDone: Preserved for existing API compatibility.
 */
export const deliveryDone = async (req, res) => {
  try {
    const { customer_phone, shopkeeper_phone, deliveryPartner_phone } = req.body;

    const deliveryboy = await User.findOne({ phone: deliveryPartner_phone });
    const order = await Order.findOne({ orderBy: customer_phone });

    let delivery = await Delivery.findOne({
      customer_phone,
      deliveryPartner_phone,
      status: { $ne: "DELIVERED" },
    });

    if (delivery) {
      delivery.status = "DELIVERED";
      delivery.otp_verified = true;
      delivery.deliveredAt = new Date();
      delivery.timeline.push({
        status: "DELIVERED",
        timestamp: new Date(),
        note: "Delivery completed via legacy deliveryDone endpoint",
      });
      await delivery.save();
    } else {
      delivery = await Delivery.create({
        customer_phone,
        shopkeeper_phone,
        deliveryPartner_phone,
        items: order ? order.items : [{ name: "Order items", quantity: "1" }],
        status: "DELIVERED",
        otp_verified: true,
        deliveredAt: new Date(),
        timeline: [
          {
            status: "DELIVERED",
            timestamp: new Date(),
            note: "Delivery completed",
          },
        ],
      });
    }

    if (deliveryboy) {
      await User.updateOne(
        { _id: deliveryboy._id },
        { $unset: { confirmedOrder: "" } }
      );
    }

    if (order) {
      order.deliveryStatus = "DELIVERED";
      await order.save();
    }

    return res
      .status(200)
      .json(new ApiResponse(200, delivery, "Order delivered successfully"));
  } catch (error) {
    console.error("Error in deliveryDone:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to complete delivery",
    });
  }
};
