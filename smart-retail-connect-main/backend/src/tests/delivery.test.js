import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "node:assert";
import { Delivery } from "../models/delivery.model.js";
import { User } from "../models/user.model.js";
import { Order } from "../models/order.model.js";
import {
  acceptOrder,
  updateDeliveryStatus,
  verifyOtpAndDeliver,
  updateDriverLocation,
  resendOtp,
  assignOrder,
  getOrdersByPartner,
} from "../controllers/delivery.controllers.js";

dotenv.config();

// Helper mock res object
const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.data = body;
      return this;
    },
  };
  return res;
};

async function runDeliveryWorkflowTests() {
  console.log("\n========================================================");
  console.log("   DELIVERY PARTNER COMPLETE WORKFLOW TEST SUITE        ");
  console.log("========================================================\n");

  const dbUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = "doctors_database";
  console.log(`Connecting to database at ${dbUri}/${dbName}...`);

  await mongoose.connect(`${dbUri}/${dbName}`);
  console.log("✓ Connected to MongoDB for test execution\n");

  const TEST_DRIVER_PHONE = 9999888877;
  const TEST_CUSTOMER_PHONE = 9999111122;
  const TEST_SHOP_PHONE = 9999333344;
  const UNAUTHORIZED_DRIVER_PHONE = 8888000011;

  try {
    // Cleanup prior test artifacts
    await Delivery.deleteMany({
      $or: [
        { deliveryPartner_phone: TEST_DRIVER_PHONE },
        { customer_phone: TEST_CUSTOMER_PHONE },
        { deliveryPartner_phone: UNAUTHORIZED_DRIVER_PHONE },
      ],
    });
    await User.deleteMany({
      phone: { $in: [TEST_DRIVER_PHONE, TEST_CUSTOMER_PHONE, TEST_SHOP_PHONE, UNAUTHORIZED_DRIVER_PHONE] },
    });

    // Seed test users
    await User.create([
      {
        role: "Delivery Partner",
        fullName: "Test Delivery Partner",
        email: "driver_test@smartretail.com",
        phone: TEST_DRIVER_PHONE,
        address: "Shivaji Nagar",
        city: "Pune",
        vehicleType: "EV Bike",
        licenseNo: "MH12-2026-9876",
      },
      {
        role: "Delivery Partner",
        fullName: "Unauthorized Driver",
        email: "unauth_driver@smartretail.com",
        phone: UNAUTHORIZED_DRIVER_PHONE,
        address: "Kothrud",
        city: "Pune",
        vehicleType: "Scooter",
        licenseNo: "MH12-2026-0000",
      },
      {
        role: "Customer",
        fullName: "Test Customer",
        email: "cust_test@smartretail.com",
        phone: TEST_CUSTOMER_PHONE,
        address: "FC Road, Pune",
        city: "Pune",
      },
      {
        role: "Shopkeeper",
        fullName: "Super Grocery Mart",
        shopName: "Super Grocery Mart",
        email: "shop_test@smartretail.com",
        phone: TEST_SHOP_PHONE,
        address: "Market Yard, Pune",
        city: "Pune",
      },
    ]);
    console.log("✓ Seeded test driver, unauthorized driver, customer, and shopkeeper");

    // =========================================================================
    // TEST 1: Driver Assignment & Initial State
    // =========================================================================
    console.log("\n[Test 1] Testing Driver Assignment & Initial State...");
    const assignReq = {
      body: {
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        customer_phone: TEST_CUSTOMER_PHONE,
        customer_name: "Test Customer",
        customer_address: "FC Road, Pune",
        shopName: "Super Grocery Mart",
        shopkeeper_name: "Super Grocery Mart",
        shopkeeper_phone: TEST_SHOP_PHONE,
        shopAddress: "Market Yard, Pune",
        city: "Pune",
        items: [{ name: "Organic Milk", quantity: "2 packets" }],
        totalPrice: 150,
      },
    };
    const assignRes = createMockRes();
    await assignOrder(assignReq, assignRes);

    assert.strictEqual(assignRes.statusCode, 201, "Assign order should return 201");
    const delivery1 = assignRes.data.data;
    assert.strictEqual(delivery1.status, "ASSIGNED", "Initial status must be ASSIGNED");
    assert.strictEqual(delivery1.deliveryPartner_phone, TEST_DRIVER_PHONE);
    assert.ok(delivery1.otp && delivery1.otp.length === 6, "Must generate a 6-digit OTP");
    assert.ok(delivery1.otp_expire, "Must set OTP expiry date");
    assert.strictEqual(delivery1.timeline.length, 1, "Must create initial timeline entry");
    console.log(`✓ Driver Assignment passed. Order ID: ${delivery1._id}, OTP: ${delivery1.otp}, Status: ${delivery1.status}`);

    // =========================================================================
    // TEST 2: Order Acceptance (ASSIGNED -> ACCEPTED)
    // =========================================================================
    console.log("\n[Test 2] Testing Order Acceptance (ASSIGNED -> ACCEPTED)...");
    const acceptReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
      },
    };
    const acceptRes = createMockRes();
    await acceptOrder(acceptReq, acceptRes);

    assert.strictEqual(acceptRes.statusCode, 200, "Accept order should return 200");
    assert.strictEqual(acceptRes.data.data.status, "ACCEPTED", "Status must transition to ACCEPTED");
    console.log("✓ Order Acceptance passed. Status is now ACCEPTED");

    // =========================================================================
    // TEST 3: Unauthorized Driver Access Rejection
    // =========================================================================
    console.log("\n[Test 3] Testing Unauthorized Driver Access Rejection...");
    const unauthReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: UNAUTHORIZED_DRIVER_PHONE,
        nextStatus: "PREPARING",
      },
    };
    const unauthRes = createMockRes();
    await updateDeliveryStatus(unauthReq, unauthRes);

    assert.strictEqual(unauthRes.statusCode, 403, "Unauthorized driver must receive 403 Forbidden");
    console.log("✓ Unauthorized driver access successfully blocked with 403 Forbidden");

    // =========================================================================
    // TEST 4: Pickup Progression (ACCEPTED -> PREPARING -> PICKED_UP)
    // =========================================================================
    console.log("\n[Test 4] Testing Pickup Progression (ACCEPTED -> PREPARING -> PICKED_UP)...");
    // Transition to PREPARING
    const prepReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        nextStatus: "PREPARING",
      },
    };
    const prepRes = createMockRes();
    await updateDeliveryStatus(prepReq, prepRes);
    assert.strictEqual(prepRes.statusCode, 200);
    assert.strictEqual(prepRes.data.data.status, "PREPARING");

    // Transition to PICKED_UP
    const pickupReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        nextStatus: "PICKED_UP",
      },
    };
    const pickupRes = createMockRes();
    await updateDeliveryStatus(pickupReq, pickupRes);
    assert.strictEqual(pickupRes.statusCode, 200);
    assert.strictEqual(pickupRes.data.data.status, "PICKED_UP");
    console.log("✓ Pickup confirmation passed. Status is now PICKED_UP");

    // =========================================================================
    // TEST 5: GPS Location Updates
    // =========================================================================
    console.log("\n[Test 5] Testing GPS Location Updates...");
    const gpsReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        lat: 18.5285,
        lng: 73.8540,
      },
    };
    const gpsRes = createMockRes();
    await updateDriverLocation(gpsReq, gpsRes);

    assert.strictEqual(gpsRes.statusCode, 200);
    const updatedLoc = gpsRes.data.data.driver_location;
    assert.strictEqual(updatedLoc.lat, 18.5285);
    assert.strictEqual(updatedLoc.lng, 73.8540);
    console.log(`✓ GPS location updated: lat=${updatedLoc.lat}, lng=${updatedLoc.lng}`);

    // =========================================================================
    // TEST 6: Map Display Coordinates Integrity
    // =========================================================================
    console.log("\n[Test 6] Testing Map Display Coordinates Integrity...");
    const checkDelivery = await Delivery.findById(delivery1._id);
    assert.ok(checkDelivery.shop_location.lat && checkDelivery.shop_location.lng, "Shop must have valid coords");
    assert.ok(checkDelivery.customer_location.lat && checkDelivery.customer_location.lng, "Customer must have valid coords");
    assert.ok(checkDelivery.driver_location.lat && checkDelivery.driver_location.lng, "Driver must have valid coords");
    console.log("✓ Map coordinates verified for Shop, Driver, and Customer");

    // =========================================================================
    // TEST 7: Transition to ON_THE_WAY
    // =========================================================================
    console.log("\n[Test 7] Transitioning to ON_THE_WAY...");
    const onWayReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        nextStatus: "ON_THE_WAY",
      },
    };
    const onWayRes = createMockRes();
    await updateDeliveryStatus(onWayReq, onWayRes);
    assert.strictEqual(onWayRes.statusCode, 200);
    assert.strictEqual(onWayRes.data.data.status, "ON_THE_WAY");
    console.log("✓ Status transitioned to ON_THE_WAY");

    // =========================================================================
    // TEST 8: Incorrect OTP Rejection
    // =========================================================================
    console.log("\n[Test 8] Testing Incorrect OTP Rejection...");
    const wrongOtpReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        otp: "000000", // Incorrect OTP
      },
    };
    const wrongOtpRes = createMockRes();
    await verifyOtpAndDeliver(wrongOtpReq, wrongOtpRes);

    assert.strictEqual(wrongOtpRes.statusCode, 400, "Wrong OTP must be rejected with 400 Bad Request");
    console.log("✓ Incorrect OTP rejection passed (400 Bad Request)");

    // =========================================================================
    // TEST 9: Expired OTP Rejection
    // =========================================================================
    console.log("\n[Test 9] Testing Expired OTP Rejection...");
    // Simulate expired OTP in database
    await Delivery.findByIdAndUpdate(delivery1._id, {
      otp_expire: new Date(Date.now() - 1000 * 60), // Expired 1 min ago
    });

    const expiredOtpReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        otp: delivery1.otp,
      },
    };
    const expiredOtpRes = createMockRes();
    await verifyOtpAndDeliver(expiredOtpReq, expiredOtpRes);

    assert.strictEqual(expiredOtpRes.statusCode, 400, "Expired OTP must be rejected with 400 Bad Request");
    console.log("✓ Expired OTP rejection passed (400 Bad Request)");

    // Restore OTP expiration for remaining tests
    await Delivery.findByIdAndUpdate(delivery1._id, {
      otp_expire: new Date(Date.now() + 30 * 60 * 1000),
    });

    // =========================================================================
    // TEST 10: Correct OTP Verification & Delivery Completion
    // =========================================================================
    console.log("\n[Test 10] Testing Correct OTP Verification & Delivery Completion...");
    const correctOtpReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        otp: delivery1.otp,
      },
    };
    const correctOtpRes = createMockRes();
    await verifyOtpAndDeliver(correctOtpReq, correctOtpRes);

    assert.strictEqual(correctOtpRes.statusCode, 200, "Valid OTP must complete delivery with 200");
    const deliveredDoc = correctOtpRes.data.data;
    assert.strictEqual(deliveredDoc.status, "DELIVERED", "Order status must be DELIVERED");
    assert.strictEqual(deliveredDoc.otp_verified, true, "otp_verified must be true");
    assert.ok(deliveredDoc.deliveredAt, "Must record deliveredAt timestamp");
    console.log("✓ Delivery completion passed with verified OTP. Status is DELIVERED");

    // =========================================================================
    // TEST 11: Reuse of an OTP Rejection
    // =========================================================================
    console.log("\n[Test 11] Testing Reuse of an OTP Rejection...");
    const reuseOtpReq = {
      body: {
        deliveryId: delivery1._id,
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        otp: delivery1.otp,
      },
    };
    const reuseOtpRes = createMockRes();
    await verifyOtpAndDeliver(reuseOtpReq, reuseOtpRes);

    assert.strictEqual(reuseOtpRes.statusCode, 400, "Reusing an OTP must be rejected with 400 Bad Request");
    console.log("✓ Reuse of an OTP rejection passed (400 Bad Request)");

    // =========================================================================
    // TEST 12: Multiple Active Orders & Earnings Summary
    // =========================================================================
    console.log("\n[Test 12] Testing Multiple Active Orders & Earnings Summary...");
    // Assign Order 2 (In Transit)
    const assign2Res = createMockRes();
    await assignOrder({
      body: {
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        customer_phone: TEST_CUSTOMER_PHONE,
        customer_name: "Customer 2",
        customer_address: "Aundh, Pune",
        shopName: "Super Grocery Mart",
        shopkeeper_name: "Shopkeeper",
        shopkeeper_phone: TEST_SHOP_PHONE,
        shopAddress: "Market Yard",
        city: "Pune",
        items: [{ name: "Basmati Rice", quantity: "5 kg" }],
        totalPrice: 450,
      },
    }, assign2Res);
    const delivery2 = assign2Res.data.data;

    // Transition Order 2 to ACCEPTED -> PICKED_UP -> ON_THE_WAY
    await acceptOrder({ body: { deliveryId: delivery2._id, deliveryPartner_phone: TEST_DRIVER_PHONE } }, createMockRes());
    await updateDeliveryStatus({ body: { deliveryId: delivery2._id, deliveryPartner_phone: TEST_DRIVER_PHONE, nextStatus: "PICKED_UP" } }, createMockRes());
    await updateDeliveryStatus({ body: { deliveryId: delivery2._id, deliveryPartner_phone: TEST_DRIVER_PHONE, nextStatus: "ON_THE_WAY" } }, createMockRes());

    // Assign Order 3 (New Pending)
    await assignOrder({
      body: {
        deliveryPartner_phone: TEST_DRIVER_PHONE,
        customer_phone: TEST_CUSTOMER_PHONE,
        customer_name: "Customer 3",
        customer_address: "Baner, Pune",
        shopName: "Super Grocery Mart",
        shopkeeper_name: "Shopkeeper",
        shopkeeper_phone: TEST_SHOP_PHONE,
        shopAddress: "Market Yard",
        city: "Pune",
        items: [{ name: "Wheat Flour", quantity: "10 kg" }],
        totalPrice: 400,
      },
    }, createMockRes());

    // Fetch orders & summary for driver
    const getSummaryReq = {
      params: { phone: TEST_DRIVER_PHONE },
      query: { status: "ALL" },
    };
    const getSummaryRes = createMockRes();
    await getOrdersByPartner(getSummaryReq, getSummaryRes);

    assert.strictEqual(getSummaryRes.statusCode, 200);
    const summary = getSummaryRes.data.data.summary;
    const ordersList = getSummaryRes.data.data.orders;

    assert.strictEqual(ordersList.length, 3, "Driver must have 3 total orders in system");
    assert.strictEqual(summary.totalAssigned, 3, "Total assigned should be 3");
    assert.strictEqual(summary.pendingOrders, 1, "Pending orders should be 1 (Order 3)");
    assert.strictEqual(summary.activeDeliveries, 1, "Active deliveries should be 1 (Order 2 ON_THE_WAY)");
    assert.strictEqual(summary.completedDeliveries, 1, "Completed deliveries should be 1 (Order 1 DELIVERED)");
    assert.strictEqual(summary.totalEarnings, 40, "Total earnings should be ₹40 (from 1 delivered order)");

    console.log(`✓ Multiple active orders verified:
      Total Assigned: ${summary.totalAssigned}
      Pending: ${summary.pendingOrders}
      Active In-Transit: ${summary.activeDeliveries}
      Completed: ${summary.completedDeliveries}
      Total Earnings: ₹${summary.totalEarnings}`);

    console.log("\n========================================================");
    console.log("   ALL 12 DELIVERY WORKFLOW TESTS PASSED SUCCESSFULLY!  ");
    console.log("========================================================\n");

  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    throw err;
  } finally {
    // Cleanup test data
    await Delivery.deleteMany({
      $or: [
        { deliveryPartner_phone: TEST_DRIVER_PHONE },
        { customer_phone: TEST_CUSTOMER_PHONE },
        { deliveryPartner_phone: UNAUTHORIZED_DRIVER_PHONE },
      ],
    });
    await User.deleteMany({
      phone: { $in: [TEST_DRIVER_PHONE, TEST_CUSTOMER_PHONE, TEST_SHOP_PHONE, UNAUTHORIZED_DRIVER_PHONE] },
    });
    await mongoose.disconnect();
    console.log("✓ Disconnected test database session");
  }
}

runDeliveryWorkflowTests()
  .then(() => process.exit(0))
  .catch((e) => process.exit(1));
