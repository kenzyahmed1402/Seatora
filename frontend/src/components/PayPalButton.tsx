import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "../api";
import { loadPayPal, type PayPalButtons } from "../paypal";
import type { Booking, Payment } from "../types";

// PayPal's button. The order is created by the server from the booking (the
// browser never sends an amount), and the payment counts only once the
// server has captured it and checked PayPal's answer.
export const PayPalButton = ({ bookingId, onPaid }: { bookingId: string; onPaid: (booking: Booking) => void }) => {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [message, setMessage] = useState("");
  // Our own error message, kept because PayPal passes on only a generic one
  const lastError = useRef("");

  useEffect(() => {
    let buttons: PayPalButtons | null = null;
    let gone = false;
    loadPayPal()
      .then((paypal) => {
        if (gone || !container.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", color: "white", shape: "pill", label: "pay", height: 48 },
          createOrder: async () => {
            setMessage("");
            lastError.current = "";
            try {
              const { payment } = await api<{ payment: Payment }>("POST", "/payments/orders", { booking: bookingId });
              return payment.paypalOrderId;
            } catch (err) {
              lastError.current = errorMessage(err);
              throw err;
            }
          },
          onApprove: async ({ orderID }) => {
            try {
              const { booking } = await api<{ booking: Booking }>("POST", "/payments/capture", { orderId: orderID });
              onPaid(booking);
            } catch (err) {
              lastError.current = errorMessage(err);
              throw err;
            }
          },
          onCancel: () => setMessage("Payment cancelled · you can try again"),
          onError: () => setMessage(lastError.current || "PayPal couldn't finish the payment. Please try again."),
        });
        if (!buttons.isEligible()) throw new Error("PayPal isn't available in this browser");
        return buttons.render(container.current).then(() => setState("ready"));
      })
      .catch((err) => {
        if (!gone) {
          setState("failed");
          setMessage(errorMessage(err));
        }
      });
    return () => {
      gone = true;
      buttons?.close().catch(() => undefined);
    };
  }, [bookingId, onPaid]);

  return (
    <div className="paypal-area">
      {state === "loading" && (
        <p className="ticket-status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" /> Loading PayPal…
        </p>
      )}
      <div ref={container} className="paypal-buttons" />
      {message && (
        <p className="ticket-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {message}
        </p>
      )}
    </div>
  );
};

