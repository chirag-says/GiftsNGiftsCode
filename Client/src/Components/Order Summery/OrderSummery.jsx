import React, { useContext, useEffect, useState } from "react";
import { AppContext } from "../context/Appcontext.jsx";
import CartItems from "../Cart Page/CartItems.jsx";
import Totalprice from "../Cart Page/Totalprice.jsx";
import api from "../../utils/api";
import { useNavigate, useLocation } from "react-router-dom";
import { Button, Divider, Paper, CircularProgress } from "@mui/material";
import { HiOutlineLocationMarker, HiOutlineShieldCheck, HiOutlineShoppingBag } from "react-icons/hi";
import { toast } from "react-toastify";

/**
 * SECURITY REFACTOR (v2.0):
 * 
 * CRITICAL FIX #1 - Price Manipulation Prevention:
 * - REMOVED: Client-side price calculation sent to /api/checkout
 * - NOW: Send only item IDs and quantities to backend
 * - Backend fetches REAL prices from database and calculates total
 * 
 * CRITICAL FIX #2 - Volatile State Protection:
 * - REMOVED: Fallback to full cart when selectedItems is undefined
 * - NOW: Redirect to /cartlist if navigation state is missing
 * - Prevents accidental bulk purchases on page refresh
 * 
 * SECURITY FIX #3 - PII Protection:
 * - Address fetched from authenticated backend API (not localStorage)
 */
function OrderSummery() {
  const navigate = useNavigate();
  const { cartItems, setCartItems, fetchCart, clearCartAfterOrder, isLoggedin } = useContext(AppContext);
  const location = useLocation();

  // Get selected items and address ID from navigation state
  const selectedItems = location.state?.selectedItems;
  const selectedAddressId = location.state?.selectedAddressId;

  /**
   * SECURITY FIX #2: Redirect Protection for Volatile State
   * 
   * If the user refreshes the page or navigates directly to /ordersummery,
   * location.state will be undefined. Instead of defaulting to the ENTIRE cart
   * (which could cause accidental bulk purchases), we redirect back to cart.
   */
  useEffect(() => {
    if (!location.state || !location.state.selectedItems) {
      toast.warning("Your session expired. Please select items again.");
      navigate("/cartlist", { replace: true });
    }
  }, []);

  // Only proceed if we have valid selected items
  const itemsToBuy = selectedItems
    ? cartItems.filter(item => selectedItems.includes(item.product._id))
    : []; // Empty array - component will redirect before this is used

  const [address, setAddress] = useState(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  /**
   * SECURITY: Fetch address from authenticated backend API
   * This replaces the insecure localStorage.getItem("selectedAddress") pattern
   */
  const fetchShippingAddress = async () => {
    setAddressLoading(true);
    setAddressError(null);

    try {
      let response;

      if (selectedAddressId) {
        // Fetch specific address by ID (passed via navigation state)
        response = await api.get(`/api/user/address/${selectedAddressId}`);
      } else {
        // Fallback: Fetch user's default shipping address
        response = await api.get('/api/user/default-shipping-address');
      }

      if (response.data.success && response.data.address) {
        setAddress(response.data.address);
      } else {
        setAddressError("No shipping address found. Please add an address.");
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error fetching address:", err);

      if (err.response?.status === 401) {
        setAddressError("Session expired. Please login again.");
        navigate("/login", { state: { from: location } });
        return;
      }

      setAddressError(err.response?.data?.message || "Failed to load shipping address.");
    } finally {
      setAddressLoading(false);
    }
  };

  useEffect(() => {
    const initializeOrder = async () => {

      if (!isLoggedin) {
        navigate("/login", { state: { from: location } });
        return;
      }

      if (!location.state?.selectedItems) {
        navigate("/cartlist");
        return;
      }

      // ✅ WAIT for cart to refresh
      await fetchCart();

      // Then fetch address
      await fetchShippingAddress();
    };

    initializeOrder();
  }, [isLoggedin]);

  const handleRemove = async (cartItemId) => {
    try {
      await api.delete(`/api/auth/delete/${cartItemId}`);
      setCartItems((prev) => prev.filter((item) => item.product._id !== cartItemId));
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error removing item:", err);
    }
  };

  const handleUpdateQuantity = async (productId, newQty) => {
    try {
      await api.put(
        '/api/auth/update-quantity',
        { productId, quantity: newQty }
      );
      setCartItems((prevItems) =>
        prevItems.map((item) =>
          item.product._id === productId ? { ...item, quantity: newQty } : item
        )
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Error updating quantity");
    }
  };

  const buildCheckoutPayload = () => {
    if (!address) {
      toast.error("Please select a shipping address.");
      throw new Error("Address missing");
    }

    const items = itemsToBuy.map((item) => ({
      productId: item.product._id,
      quantity: item.quantity,
      giftMessage: item.giftMessage || "",
      senderName: item.senderName || "",
      receiverName: item.receiverName || ""
    }));

    return {
      items,
      shippingAddress: {
        name: address.fullName ?? "",
        phone: address.phoneNumber ?? address.phone ?? "",
        address: address.address ?? "",
        city: address.city ?? "",
        state: address.state ?? "",
        pin: address.pin ? Number(address.pin) : 0,
        alternatephone: ""
      },
      image: itemsToBuy[0]?.product.image || "",
    };
  };

  /**
   * SECURE CHECKOUT HANDLER (v3.0 — Sprint 1)
   * 
   * FLOW:
   *   1. Send items + shipping address to /api/checkout
   *      → Server calculates prices, reserves stock, saves PendingOrder
   *   2. Open Razorpay modal with server-calculated amount
   *   3. On payment success, send verification to /api/paymentVerification
   *      → Server verifies signature, confirms stock, creates Order + clears cart
   *   4. Navigate to success page with order details
   * 
   * NO MORE DOUBLE STOCK DEDUCTION:
   *   Old flow called /place-order AFTER payment, which deducted stock again.
   *   New flow creates the order during payment verification — stock deducted once.
   */
  const checkoutHandler = async () => {
    if (isProcessingPayment) return; // Prevent double-click
    setIsProcessingPayment(true);

    try {
      // Build payload with items + shipping address for server to store
      const checkoutPayload = buildCheckoutPayload();

      // Step 1: Get Razorpay key
      const { data: { key } } = await api.get('/api/getkey');

      // Step 2: Create order with server-side price calculation + stock reservation
      const { data } = await api.post('/api/checkout', checkoutPayload);

      if (!data.success || !data.order) {
        throw new Error(data.error || "Failed to create payment order");
      }

      const { order, breakdown } = data;

      if (import.meta.env.DEV) {
        console.log("[Checkout] Server-calculated total:", breakdown?.total);
      }

      // Step 3: Open Razorpay with server-calculated amount
      const options = {
        key,
        amount: order.amount,
        currency: "INR",
        name: "GiftnGifts",
        description: "Secure Order Payment",
        order_id: order.id,
        handler: async function (response) {
          try {
            if (
              !response.razorpay_order_id ||
              !response.razorpay_payment_id ||
              !response.razorpay_signature
            ) {
              toast.error("Payment verification failed");
              setIsProcessingPayment(false);
              return;
            }

            // Step 4: Verify payment — server creates order + clears cart
            const verifyRes = await api.post('/api/paymentVerification', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            // The server may redirect (302) or return JSON
            // axios follows redirects for GET but not POST, so handle both cases
            if (verifyRes.data?.success !== false) {
              // Refresh cart to reflect cleared state
              fetchCart();

              // Navigate to success page
              navigate("/payment-success", {
                state: {
                  paymentId: response.razorpay_payment_id,
                  orderId: verifyRes.data?.orderId
                }
              });
            } else {
              toast.error("Payment verification failed. Contact support.");
              setIsProcessingPayment(false);
            }
          } catch (error) {
            // Even if verification call fails, the server may have
            // already created the order (webhook fallback handles this).
            // Navigate to success and let them check My Orders.
            fetchCart();
            toast.info("Payment received! Check 'My Orders' for status.");
            navigate("/payment-success", {
              state: { paymentId: response.razorpay_payment_id }
            });
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false);
            toast.info("Payment cancelled");
          }
        },
        prefill: {
          name: address?.fullName,
          contact: address?.phoneNumber
        },
        theme: { color: "#7d0492" },
      };

      const razor = new window.Razorpay(options);
      razor.on('payment.failed', function (response) {
        setIsProcessingPayment(false);
        toast.error("Payment failed. Please try again.");
        if (import.meta.env.DEV) console.error("Payment failed:", response.error);
      });
      razor.open();

    } catch (error) {
      setIsProcessingPayment(false);
      toast.error(error.message || "Payment initialization failed.");
      if (import.meta.env.DEV) console.error("Checkout error:", error);
    }
  };

  // Loading state while fetching address
  if (addressLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <CircularProgress sx={{ color: '#7d0492' }} />
          <p className="mt-4 text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header Section */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-[#7d0492] p-2 rounded-lg text-white">
            <HiOutlineShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Review Your Order</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="lg:w-[70%] space-y-6">

            <Paper
              elevation={0}
              className="relative bg-white border border-[#EDE3D2] p-6 sm:p-8 rounded-[2rem] transition-all"
            >
              {/* Card Header */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                  <h3 className="flex items-center gap-2 font-serif text-xl font-bold text-[#322619]">
                    <HiOutlineLocationMarker className="text-[#B58D2F] text-2xl" />
                    Delivery Destination
                  </h3>
                  <div className="w-12 h-0.5 bg-[#B58D2F] mt-1"></div>
                </div>

                {address && !addressError && (
                  <Button
                    size="small"
                    onClick={() => navigate("/addaddress")}
                    className="!text-[#B58D2F] !text-[11px] !font-black !uppercase !tracking-widest !rounded-full hover:!bg-[#FDFBF7]"
                  >
                    Change
                  </Button>
                )}
              </div>

              {/* Conditional Content Rendering */}
              <div className="min-h-[100px] flex items-center">
                {addressError ? (
                  /* --- ERROR STATE --- */
                  <div className="w-full bg-red-50/50 border border-red-100 p-4 rounded-2xl flex flex-col items-center text-center">
                    <p className="text-red-600 text-sm font-medium italic mb-3">
                      {addressError}
                    </p>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => navigate("/addaddress")}
                      className="!bg-red-600 !text-white !rounded-full !px-6 !text-[10px] !font-bold"
                    >
                      Fix Address
                    </Button>
                  </div>

                ) : address ? (
                  /* --- ADDRESS DISPLAY STATE --- */
                  <div className="w-full">
                    <div className="flex flex-col gap-1">
                      <p className="font-serif text-lg font-bold text-[#322619] mb-1 capitalize">
                        {address.fullName}
                      </p>

                      <div className="space-y-0.5">
                        <p className="text-sm text-[#544231]/80 leading-relaxed font-medium">
                          {address.address}
                        </p>
                        <p className="text-sm text-[#544231]/80 font-medium">
                          {address.city}, {address.state} —
                          <span className="font-bold text-[#322619] ml-1">{address.pin}</span>
                        </p>
                      </div>

                      <div className="mt-4 pt-4 border-t border-dashed border-[#EDE3D2] flex items-center gap-4">
                        <div className="flex justify-center items-center gap-2">
                          <p className="text-sm font-bold  text-[#322619] tracking-tight">
                            <span className="text-[#B58D2F]">Phone :</span> +91 {address.phoneNumber}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                ) : (
                  /* --- EMPTY STATE --- */
                  <div className="w-full py-8 border-2 border-dashed border-[#EDE3D2] bg-[#FDFBF7] rounded-2xl flex flex-col items-center text-center px-4">
                    <p className="text-[#544231]/60 text-sm font-serif mb-4">
                      No delivery location selected for this treasure.
                    </p>
                    <Button
                      variant="contained"
                      onClick={() => navigate("/addaddress")}
                      className="!bg-[#322619] !text-white !rounded-full !px-8 !py-2.5 !text-xs !font-bold !shadow-lg"
                    >
                      + Locate Destination
                    </Button>
                  </div>
                )}
              </div>


            </Paper>

            {/* 2. Items List Card */}
            <Paper elevation={0} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b bg-white">
                <h3 className="flex items-center gap-2 font-bold text-gray-700">
                  <HiOutlineShoppingBag className="text-[#7d0492]" /> Items in your Order ({itemsToBuy.length})
                </h3>
              </div>

              <div className="max-h-[500px] overflow-y-auto bg-white">
                {itemsToBuy.length > 0 ? (
                  itemsToBuy.map((item) => (
                    <CartItems
                      key={item.product._id}
                      cartItemId={item.product._id}
                      product={item.product}
                      quantity={item.quantity}
                      onRemove={handleRemove}
                      onUpdateQuantity={handleUpdateQuantity}

                      giftMessage={item.giftMessage}
                      senderName={item.senderName}
                      receiverName={item.receiverName}
                    />
                  ))
                ) : (
                  <div className="p-10 text-center text-gray-400 italic">No items found in your cart.</div>
                )}
              </div>
            </Paper>

            {/* Bottom Pay Button for Mobile (Hidden on LG) */}
            <div className="lg:hidden">
              <Button
                fullWidth
                variant="contained"
                onClick={checkoutHandler}
                disabled={itemsToBuy.length === 0 || !address || !!addressError || isProcessingPayment}
                className="!bg-[#ff9f00] !py-4 !rounded-xl !font-bold !text-lg !shadow-lg"
              >
                {isProcessingPayment ? (
                  <span className="flex items-center gap-2">
                    <CircularProgress size={20} color="inherit" /> Processing...
                  </span>
                ) : (
                  "Confirm and Pay"
                )}
              </Button>
            </div>
          </div>

          {/* Sidebar (Price Summary) */}
          <div className="lg:w-[30%] w-full">
            <div className="lg:sticky lg:top-28 space-y-6">

              {/* PRICE SUMMARY CARD */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 sm:p-6">
                <Totalprice selectedItemIds={selectedItems} />
              </div>

              {/* PAYMENT CTA */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-4 sm:p-6">
                <Button
                  fullWidth
                  variant="contained"
                  onClick={checkoutHandler}
                  disabled={
                    itemsToBuy.length === 0 ||
                    !address ||
                    !!addressError ||
                    isProcessingPayment
                  }
                  className="!bg-[#ff9f00] !py-4 !rounded-xl 
        !font-bold !text-base sm:!text-lg 
        !shadow-xl hover:!bg-[#e68a00] 
        transition-all transform hover:scale-[1.02]
        disabled:!opacity-60 disabled:!scale-100"
                >
                  {isProcessingPayment ? (
                    <span className="flex items-center justify-center gap-3">
                      <CircularProgress size={20} color="inherit" />
                      Processing Payment…
                    </span>
                  ) : (
                    "Complete Payment"
                  )}
                </Button>

                {/* TRUST INFO */}
                <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-gray-400 uppercase tracking-widest font-medium">
                  <span>🔒</span>
                  <span>Secure 256-bit SSL Encrypted Payment</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default OrderSummery;