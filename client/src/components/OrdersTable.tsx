export type OrderRow = {
  _id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

type OrdersTableProps = {
  orders: OrderRow[];
  canDelete: boolean;
  deleting: boolean;
  onDelete: (order: OrderRow) => void;
};

export function OrdersTable({
  orders,
  canDelete,
  deleting,
  onDelete,
}: OrdersTableProps) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Orders table"
    >
      <table>
        <caption>Matching orders</caption>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Email</th>
            <th scope="col">Status</th>
            <th scope="col">Total amount</th>
            <th scope="col">Created date</th>
            {canDelete && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>{order.customerName}</td>
              <td>{order.customerEmail}</td>
              <td>{order.status}</td>
              <td>
                {(order.totalAmount / 100).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td>
                <time dateTime={order.createdAt}>
                  {new Date(order.createdAt).toLocaleDateString()}
                </time>
              </td>
              {canDelete && (
                <td>
                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={`Delete order for ${order.customerName} (${order._id})`}
                    onClick={() => onDelete(order)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                    </svg>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
