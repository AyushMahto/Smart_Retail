import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Delivery } from "../models/delivery.model.js";

export const createOrder = async (req, res) => {
  try {
    const { address, items, notes, orderCity } = req.body;
    const {phone} = req.params;

    // Create a new order
    const newOrder = new Order({
      address,
      items,
      notes,
      orderBy: phone,
      orderCity,
    });

    // Save the order to the database
    await newOrder.save();

    res.status(201).json({
      status: "success",
      data: {
        order: newOrder,
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create order",
    });
  }
};

export const getCurrentCustomerOrders = async (req, res) => {
  try {
    const { phone } = req.params;
    //const orders = await Order.find({phone}).sort({ createdAt: -1 });
    const orders = await Order.aggregate([
      { $match: { orderBy: Number(phone) } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json({
      status: "success",
      data: {
        orders,
      }
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create order",
    });
  }
} 

export const getCurrentShopkepperOrders = async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await User.findOne({phone});
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Shopkeeper user not found",
      });
    }
    const cityRegex = new RegExp(`^${user.city}$`, "i");
    const orders = await Order.aggregate([
      { $match: { orderCity: { $regex: cityRegex } } },
      { $sort: { createdAt: -1 } } 
    ]);
    res.status(200).json({
      status: "success",
      data: {
        orders,
      }
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create order",
    });
  }
}

export const updateOrder = async (req, res) => {
  try {
    const { shopkeeperPrices, totalPrice, shopkeeper, shopName } = req.body;
    const {orderBy} = req.params;
    //console.log("Updating order for:", orderBy);
    const order = await Order.findOne({orderBy});
    //console.log(order);

    const updatedOrder = await Order.findByIdAndUpdate( 
      order._id,
      {
        $push: {
          shopkeepers: { shopkeeper, prices: shopkeeperPrices, totalPrice, shopName }
        }
      },
      { new: true }
    );

    res.status(201).json({
      status: "success",
      data: {
        order: updatedOrder,
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create order",
    });
  }
};

export const confirmOrder = async (req, res) => {
  try {
    const { shopkeeper, orderBy } = req.body;

    const customer = await User.findOne({ phone: orderBy });
    const user_shopkepeeper = await User.findOne({ phone: shopkeeper });
    const order = await Order.findOne({ orderBy });

    if (!customer || !user_shopkepeeper || !order) {
      return res.status(404).json({
        status: "error",
        message: "Customer, shopkeeper, or order not found",
      });
    }

    const city = customer.city;
    
    // Find delivery partner in city, fallback to any available delivery partner
    let deliveryPartner = await User.aggregate([
        { $match: { role: "Delivery Partner", city: { $regex: new RegExp(`^${city}$`, "i") } } },
        { $sample: { size: 1 } }
    ]);

    if (!deliveryPartner || deliveryPartner.length === 0) {
      deliveryPartner = await User.aggregate([
        { $match: { role: "Delivery Partner" } },
        { $sample: { size: 1 } }
      ]);
    }

    if (!deliveryPartner || deliveryPartner.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No delivery partner available",
      });
    }

    const assignedDriver = deliveryPartner[0];
    const shopQuote = order.shopkeepers.find(sk => sk.shopkeeper == shopkeeper);
    const totalPrice = shopQuote ? shopQuote.totalPrice : 0;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expire = new Date(Date.now() + 30 * 60 * 1000);

    // Create persistent Delivery lifecycle document
    const delivery = await Delivery.create({
      orderId: order._id,
      customer_name: customer.fullName,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_location: { lat: 18.5204, lng: 73.8567 },
      shopName: user_shopkepeeper.shopName || `${user_shopkepeeper.fullName}'s Shop`,
      shopkeeper_name: user_shopkepeeper.fullName,
      shopkeeper_phone: user_shopkepeeper.phone,
      shopAddress: user_shopkepeeper.address,
      shop_location: { lat: 18.5304, lng: 73.8467 },
      deliveryPartner_phone: assignedDriver.phone,
      deliveryPartner_name: assignedDriver.fullName,
      driver_location: { lat: 18.5254, lng: 73.8517, updatedAt: new Date() },
      city: customer.city,
      items: order.items,
      totalPrice,
      deliveryFee: 40,
      status: "ASSIGNED",
      timeline: [
        {
          status: "ASSIGNED",
          timestamp: new Date(),
          note: `Order assigned to ${assignedDriver.fullName}`,
        }
      ],
      otp,
      otp_expire,
      otp_verified: false,
    });

    // Update Order with delivery details and OTP
    order.finalizedShopleeper = shopkeeper;
    order.deliveryId = delivery._id;
    order.deliveryPartner = assignedDriver.phone;
    order.deliveryStatus = "ASSIGNED";
    order.otp = otp;
    order.otp_expire = otp_expire;
    await order.save();

    // Preserve User.confirmedOrder for backward compatibility
    const resp = await User.findByIdAndUpdate(
      assignedDriver._id,
      {
        $set: {
          confirmedOrder: {
            customer_name: customer.fullName,
            customer_phone: customer.phone,
            customer_address: customer.address,
            shopName: user_shopkepeeper.shopName || `${user_shopkepeeper.fullName}'s Shop`,
            shopkeeper_name: user_shopkepeeper.fullName,
            shopkeeper_phone: user_shopkepeeper.phone,
            shopAddress: user_shopkepeeper.address,
            city: customer.city,
            totalPrice,
            delivery_status: "pending",
          }
        }
      },
      { new: true }
    );

    res.status(201).json({
      status: "success",
      resp,
      data: {
        delivery,
        otp,
      }
    });
  } catch (error) {
    console.error("Error confirming order:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to confirm order",
    });
  }
};
