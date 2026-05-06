const orders = new Map();

export function createOrder(order) {
  orders.set(order.id, {
    ...order,
    status: "created",
    verified: false,
  });
}

export function markPaid(orderId, paymentId) {
  const order = orders.get(orderId);
  if (!order) return;

  orders.set(orderId, {
    ...order,
    status: "paid",
    paymentId,
  });
}

export function markVerified(orderId) {
  const order = orders.get(orderId);
  if (!order) return;

  orders.set(orderId, {
    ...order,
    verified: true,
  });
}

export function getOrder(orderId) {
  return orders.get(orderId);
}
