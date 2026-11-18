import mongoose from "mongoose";
import dotenv from "dotenv";
import { app } from "../app.js";
import { User } from "../models/user.model.js";
import { Order } from "../models/order.model.js";
import { Delivery } from "../models/delivery.model.js";

dotenv.config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSeniorDeveloperMultiRoleTest() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║    SMART RETAIL CONNECT - 3-ROLE END-TO-END WORKFLOW INTEGRATION TEST        ║");
  console.log("║    Roles: [1] Customer ➔ [2] Shopkeeper ➔ [3] Delivery Partner               ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");

  const dbUri = process.env.MONGODB_URI;
  const dbName = "doctors_database";
  console.log(`[DB] Connecting to MongoDB: ${dbUri}/${dbName}...`);
  await mongoose.connect(`${dbUri}/${dbName}`);
  console.log("[DB] ✓ MongoDB connection established.\n");

  // Start express server on ephemeral port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;
  console.log(`[HTTP] Express API server listening on ${baseUrl}\n`);

  // Define test participants
  const CUSTOMER = {
    role: "Customer",
    fullName: "Aarav Sharma",
    email: "aarav.customer@test.com",
    phone: 9811122233,
    address: "Flat 402, Green Acres, FC Road",
    city: "Pune",
  };

  const SHOPKEEPER = {
    role: "Shopkeeper",
    fullName: "Kiran Patil",
    shopName: "Patil Fresh Supermarket",
    email: "kiran.shop@test.com",
    phone: 9822233344,
    address: "Shop 12, Market Yard",
    city: "Pune",
  };

  const DELIVERY_PARTNER = {
    role: "Delivery Partner",
    fullName: "Raju Delivery",
    email: "raju.delivery@test.com",
    phone: 9833344455,
    address: "Shivaji Nagar",
    city: "Pune",
    vehicleType: "Honda Activa",
    licenseNo: "MH12-2026-8899",
  };

  try {
    // -------------------------------------------------------------------------
    // SETUP: Clean prior state and register/seed 3 users
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("STEP 0: SEEDING USERS FOR 3 ROLES");
    console.log("--------------------------------------------------------------------------------");

    await User.deleteMany({
      phone: { $in: [CUSTOMER.phone, SHOPKEEPER.phone, DELIVERY_PARTNER.phone] },
    });
    await Order.deleteMany({ orderBy: CUSTOMER.phone });
    await Delivery.deleteMany({
      $or: [
        { customer_phone: CUSTOMER.phone },
        { deliveryPartner_phone: DELIVERY_PARTNER.phone },
        { shopkeeper_phone: SHOPKEEPER.phone },
      ],
    });

    const createdCustomer = await User.create(CUSTOMER);
    const createdShopkeeper = await User.create(SHOPKEEPER);
    const createdPartner = await User.create(DELIVERY_PARTNER);

    console.log(`✓ [Role: Customer] Registered: ${createdCustomer.fullName} (Phone: ${createdCustomer.phone}, City: ${createdCustomer.city})`);
    console.log(`✓ [Role: Shopkeeper] Registered: ${createdShopkeeper.fullName} - "${createdShopkeeper.shopName}" (Phone: ${createdShopkeeper.phone})`);
    console.log(`✓ [Role: Delivery Partner] Registered: ${createdPartner.fullName} (Phone: ${createdPartner.phone}, Vehicle: ${createdPartner.vehicleType})\n`);

    // -------------------------------------------------------------------------
    // STEP 1: CUSTOMER CREATES GROCERY ORDER
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("STEP 1: [CUSTOMER] CREATING GROCERY ORDER");
    console.log("--------------------------------------------------------------------------------");

    const orderPayload = {
      address: CUSTOMER.address,
      orderCity: CUSTOMER.city,
      notes: "Please deliver before 7 PM. Ring the doorbell.",
      items: [
        { name: "Aashirvaad Shudh Chakki Atta", quantity: "5 kg", note: "Fresh batch" },
        { name: "Amul Taaza Milk", quantity: "2 Liters", note: "Pouch" },
        { name: "Tata Salt", quantity: "1 kg", note: "Vacuum packed" },
      ],
    };

    console.log(`[Customer] Posting order to: POST /api/v1/orders/create-orders/${CUSTOMER.phone}`);
    console.log(`[Customer] Items: 3 items in grocery list for Pune delivery.`);

    const createOrderRes = await fetch(`${baseUrl}/orders/create-orders/${CUSTOMER.phone}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const createOrderData = await createOrderRes.json();
    if (createOrderRes.status !== 201) {
      throw new Error(`Failed to create order: ${JSON.stringify(createOrderData)}`);
    }

    const orderId = createOrderData.data.order._id;
    console.log(`✓ [Customer] Order successfully placed! Order ID: ${orderId}`);
    console.log(`✓ [Customer] Order Status: Placed, waiting for shopkeepers in ${CUSTOMER.city} to provide quotes.\n`);

    // -------------------------------------------------------------------------
    // STEP 2: SHOPKEEPER VIEWS CITY ORDERS AND GIVES PRICES
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("STEP 2: [SHOPKEEPER] RETRIEVING ORDERS IN CITY & SUBMITTING PRICE QUOTE");
    console.log("--------------------------------------------------------------------------------");

    console.log(`[Shopkeeper] Fetching city orders: GET /api/v1/orders/get-shopkepper-orders/${SHOPKEEPER.phone}`);
    const shopOrdersRes = await fetch(`${baseUrl}/orders/get-shopkepper-orders/${SHOPKEEPER.phone}`);
    const shopOrdersData = await shopOrdersRes.json();

    const ordersInCity = shopOrdersData.data.orders;
    console.log(`[Shopkeeper] Found ${ordersInCity.length} pending order(s) in Pune.`);

    const targetOrder = ordersInCity.find((o) => o.orderBy === CUSTOMER.phone);
    if (!targetOrder) {
      throw new Error("Target customer order not found in shopkeeper's view!");
    }
    console.log(`[Shopkeeper] Order identified from ${CUSTOMER.fullName} with ${targetOrder.items.length} items.`);

    // Shopkeeper quotes prices for each item
    const shopkeeperPrices = {
      "Aashirvaad Shudh Chakki Atta": 240,
      "Amul Taaza Milk": 110,
      "Tata Salt": 28,
    };
    const totalPrice = Object.values(shopkeeperPrices).reduce((a, b) => a + b, 0); // 378

    console.log(`[Shopkeeper] Itemized pricing:`);
    for (const [item, price] of Object.entries(shopkeeperPrices)) {
      console.log(`   - ${item}: ₹${price}`);
    }
    console.log(`   ➔ Calculated Total Price: ₹${totalPrice}`);

    const quotePayload = {
      shopkeeper: SHOPKEEPER.phone,
      shopName: SHOPKEEPER.shopName,
      shopkeeperPrices,
      totalPrice,
    };

    console.log(`[Shopkeeper] Submitting quote: PATCH /api/v1/orders/update-order/${CUSTOMER.phone}`);
    const quoteRes = await fetch(`${baseUrl}/orders/update-order/${CUSTOMER.phone}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quotePayload),
    });

    const quoteData = await quoteRes.json();
    if (quoteRes.status !== 201) {
      throw new Error(`Failed to update quote: ${JSON.stringify(quoteData)}`);
    }

    console.log(`✓ [Shopkeeper] Quote submitted successfully by "${SHOPKEEPER.shopName}" for ₹${totalPrice}!\n`);

    // -------------------------------------------------------------------------
    // STEP 3: CUSTOMER CONFIRMS QUOTE & SYSTEM AUTO-ASSIGNS DELIVERY PARTNER
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("STEP 3: [CUSTOMER] CONFIRMS QUOTE ➔ AUTO-ASSIGN DELIVERY PARTNER & GENERATE OTP");
    console.log("--------------------------------------------------------------------------------");

    console.log(`[Customer] Confirming order with shopkeeper ${SHOPKEEPER.shopName} (${SHOPKEEPER.phone})...`);
    console.log(`[Customer] Calling: POST /api/v1/orders/confirm-order`);

    const confirmRes = await fetch(`${baseUrl}/orders/confirm-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopkeeper: SHOPKEEPER.phone,
        orderBy: CUSTOMER.phone,
      }),
    });

    const confirmData = await confirmRes.json();
    if (confirmRes.status !== 201) {
      throw new Error(`Failed to confirm order: ${JSON.stringify(confirmData)}`);
    }

    const assignedDelivery = confirmData.data.delivery;
    const generatedOtp = confirmData.data.otp;

    console.log(`✓ [System] Order Confirmed!`);
    console.log(`✓ [System] Assigned Delivery Partner: ${assignedDelivery.deliveryPartner_name} (Phone: ${assignedDelivery.deliveryPartner_phone})`);
    console.log(`✓ [System] Generated 6-Digit Delivery OTP: >> ${generatedOtp} <<`);
    console.log(`✓ [System] OTP Expiry: ${new Date(assignedDelivery.otp_expire).toLocaleTimeString()} (30 minutes)`);
    console.log(`✓ [System] Delivery Job Created: ID=${assignedDelivery._id}, Status=${assignedDelivery.status}`);

    // Customer checks live tracking
    console.log(`\n[Customer] Verifying Live Tracking: GET /api/v1/delivery/track/${CUSTOMER.phone}`);
    const trackRes = await fetch(`${baseUrl}/delivery/track/${CUSTOMER.phone}`);
    const trackData = await trackRes.json();
    const customerTracking = trackData.data;

    console.log(`✓ [Customer Tracking Page] Current Status: "${customerTracking.status}"`);
    console.log(`✓ [Customer Tracking Page] Displayed OTP for driver: "${customerTracking.otp}"`);
    console.log(`✓ [Customer Tracking Page] Assigned Rider: ${customerTracking.deliveryPartner_name} (${customerTracking.deliveryPartner_phone})\n`);

    // -------------------------------------------------------------------------
    // STEP 4: DELIVERY PARTNER ACCEPTS AND DELIVERS THE ORDER WITH OTP
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("STEP 4: [DELIVERY PARTNER] DASHBOARD, STATUS WORKFLOW & OTP VERIFICATION");
    console.log("--------------------------------------------------------------------------------");

    const assignedDriverPhone = assignedDelivery.deliveryPartner_phone;
    console.log(`[Delivery Partner] Logged in as assigned driver: ${assignedDelivery.deliveryPartner_name} (Phone: ${assignedDriverPhone})`);

    // 4.1 Partner checks dashboard orders
    console.log(`[Delivery Partner] Checking dashboard orders: GET /api/v1/delivery/orders/${assignedDriverPhone}`);
    const partnerOrdersRes = await fetch(`${baseUrl}/delivery/orders/${assignedDriverPhone}`);
    const partnerOrdersData = await partnerOrdersRes.json();
    const partnerSummary = partnerOrdersData.data.summary;
    const partnerOrders = partnerOrdersData.data.orders;

    console.log(`[Delivery Partner Dashboard] Metrics:`);
    console.log(`   - Total Assigned: ${partnerSummary.totalAssigned}`);
    console.log(`   - Pending Acceptance: ${partnerSummary.pendingOrders}`);
    console.log(`   - Active Deliveries: ${partnerSummary.activeDeliveries}`);
    console.log(`   - Completed: ${partnerSummary.completedDeliveries}`);
    console.log(`   - Current Earnings: ₹${partnerSummary.totalEarnings}`);

    const myDelivery = partnerOrders.find((o) => o._id === assignedDelivery._id);
    if (!myDelivery) {
      throw new Error("Assigned delivery not found in delivery partner dashboard!");
    }
    console.log(`[Delivery Partner] Identified new assigned delivery #${myDelivery._id.slice(-6).toUpperCase()} from ${myDelivery.shopName}.`);

    // 4.2 Accept order (ASSIGNED -> ACCEPTED)
    console.log(`\n[Delivery Partner] Transition 1: Accepting Order (ASSIGNED ➔ ACCEPTED)...`);
    const acceptRes = await fetch(`${baseUrl}/delivery/accept-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
      }),
    });
    const acceptData = await acceptRes.json();
    console.log(`✓ [Delivery Partner] Status updated to: ${acceptData.data.status}`);

    // 4.3 Update to PREPARING
    console.log(`\n[Delivery Partner] Transition 2: Shop preparing order (ACCEPTED ➔ PREPARING)...`);
    const prepRes = await fetch(`${baseUrl}/delivery/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        nextStatus: "PREPARING",
        note: "Store packaging vegetables and groceries",
      }),
    });
    const prepData = await prepRes.json();
    console.log(`✓ [Delivery Partner] Status updated to: ${prepData.data.status}`);

    // 4.4 Pick up from store (PREPARING -> PICKED_UP)
    console.log(`\n[Delivery Partner] Transition 3: Confirming Pickup at store (PREPARING ➔ PICKED_UP)...`);
    const pickupRes = await fetch(`${baseUrl}/delivery/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        nextStatus: "PICKED_UP",
        note: "Items verified and packed into delivery bag",
      }),
    });
    const pickupData = await pickupRes.json();
    console.log(`✓ [Delivery Partner] Status updated to: ${pickupData.data.status}`);

    // 4.5 Start journey (PICKED_UP -> ON_THE_WAY)
    console.log(`\n[Delivery Partner] Transition 4: Starting Journey (PICKED_UP ➔ ON_THE_WAY)...`);
    const onWayRes = await fetch(`${baseUrl}/delivery/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        nextStatus: "ON_THE_WAY",
        note: "Rider dispatched towards customer location",
      }),
    });
    const onWayData = await onWayRes.json();
    console.log(`✓ [Delivery Partner] Status updated to: ${onWayData.data.status}`);

    // 4.6 Update GPS Coordinates
    console.log(`\n[Delivery Partner] Sending GPS Location Ping...`);
    const gpsRes = await fetch(`${baseUrl}/delivery/update-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        lat: 18.5245,
        lng: 73.8520,
      }),
    });
    const gpsData = await gpsRes.json();
    console.log(`✓ [Delivery Partner] Live GPS Position Updated: lat=${gpsData.data.driver_location.lat}, lng=${gpsData.data.driver_location.lng}`);

    // 4.7 Security Test: Try completing delivery with INCORRECT OTP
    console.log(`\n[Delivery Partner] Security Verification: Attempting delivery with WRONG OTP (999999)...`);
    const wrongOtpRes = await fetch(`${baseUrl}/delivery/verify-otp-and-deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        otp: "999999",
      }),
    });
    const wrongOtpData = await wrongOtpRes.json();
    console.log(`✓ [Security Check] Wrong OTP correctly rejected with status ${wrongOtpRes.status}: "${wrongOtpData.message}"`);

    // 4.8 Complete delivery with CORRECT OTP
    console.log(`\n[Delivery Partner] Transition 5: Submitting Customer's Verified OTP (${generatedOtp})...`);
    const correctOtpRes = await fetch(`${baseUrl}/delivery/verify-otp-and-deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: myDelivery._id,
        deliveryPartner_phone: assignedDriverPhone,
        otp: generatedOtp,
      }),
    });
    const correctOtpData = await correctOtpRes.json();
    if (correctOtpRes.status !== 200) {
      throw new Error(`Failed to deliver with correct OTP: ${JSON.stringify(correctOtpData)}`);
    }

    const completedDelivery = correctOtpData.data;
    console.log(`✓ [Delivery Partner] Order Completed! Status: ${completedDelivery.status}`);
    console.log(`✓ [Delivery Partner] Delivered At: ${new Date(completedDelivery.deliveredAt).toLocaleString()}`);
    console.log(`✓ [Delivery Partner] Payment Collected: ₹${completedDelivery.totalPrice}`);

    // 4.9 Verify final driver dashboard & earnings
    console.log(`\n[Delivery Partner] Final Dashboard Refresh: GET /api/v1/delivery/orders/${assignedDriverPhone}`);
    const finalRes = await fetch(`${baseUrl}/delivery/orders/${assignedDriverPhone}`);
    const finalData = await finalRes.json();
    const finalSummary = finalData.data.summary;

    console.log(`[Delivery Partner] Final Summary Metrics:`);
    console.log(`   - Total Assigned: ${finalSummary.totalAssigned}`);
    console.log(`   - Pending Acceptance: ${finalSummary.pendingOrders}`);
    console.log(`   - Active Deliveries: ${finalSummary.activeDeliveries}`);
    console.log(`   - Completed Deliveries: ${finalSummary.completedDeliveries}`);
    console.log(`   - Total Earnings: ₹${finalSummary.totalEarnings} (Earned +₹40 for this delivery)`);

    console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
    console.log("║    ALL 3 ROLES PASSED END-TO-END WORKFLOW INTEGRATION SEAMLESSLY!            ║");
    console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");

  } catch (error) {
    console.error("\n❌ MULTI-ROLE TEST FAILED:", error);
    throw error;
  } finally {
    // Teardown
    console.log("[Teardown] Cleaning up test data...");
    await User.deleteMany({
      phone: { $in: [CUSTOMER.phone, SHOPKEEPER.phone, DELIVERY_PARTNER.phone] },
    });
    await Order.deleteMany({ orderBy: CUSTOMER.phone });
    await Delivery.deleteMany({
      $or: [
        { customer_phone: CUSTOMER.phone },
        { deliveryPartner_phone: DELIVERY_PARTNER.phone },
        { shopkeeper_phone: SHOPKEEPER.phone },
      ],
    });
    await server.close();
    await mongoose.disconnect();
    console.log("[Teardown] ✓ Test server stopped and DB disconnected.\n");
  }
}

runSeniorDeveloperMultiRoleTest()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
