import React, { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../store/authSlice";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  MapPin,
  Store,
  Phone,
  ShieldCheck,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  DollarSign,
  Calendar,
  X,
  KeyRound,
  Navigation,
  Eye,
  Check,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import DeliveryMap from "../components/DeliveryMap";

const STATUS_TABS = [
  { id: "ALL", label: "All Orders" },
  { id: "ASSIGNED", label: "New Assigned" },
  { id: "ACCEPTED", label: "Accepted" },
  { id: "PREPARING", label: "Preparing" },
  { id: "PICKED_UP", label: "Picked Up" },
  { id: "ON_THE_WAY", label: "On The Way" },
  { id: "DELIVERED", label: "Delivered" },
];

export default function DeliveryPartnerDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userData = useSelector((state) => state.auth.userData);

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    totalAssigned: 0,
    pendingOrders: 0,
    activeDeliveries: 0,
    completedDeliveries: 0,
    totalEarnings: 0,
    todayEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [selectedOrderForMap, setSelectedOrderForMap] = useState(null);
  const [otpModalOrder, setOtpModalOrder] = useState(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);

  // GPS update feedback
  const [gpsUpdating, setGpsUpdating] = useState(false);
  const [gpsFeedback, setGpsFeedback] = useState("");

  const fetchOrders = useCallback(async () => {
    if (!userData?.phone) return;
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== "ALL") params.status = activeTab;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const res = await axios.get(`/v1/delivery/orders/${userData.phone}`, {
        params,
      });

      if (res.data?.data) {
        setOrders(res.data.data.orders || []);
        if (res.data.data.summary) {
          setSummary(res.data.data.summary);
        }
      }
    } catch (error) {
      console.error("Error fetching delivery orders:", error);
      // Fallback: try legacy getOrder endpoint if orders endpoint had an issue
      try {
        const legacyRes = await axios.get(
          `/v1/delivery/get-delivery-order/${userData.phone}`
        );
        if (legacyRes.data?.data) {
          const legacyOrder = legacyRes.data.data;
          setOrders([
            {
              _id: legacyOrder.deliveryId || legacyOrder._id || "legacy-1",
              status: (legacyOrder.delivery_status || "ASSIGNED").toUpperCase(),
              customer_name: legacyOrder.customer_name,
              customer_phone: legacyOrder.customer_phone,
              customer_address: legacyOrder.customer_address,
              shopName: legacyOrder.shopName,
              shopkeeper_name: legacyOrder.shopkeeper_name,
              shopkeeper_phone: legacyOrder.shopkeeper_phone,
              shopAddress: legacyOrder.shopAddress,
              city: legacyOrder.city,
              totalPrice: legacyOrder.totalPrice,
              deliveryFee: 40,
              items: legacyOrder.items || [],
              timeline: legacyOrder.timeline || [],
            },
          ]);
        }
      } catch (legacyErr) {
        console.error("Legacy fetch also failed:", legacyErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userData?.phone, activeTab, searchTerm]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  // 1. Accept Order Workflow
  const handleAcceptOrder = async (orderId) => {
    try {
      const res = await axios.post("/v1/delivery/accept-order", {
        deliveryId: orderId,
        deliveryPartner_phone: userData.phone,
      });
      if (res.data?.status === "success" || res.status === 200) {
        fetchOrders();
      }
    } catch (error) {
      alert(
        error.response?.data?.message || "Failed to accept order. Please try again."
      );
    }
  };

  // 2. Linear Status Workflow Progression
  const handleUpdateStatus = async (orderId, nextStatus, note = "") => {
    try {
      const res = await axios.post("/v1/delivery/update-status", {
        deliveryId: orderId,
        deliveryPartner_phone: userData.phone,
        nextStatus,
        note,
      });
      if (res.data?.status === "success" || res.status === 200) {
        fetchOrders();
        if (selectedOrderForMap && selectedOrderForMap._id === orderId) {
          setSelectedOrderForMap((prev) => ({
            ...prev,
            status: nextStatus,
            timeline: [
              ...(prev.timeline || []),
              { status: nextStatus, timestamp: new Date(), note },
            ],
          }));
        }
      }
    } catch (error) {
      alert(
        error.response?.data?.message || "Failed to update order status."
      );
    }
  };

  // 3. OTP Verification for DELIVERED status
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpInput || otpInput.trim().length === 0) {
      setOtpError("Please enter the 6-digit OTP provided by customer");
      return;
    }

    try {
      setOtpLoading(true);
      setOtpError("");
      const res = await axios.post("/v1/delivery/verify-otp-and-deliver", {
        deliveryId: otpModalOrder._id,
        deliveryPartner_phone: userData.phone,
        otp: otpInput.trim(),
      });

      if (res.data?.status === "success" || res.status === 200) {
        setOtpSuccess(true);
        setTimeout(() => {
          setOtpModalOrder(null);
          setOtpInput("");
          setOtpSuccess(false);
          fetchOrders();
          if (selectedOrderForMap?._id === otpModalOrder._id) {
            setSelectedOrderForMap(null);
          }
        }, 1200);
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        "Incorrect OTP. Delivery cannot be completed.";
      setOtpError(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend OTP Helper
  const handleResendOtp = async (orderId) => {
    try {
      const res = await axios.post("/v1/delivery/resend-otp", {
        deliveryId: orderId,
      });
      if (res.data?.data?.otp) {
        alert(
          `New OTP generated for customer: ${res.data.data.otp} (Valid for 30 minutes)`
        );
      }
    } catch (err) {
      alert("Failed to resend OTP");
    }
  };

  // 4. GPS Location Live Update
  const handleUpdateLocation = async (orderId) => {
    setGpsUpdating(true);
    setGpsFeedback("");

    const sendCoords = async (lat, lng) => {
      try {
        await axios.post("/v1/delivery/update-location", {
          deliveryId: orderId,
          deliveryPartner_phone: userData.phone,
          lat,
          lng,
        });
        setGpsFeedback(`Location updated: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        fetchOrders();
      } catch (err) {
        setGpsFeedback("Failed to update GPS coordinates on server");
      } finally {
        setGpsUpdating(false);
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sendCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Fallback simulation: slight coordinate shift along Pune route
          const simulatedLat = 18.5254 + (Math.random() - 0.5) * 0.005;
          const simulatedLng = 73.8517 + (Math.random() - 0.5) * 0.005;
          sendCoords(simulatedLat, simulatedLng);
        },
        { timeout: 5000 }
      );
    } else {
      const simulatedLat = 18.5254 + (Math.random() - 0.5) * 0.005;
      const simulatedLng = 73.8517 + (Math.random() - 0.5) * 0.005;
      sendCoords(simulatedLat, simulatedLng);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case "ASSIGNED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5" /> Assigned
          </span>
        );
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
          </span>
        );
      case "PREPARING":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <Store className="w-3.5 h-3.5" /> Preparing
          </span>
        );
      case "PICKED_UP":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
            <Package className="w-3.5 h-3.5" /> Picked Up
          </span>
        );
      case "ON_THE_WAY":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse">
            <Truck className="w-3.5 h-3.5" /> On The Way
          </span>
        );
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Check className="w-3.5 h-3.5" /> Delivered
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 text-slate-800 pb-16">
      {/* 1. Header Inspired by Swiggy / Zomato / Uber Driver */}
      <nav className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200 sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center text-white shadow-md">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                Delivery Partner Hub
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                On Duty
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {userData?.vehicleType ? `Vehicle: ${userData.vehicleType.toUpperCase()}` : "Active Rider"}{" "}
              {userData?.licenseNo ? `• Lic: ${userData.licenseNo}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            title="Refresh order lists"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-semibold text-gray-800">{userData?.fullName}</span>
            <span className="text-xs text-gray-500">{userData?.city || "Pune"}</span>
          </div>

          <button
            onClick={() => {
              dispatch(logout());
              localStorage.removeItem("status");
              navigate("/");
            }}
            className="px-4 py-2 text-sm font-semibold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 rounded-lg border border-red-200 transition duration-150"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* 2. Top Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {/* Total Assigned */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Assigned
              </p>
              <h3 className="text-2xl font-extrabold text-gray-900">
                {summary.totalAssigned}
              </h3>
            </div>
          </div>

          {/* Pending / New */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Pending Acceptance
              </p>
              <h3 className="text-2xl font-extrabold text-amber-600">
                {summary.pendingOrders}
              </h3>
            </div>
          </div>

          {/* Active Deliveries */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Active In-Transit
              </p>
              <h3 className="text-2xl font-extrabold text-indigo-600">
                {summary.activeDeliveries}
              </h3>
            </div>
          </div>

          {/* Completed Deliveries */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Delivered
              </p>
              <h3 className="text-2xl font-extrabold text-emerald-600">
                {summary.completedDeliveries}
              </h3>
            </div>
          </div>

          {/* Earnings Summary */}
          <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-700 to-teal-800 text-white p-4 sm:p-5 rounded-2xl shadow-md flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/20 text-emerald-100">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">
                Total Earnings
              </p>
              <h3 className="text-2xl font-black">₹{summary.totalEarnings}</h3>
              <p className="text-[11px] text-emerald-200">
                Today: ₹{summary.todayEarnings}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Search and Status Tabs Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by customer, phone, shop, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 self-end md:self-center">
              <span>Showing {orders.length} order{orders.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          {/* Status Tabs with Counters */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-t border-gray-100 pt-3">
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Multiple Orders Visible At Once (Grid Layout) */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-emerald-600" />
            <p className="text-sm font-medium">Loading assigned orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center max-w-md mx-auto my-12">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-800 mb-1">
              No orders found
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {activeTab === "ALL"
                ? "No delivery orders have been assigned to your profile yet."
                : `No orders in "${activeTab}" stage right now.`}
            </p>
            {activeTab !== "ALL" && (
              <button
                onClick={() => setActiveTab("ALL")}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
              >
                View All Orders
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((ord) => {
              const orderIdShort = ord._id ? ord._id.slice(-6).toUpperCase() : "ORD";
              const isAssigned = ord.status === "ASSIGNED";
              const isAccepted = ord.status === "ACCEPTED";
              const isPreparing = ord.status === "PREPARING";
              const isPickedUp = ord.status === "PICKED_UP";
              const isOnTheWay = ord.status === "ON_THE_WAY";
              const isDelivered = ord.status === "DELIVERED";

              return (
                <div
                  key={ord._id}
                  className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                    isOnTheWay
                      ? "border-indigo-300 shadow-md ring-1 ring-indigo-200"
                      : "border-gray-200 hover:shadow-lg shadow-sm"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-start bg-slate-50/50">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-gray-500">
                          #{orderIdShort}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"}
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">
                        {ord.shopName || "Partner Store"}
                      </h4>
                    </div>
                    {getStatusBadge(ord.status)}
                  </div>

                  {/* Card Route Details */}
                  <div className="p-4 sm:p-5 space-y-4 text-xs flex-1">
                    {/* Pickup Shop */}
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 p-1 rounded-md bg-emerald-50 text-emerald-600">
                        <Store className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          Pickup: {ord.shopName}
                        </p>
                        <p className="text-gray-500 line-clamp-1">
                          {ord.shopAddress || "Store location"}
                        </p>
                        <a
                          href={`tel:${ord.shopkeeper_phone}`}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:underline mt-0.5"
                        >
                          <Phone className="w-3 h-3" /> Call Shop ({ord.shopkeeper_phone})
                        </a>
                      </div>
                    </div>

                    {/* Dropoff Customer */}
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 p-1 rounded-md bg-rose-50 text-rose-600">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          Dropoff: {ord.customer_name}
                        </p>
                        <p className="text-gray-600 line-clamp-2">
                          {ord.customer_address || "Customer address"}
                        </p>
                        <a
                          href={`tel:${ord.customer_phone}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-0.5 font-medium"
                        >
                          <Phone className="w-3 h-3" /> Call Customer ({ord.customer_phone})
                        </a>
                      </div>
                    </div>

                    {/* Order Items Preview */}
                    <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                      <div className="flex justify-between items-center text-gray-600 mb-1 font-medium">
                        <span>Items ({ord.items?.length || 1})</span>
                        <span className="font-bold text-gray-900">
                          ₹{ord.totalPrice} to collect
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {ord.items && ord.items.length > 0
                          ? ord.items.map((it) => `${it.name} (${it.quantity})`).join(", ")
                          : "Assorted grocery items"}
                      </p>
                    </div>

                    {/* Earnings Pill */}
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                        Delivery Payout: +₹{ord.deliveryFee || 40}
                      </span>
                      <button
                        onClick={() => setSelectedOrderForMap(ord)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 underline underline-offset-2"
                      >
                        <Eye className="w-3.5 h-3.5" /> Map & Details
                      </button>
                    </div>
                  </div>

                  {/* Card Workflow Action Buttons */}
                  <div className="p-4 bg-slate-50 border-t border-gray-100">
                    {/* ASSIGNED -> ACCEPTED */}
                    {isAssigned && (
                      <button
                        onClick={() => handleAcceptOrder(ord._id)}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs tracking-wide shadow-sm hover:shadow transition flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Accept Delivery Order
                      </button>
                    )}

                    {/* ACCEPTED -> PREPARING / PICKED_UP */}
                    {isAccepted && (
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleUpdateStatus(
                              ord._id,
                              "PREPARING",
                              "Shop is preparing items"
                            )
                          }
                          className="flex-1 py-2 px-3 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-xl font-bold text-xs transition"
                        >
                          Mark Preparing
                        </button>
                        <button
                          onClick={() =>
                            handleUpdateStatus(
                              ord._id,
                              "PICKED_UP",
                              "Picked up items from store"
                            )
                          }
                          className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition"
                        >
                          Confirm Pickup
                        </button>
                      </div>
                    )}

                    {/* PREPARING -> PICKED_UP */}
                    {isPreparing && (
                      <button
                        onClick={() =>
                          handleUpdateStatus(
                            ord._id,
                            "PICKED_UP",
                            "Items verified and picked up"
                          )
                        }
                        className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-xs tracking-wide shadow-sm transition flex items-center justify-center gap-2"
                      >
                        <Package className="w-4 h-4" /> Confirm Pickup from Shop
                      </button>
                    )}

                    {/* PICKED_UP -> ON_THE_WAY */}
                    {isPickedUp && (
                      <button
                        onClick={() =>
                          handleUpdateStatus(
                            ord._id,
                            "ON_THE_WAY",
                            "Delivery partner on the way to customer"
                          )
                        }
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs tracking-wide shadow-sm transition flex items-center justify-center gap-2"
                      >
                        <Truck className="w-4 h-4" /> Start Journey (On The Way)
                      </button>
                    )}

                    {/* ON_THE_WAY -> DELIVERED (Requires OTP verification) */}
                    {isOnTheWay && (
                      <button
                        onClick={() => {
                          setOtpModalOrder(ord);
                          setOtpInput("");
                          setOtpError("");
                        }}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs tracking-wide shadow-md transition flex items-center justify-center gap-2"
                      >
                        <KeyRound className="w-4 h-4" /> Deliver with Customer OTP
                      </button>
                    )}

                    {/* DELIVERED -> Completion badge */}
                    {isDelivered && (
                      <div className="py-2 px-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                        <p className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Delivery Completed
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Payment Collected • ₹{ord.totalPrice}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. Interactive Details & Free Leaflet Map Modal */}
      {selectedOrderForMap && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Navigation className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Order Details & GPS Route
                  </h3>
                  <p className="text-xs text-gray-500">
                    ID: #{selectedOrderForMap._id?.slice(-8).toUpperCase()} •{" "}
                    {selectedOrderForMap.status}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForMap(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6">
              {/* Visual Workflow Steps */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Delivery Workflow Progress
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {[
                    "ASSIGNED",
                    "ACCEPTED",
                    "PREPARING",
                    "PICKED_UP",
                    "ON_THE_WAY",
                    "DELIVERED",
                  ].map((st, idx) => {
                    const stepRanks = {
                      ASSIGNED: 1,
                      ACCEPTED: 2,
                      PREPARING: 3,
                      PICKED_UP: 4,
                      ON_THE_WAY: 5,
                      DELIVERED: 6,
                    };
                    const currentRank = stepRanks[selectedOrderForMap.status] || 1;
                    const stepRank = stepRanks[st];
                    const isDone = stepRank <= currentRank;
                    const isCurrent = stepRank === currentRank;

                    return (
                      <div
                        key={st}
                        className={`p-2.5 rounded-xl text-center border text-xs font-bold transition-all ${
                          isDone
                            ? isCurrent
                              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-gray-50 text-gray-400 border-gray-200"
                        }`}
                      >
                        <div className="flex justify-center mb-1">
                          {isDone ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] uppercase">
                          {st.replace(/_/g, " ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Free Leaflet OpenStreetMap View */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Interactive Live Route (OpenStreetMap)
                  </h4>
                  <button
                    onClick={() => handleUpdateLocation(selectedOrderForMap._id)}
                    disabled={gpsUpdating}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${gpsUpdating ? "animate-spin" : ""}`} />
                    Update My Live GPS
                  </button>
                </div>
                {gpsFeedback && (
                  <p className="text-xs text-emerald-600 font-semibold mb-2">
                    ✓ {gpsFeedback}
                  </p>
                )}
                <DeliveryMap
                  shopLocation={selectedOrderForMap.shop_location}
                  customerLocation={selectedOrderForMap.customer_location}
                  driverLocation={selectedOrderForMap.driver_location}
                  shopName={selectedOrderForMap.shopName}
                  customerName={selectedOrderForMap.customer_name}
                  status={selectedOrderForMap.status}
                  height="280px"
                />
              </div>

              {/* Order Items Breakdown */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Items to Deliver
                </h4>
                <ul className="divide-y divide-gray-200 text-xs text-gray-700">
                  {selectedOrderForMap.items?.map((item, idx) => (
                    <li key={idx} className="py-2 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-gray-900">{item.name}</span>
                        {item.note && (
                          <span className="text-gray-500 ml-1">({item.note})</span>
                        )}
                      </div>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border text-gray-600">
                        Qty: {item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-200 pt-3 mt-2 flex justify-between items-center text-sm font-bold text-gray-900">
                  <span>Cash to Collect:</span>
                  <span className="text-emerald-700 text-base">
                    ₹{selectedOrderForMap.totalPrice}
                  </span>
                </div>
              </div>

              {/* Status History Timeline */}
              {selectedOrderForMap.timeline?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Status Timestamps
                  </h4>
                  <div className="border-l-2 border-emerald-500 ml-2 space-y-3 pl-3 text-xs">
                    {selectedOrderForMap.timeline.map((event, i) => (
                      <div key={i} className="relative">
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full absolute -left-[17px] top-1"></div>
                        <p className="font-bold text-gray-800">
                          {event.status.replace(/_/g, " ")}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                        {event.note && (
                          <p className="text-[11px] text-gray-600">{event.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Customer Phone: <strong>{selectedOrderForMap.customer_phone}</strong>
              </span>
              <button
                onClick={() => setSelectedOrderForMap(null)}
                className="px-4 py-2 text-xs font-bold bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Secure OTP Verification Modal */}
      {otpModalOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border">
            {/* Header */}
            <div className="p-5 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6" />
                <div>
                  <h3 className="font-bold text-base">Verify Customer OTP</h3>
                  <p className="text-xs text-emerald-100">
                    Mandatory step to complete delivery
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOtpModalOrder(null)}
                className="text-emerald-100 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleVerifyOtp} className="p-6 space-y-5">
              <div className="bg-slate-50 p-3.5 rounded-xl border text-xs text-gray-700 space-y-1">
                <p>
                  <strong>Customer:</strong> {otpModalOrder.customer_name}
                </p>
                <p>
                  <strong>Phone:</strong> {otpModalOrder.customer_phone}
                </p>
                <p>
                  <strong>Total Cash to Collect:</strong> ₹
                  {otpModalOrder.totalPrice}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Enter 6-Digit Delivery OTP
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/\D/g, ""));
                    setOtpError("");
                  }}
                  autoFocus
                  className="w-full text-center tracking-[0.4em] font-mono text-2xl font-bold py-3 px-4 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-gray-500 mt-1.5 text-center">
                  Ask the customer for the OTP sent to their dashboard / SMS.
                </p>
              </div>

              {otpError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {otpSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>OTP Verified! Marking order as DELIVERED...</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleResendOtp(otpModalOrder._id)}
                  className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
                >
                  Resend OTP
                </button>
                <button
                  type="submit"
                  disabled={otpLoading || otpSuccess}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold tracking-wide shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Verify & Mark Delivered
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
