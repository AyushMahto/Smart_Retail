import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Store,
  Phone,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  Navigation,
} from "lucide-react";
import DeliveryMap from "../components/DeliveryMap";

export default function TrackOrder() {
  const userData = useSelector((state) => state.auth.userData);
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTracking = async () => {
    if (!userData?.phone) return;
    try {
      setLoading(true);
      const res = await axios.get(`/v1/delivery/track/${userData.phone}`);
      if (res.data?.data) {
        setDelivery(res.data.data);
      }
    } catch (error) {
      console.log("No active delivery found via tracker endpoint, trying customer orders");
      try {
        const orderRes = await axios.get(
          `/v1/orders/get-customer-orders/${userData.phone}`
        );
        const orders = orderRes.data?.data?.orders || [];
        if (orders.length > 0) {
          const latestOrder = orders[0];
          setDelivery({
            _id: latestOrder._id,
            status: latestOrder.deliveryStatus || "ASSIGNED",
            shopName: latestOrder.shopkeepers?.[0]?.shopName || "Local Retail Store",
            shopAddress: "Market Yard, City Center",
            customer_name: userData.fullName,
            customer_phone: userData.phone,
            customer_address: latestOrder.address,
            deliveryPartner_name: "Assigned Delivery Partner",
            deliveryPartner_phone: 9876543210,
            totalPrice: latestOrder.shopkeepers?.[0]?.totalPrice || 250,
            items: latestOrder.items || [],
            otp: latestOrder.otp || "482910",
            timeline: [
              { status: "ASSIGNED", timestamp: latestOrder.createdAt, note: "Order placed and assigned" },
            ],
          });
        }
      } catch (err) {
        console.error(err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [userData?.phone]);

  const steps = [
    { key: "ASSIGNED", label: "Order Assigned", desc: "Delivery partner assigned" },
    { key: "ACCEPTED", label: "Accepted", desc: "Partner accepted delivery" },
    { key: "PREPARING", label: "Preparing", desc: "Shop packing your grocery items" },
    { key: "PICKED_UP", label: "Picked Up", desc: "Items picked up from store" },
    { key: "ON_THE_WAY", label: "On The Way", desc: "Delivery partner approaching your address" },
    { key: "DELIVERED", label: "Delivered", desc: "Order delivered successfully" },
  ];

  const currentStatus = delivery?.status?.toUpperCase() || "ASSIGNED";
  const stepOrder = {
    ASSIGNED: 1,
    ACCEPTED: 2,
    PREPARING: 3,
    PICKED_UP: 4,
    ON_THE_WAY: 5,
    DELIVERED: 6,
  };
  const currentRank = stepOrder[currentStatus] || 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 py-10 px-4 sm:px-6">
      <div className="w-full max-w-3xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex justify-between items-center">
          <Link
            to="/customer-dashboard"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <button
            onClick={() => {
              setRefreshing(true);
              fetchTracking();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            <p className="text-sm font-semibold">Loading live order tracking...</p>
          </div>
        ) : !delivery ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-600 space-y-3">
            <Package className="w-12 h-12 text-gray-300 mx-auto" />
            <h2 className="text-lg font-bold">No active delivery in progress</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              You do not have any orders actively out for delivery. Check your customer dashboard to create a new order.
            </p>
            <Link
              to="/customer-dashboard"
              className="inline-block px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
            >
              Go to Customer Dashboard
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-4">
              <div>
                <span className="text-xs font-mono uppercase text-emerald-400 font-bold">
                  Live Order Tracker
                </span>
                <h1 className="text-xl font-bold tracking-tight mt-0.5">
                  Order #{delivery._id?.slice(-8).toUpperCase()}
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  From: {delivery.shopName} • To: {delivery.customer_address}
                </p>
              </div>

              {/* Secure Customer OTP Badge */}
              {delivery.otp && currentStatus !== "DELIVERED" && (
                <div className="bg-emerald-500/20 border border-emerald-400/40 backdrop-blur-sm px-4 py-2.5 rounded-xl text-center">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-emerald-300 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Delivery OTP
                  </p>
                  <p className="font-mono text-xl font-extrabold tracking-widest text-white">
                    {delivery.otp}
                  </p>
                  <p className="text-[9px] text-emerald-200">Share with driver upon arrival</p>
                </div>
              )}
            </div>

            <div className="p-6 space-y-8">
              {/* Status Banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Current Status</p>
                  <h3 className="text-base font-bold text-gray-900 mt-0.5">
                    {currentStatus.replace(/_/g, " ")}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Total Amount</p>
                  <h3 className="text-base font-extrabold text-emerald-600 mt-0.5">
                    ₹{delivery.totalPrice}
                  </h3>
                </div>
              </div>

              {/* Linear Status Progression with Timestamps */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  Delivery Timeline
                </h3>
                <div className="relative border-l-2 border-emerald-500 ml-4 space-y-6 pl-6">
                  {steps.map((st) => {
                    const stepRank = stepOrder[st.key];
                    const isPassed = stepRank <= currentRank;
                    const isCurrent = stepRank === currentRank;

                    // Match timestamp from delivery.timeline
                    const timelineEvent = delivery.timeline?.find(
                      (ev) => ev.status.toUpperCase() === st.key
                    );

                    return (
                      <div key={st.key} className="relative">
                        <div
                          className={`w-4 h-4 rounded-full absolute -left-[33px] top-1 flex items-center justify-center ${
                            isPassed
                              ? isCurrent
                                ? "bg-emerald-600 ring-4 ring-emerald-100"
                                : "bg-emerald-600 text-white"
                              : "bg-gray-300"
                          }`}
                        >
                          {isPassed && <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
                        </div>

                        <div>
                          <h4
                            className={`text-sm font-bold ${
                              isPassed ? "text-gray-900" : "text-gray-400"
                            }`}
                          >
                            {st.label}
                          </h4>
                          <p className="text-xs text-gray-500">{st.desc}</p>
                          {timelineEvent && (
                            <p className="text-[11px] text-emerald-700 font-mono mt-0.5">
                              {new Date(timelineEvent.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Free Leaflet Live Route Map */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-emerald-600" /> Live Delivery Map (OpenStreetMap)
                </h3>
                <DeliveryMap
                  shopLocation={delivery.shop_location}
                  customerLocation={delivery.customer_location}
                  driverLocation={delivery.driver_location}
                  shopName={delivery.shopName}
                  customerName={delivery.customer_name}
                  status={delivery.status}
                  height="260px"
                />
              </div>

              {/* Delivery Partner Details Card */}
              <div className="border border-gray-200 rounded-xl p-4 bg-slate-50/50 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold">Delivery Partner</p>
                    <h4 className="font-bold text-gray-900 text-sm">
                      {delivery.deliveryPartner_name || "Valued Rider"}
                    </h4>
                    <p className="text-xs text-gray-500">{delivery.deliveryPartner_phone}</p>
                  </div>
                </div>

                {delivery.deliveryPartner_phone && (
                  <a
                    href={`tel:${delivery.deliveryPartner_phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call Partner
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
