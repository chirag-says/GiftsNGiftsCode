import React, { useState, useEffect } from "react";
import {
  FaAngleDown,
  FaBoxOpen,
  FaCalendarAlt,
  FaCreditCard,
  FaMapMarkerAlt,
  FaGift,
  FaShippingFast,
  FaTimesCircle,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion"; // For smooth expansion
import { toast } from "react-toastify";
import Badges from "./Badges";
import SideMenu from "../My Profile/SideMenu.jsx";
import api from "../../utils/api";

const CANCELLABLE_STATUSES = ["Confirmed", "Pending", "Processing"];

function Orders() {
  const [orders, setOrders] = useState([]);
  const [openOrderId, setOpenOrderId] = useState(null);
  const [detailedOrder, setDetailedOrder] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order? This action cannot be undone.")) return;

    setCancellingId(orderId);
    try {
      const res = await api.post(`/api/client/order/${orderId}/cancel`, {
        reason: "Cancelled by customer from orders page"
      });
      if (res.data.success) {
        toast.success("Order cancelled successfully. Refund will be processed shortly.");
        // Update the order in local state
        setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: "Cancelled" } : o));
        if (detailedOrder?._id === orderId) {
          setDetailedOrder(prev => ({ ...prev, status: "Cancelled" }));
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to cancel order. Please try again.";
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const toggleOrder = async (orderId) => {
    if (openOrderId === orderId) {
      setOpenOrderId(null);
      setDetailedOrder(null);
      return;
    }

    setOpenOrderId(orderId);
    setLoadingDetails(true);
    try {
      const res = await api.get(`/api/client/order/${orderId}`);
      if (res.data.success) {
        setDetailedOrder(res.data.order);
      }
    } catch (error) {
      console.error("Error fetching details", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await api.get("/api/client/get-orders");
        if (res.data.success) setOrders(res.data.orders);
      } catch (err) {
        console.error("Failed to fetch orders", err);
      }
    };
    fetchOrders();
  }, []);

  return (
    <section className="min-h-screen bg-[#f8f7f2] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* SIDEBAR */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <SideMenu />
          </aside>

          {/* MAIN CONTENT */}
          <main className="flex-1">
            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
              
              {/* HEADER */}
              <header className="px-6 py-8 sm:px-10 border-b border-stone-100 bg-white flex justify-between items-end">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-serif font-bold text-[#1a3a32]">
                    My Orders
                  </h1>
                  <p className="text-stone-400 text-sm mt-2 font-medium">
                    You have placed <span className="text-[#c5a059]">{orders.length} orders</span> in total
                  </p>
                </div>
                <div className="bg-[#fdfbf7] p-4 rounded-2xl border border-[#c5a059]/10 hidden sm:block">
                  <FaBoxOpen className="text-[#c5a059] text-2xl" />
                </div>
              </header>

              <div className="p-2 sm:p-6">
                {/* DESKTOP VIEW */}
                <div className="hidden md:block">
                  <table className="w-full border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-bold">
                        <th className="px-6 pb-2 text-left">Order Reference</th>
                        <th className="px-6 pb-2 text-center">Status</th>
                        <th className="px-6 pb-2 text-center">Amount</th>
                        <th className="px-6 pb-2 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <OrderRow
                          key={order._id}
                          order={order}
                          isOpen={openOrderId === order._id}
                          onToggle={() => toggleOrder(order._id)}
                          detailedOrder={detailedOrder}
                          isLoading={loadingDetails && openOrderId === order._id}
                          onCancel={handleCancelOrder}
                          cancellingId={cancellingId}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE VIEW */}
                <div className="md:hidden space-y-4">
                  {orders.map((order) => (
                    <MobileOrderCard
                      key={order._id}
                      order={order}
                      isOpen={openOrderId === order._id}
                      onToggle={() => toggleOrder(order._id)}
                      detailedOrder={detailedOrder}
                      isLoading={loadingDetails && openOrderId === order._id}
                      onCancel={handleCancelOrder}
                      cancellingId={cancellingId}
                    />
                  ))}
                </div>

                {orders.length === 0 && (
                  <div className="py-20 text-center">
                    <FaBoxOpen className="mx-auto text-4xl text-stone-200 mb-4" />
                    <p className="text-stone-500 font-medium">No orders found yet.</p>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}

/* ---------------- DESKTOP ROW ---------------- */

const OrderRow = ({ order, isOpen, onToggle, detailedOrder, isLoading, onCancel, cancellingId }) => (
  <>
    <tr 
      onClick={onToggle}
      className={`group cursor-pointer transition-all duration-300 ${
        isOpen ? "bg-[#fdfbf7]" : "hover:bg-stone-50"
      }`}
    >
      <td className="px-6 py-5 rounded-l-2xl border-y border-l border-transparent group-hover:border-stone-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-[#1a3a32]">
             <FaShippingFast size={14} />
          </div>
          <div>
            <p className="font-bold text-[#1a3a32] text-sm tracking-tight">
              #{order._id.slice(-8).toUpperCase()}
            </p>
            <p className="text-[11px] text-stone-400 flex items-center gap-1.5 mt-0.5">
              <FaCalendarAlt size={10} />
              {new Date(order.placedAt).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-5 text-center border-y border-transparent group-hover:border-stone-100">
        <Badges status={order.status} />
      </td>
      <td className="px-6 py-5 text-center border-y border-transparent group-hover:border-stone-100 font-bold text-[#1a3a32]">
        ₹{order.totalAmount.toLocaleString()}
      </td>
      <td className="px-6 py-5 text-right rounded-r-2xl border-y border-r border-transparent group-hover:border-stone-100">
        <button className={`p-2 rounded-full transition-colors ${isOpen ? 'bg-[#1a3a32] text-white' : 'text-stone-400'}`}>
          <FaAngleDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </td>
    </tr>
    {isOpen && (
      <tr>
        <td colSpan={4} className="px-2 pb-4">
          <div className="bg-[#fdfbf7] border-x border-b border-stone-100 rounded-b-3xl p-6 -mt-3">
            {isLoading ? <LoadingSkeleton /> : <ExpandedContent data={detailedOrder || order} onCancel={onCancel} cancellingId={cancellingId} />}
          </div>
        </td>
      </tr>
    )}
  </>
);

/* ---------------- MOBILE CARD ---------------- */

const MobileOrderCard = ({ order, isOpen, onToggle, detailedOrder, isLoading, onCancel, cancellingId }) => (
  <div className={`rounded-2xl border transition-all ${
    isOpen ? "border-[#c5a059]/30 bg-[#fdfbf7] shadow-md" : "border-stone-100 bg-white"
  }`}>
    <div className="p-4 flex justify-between items-center" onClick={onToggle}>
      <div className="flex gap-3 items-center">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOpen ? 'bg-[#c5a059] text-white' : 'bg-stone-50 text-stone-400'}`}>
           <FaBoxOpen />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
            #{order._id.slice(-8).toUpperCase()}
          </p>
          <p className="font-bold text-[#1a3a32]">₹{order.totalAmount.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <Badges status={order.status} />
        <p className="text-[10px] text-stone-400 italic">
          {new Date(order.placedAt).toLocaleDateString()}
        </p>
      </div>
    </div>

    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-t border-stone-100"
        >
          <div className="p-4">
            {isLoading ? <LoadingSkeleton /> : <ExpandedContent data={detailedOrder || order} isMobile onCancel={onCancel} cancellingId={cancellingId} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

/* ---------------- COMPONENTS ---------------- */

const ExpandedContent = ({ data, isMobile, onCancel, cancellingId }) => {
  const addr = data.shippingAddress;
  const canCancel = CANCELLABLE_STATUSES.includes(data.status);
  const isCancelling = cancellingId === data._id;

  return (
    <div className="space-y-6">
      {/* INFO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SHIPPING */}
        <div className="space-y-3">
          <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#c5a059] flex items-center gap-2">
            <FaMapMarkerAlt /> Delivery Address
          </h4>
          <div className="text-sm text-stone-600 bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
            <p className="font-bold text-[#1a3a32] mb-1">{addr?.name}</p>
            <p className="leading-relaxed">
              {addr?.address}, {addr?.locality && `${addr.locality},`} <br />
              {addr?.city}, {addr?.state} - <span className="font-bold">{addr?.pin}</span>
            </p>
            <div className="mt-3 pt-3 border-t border-stone-50 text-[12px]">
              <p><span className="text-stone-400">Phone:</span> {addr?.phone}</p>
              {addr?.alternatephone && <p><span className="text-stone-400">Alt:</span> {addr?.alternatephone}</p>}
            </div>
          </div>
        </div>

        {/* PAYMENT */}
        <div className="space-y-3">
          <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1a3a32] flex items-center gap-2">
            <FaCreditCard /> Payment Details
          </h4>
          <div className="text-sm bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex flex-col justify-between h-[calc(100%-2rem)]">
            <div>
              <p className="text-stone-400 text-[11px] uppercase font-bold">Method</p>
              <p className="font-bold text-[#1a3a32] mt-1">
                {data.paymentId ? "Prepaid Online" : "Cash on Delivery"}
              </p>
            </div>
            {data.paymentId && (
              <div className="mt-4">
                <p className="text-stone-400 text-[11px] uppercase font-bold">Transaction ID</p>
                <code className="text-[10px] block mt-1 bg-stone-50 p-2 rounded truncate border border-stone-100 text-stone-500">
                  {data.paymentId}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* ORDER SUMMARY */}
        <div className="space-y-3">
          <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1a3a32] flex items-center gap-2">
            <FaBoxOpen /> Order Summary
          </h4>
          <div className="bg-[#1a3a32] text-white p-5 rounded-2xl shadow-lg shadow-[#1a3a32]/10">
            <div className="flex justify-between text-xs opacity-80 mb-2">
              <span>Items Total</span>
              <span>₹{data.totalAmount?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs opacity-80 mb-4 pb-4 border-b border-white/10">
              <span>Shipping</span>
              <span className="text-green-400 font-bold uppercase text-[9px]">Free</span>
            </div>
            <div className="flex justify-between font-serif text-lg font-bold">
              <span>Grand Total</span>
              <span className="text-[#c5a059]">₹{data.totalAmount?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ITEMS LIST */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-stone-50/50 border-b border-stone-100">
          <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Package Contents</span>
        </div>
        <div className="divide-y divide-stone-50">
          {data.items?.map((item, i) => (
            <div key={i} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 hover:bg-stone-50/30 transition-colors">
              <div className="flex flex-1 gap-4">
                <div className="w-20 h-24 bg-stone-100 rounded-xl flex-shrink-0 overflow-hidden border border-stone-200">
                  {item.productId?.images?.[0]?.url ? (
                    <img src={item.productId.images[0].url} className="w-full h-full object-cover" alt={item.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-stone-300">No Image</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-serif font-bold text-[#1a3a32] text-base leading-tight">
                        {item.productId?.title || item.name}
                      </h5>
                      <p className="text-xs text-stone-400 mt-1">Qty: <span className="text-[#1a3a32] font-bold">{item.quantity}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#1a3a32]">₹{item.price.toLocaleString()}</p>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 uppercase tracking-tighter">
                        {item.status || 'Processed'}
                      </span>
                    </div>
                  </div>

                  {/* GIFT MESSAGE */}
                  {item.giftMessage && (
                    <div className="mt-4 bg-[#fdfbf7] border border-[#c5a059]/20 p-3 rounded-xl relative overflow-hidden group">
                      <FaGift className="absolute -right-2 -bottom-2 text-[#c5a059]/10 text-4xl" />
                      <p className="text-[10px] font-bold text-[#c5a059] uppercase tracking-widest mb-1 flex items-center gap-1">
                        <FaGift size={10} /> Gift Note
                      </p>
                      <p className="text-xs italic text-stone-600 font-serif leading-relaxed">"{item.giftMessage}"</p>
                      <div className="mt-2 flex gap-4 text-[10px] font-bold text-[#1a3a32]">
                        {item.senderName && <span>From: {item.senderName}</span>}
                        {item.receiverName && <span>To: {item.receiverName}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* CANCEL BUTTON */}
      {canCancel && (
        <div className="flex justify-end pt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(data._id); }}
            disabled={isCancelling}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
              bg-red-50 text-red-600 border border-red-200
              hover:bg-red-100 hover:border-red-300
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200"
          >
            <FaTimesCircle size={14} />
            {isCancelling ? "Cancelling..." : "Cancel Order"}
          </button>
        </div>
      )}
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-32 bg-stone-200 rounded-2xl"></div>
      <div className="h-32 bg-stone-200 rounded-2xl"></div>
      <div className="h-32 bg-stone-200 rounded-2xl"></div>
    </div>
    <div className="h-40 bg-stone-200 rounded-2xl"></div>
  </div>
);

export default Orders;