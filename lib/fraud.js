export function detectFraud(order, payment) {
  if (!order || !payment) return true;

  if (Number(payment.amount) !== Number(order.amount)) {
    return true;
  }

  if (payment.currency !== order.currency) {
    return true;
  }

  return false;
}
