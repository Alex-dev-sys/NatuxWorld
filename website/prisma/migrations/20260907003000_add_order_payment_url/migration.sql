-- Checkout link for an order that is still awaiting payment. Without it the
-- order page had nowhere to send the buyer back to, and offered either a
-- dev-only mock button or a shop link that created a second order.
ALTER TABLE "Order" ADD COLUMN "paymentUrl" TEXT;
