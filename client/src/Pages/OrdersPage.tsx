import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../api";
import { OrdersTable } from "../components/OrdersTable";
import type { OrderRow } from "../components/OrdersTable";

type OrdersResponse = {
  orders: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function OrdersPage() {
  const { session, authenticatedRequest } = useAuth();
  const queryClient = useQueryClient();
  const deletion = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await authenticatedRequest(`/orders/${orderId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
    retry: false,
  });

  function deleteOrder(order: OrderRow) {
    if (deletion.isPending || session?.user.role !== "admin") return;
    if (
      window.confirm(
        `Permanently delete the order for ${order.customerName}? This cannot be undone.`,
      )
    ) {
      deletion.mutate(order._id);
    }
  }
  const [searchInput, setSearchInput] = useState("");
  const [params, setParams] = useState({
    search: "",
    status: "",
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
  });
  const searchPending = searchInput.trim() !== params.search;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setParams((current) =>
        current.search === searchInput.trim()
          ? current
          : { ...current, search: searchInput.trim(), page: 1 },
      );
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["orders", session?.user.id, params],
    queryFn: async ({ signal }): Promise<OrdersResponse> => {
      const queryString = new URLSearchParams({
        search: params.search,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        page: String(params.page),
      });
      if (params.status) queryString.set("status", params.status);
      const response = await authenticatedRequest(`/orders?${queryString}`, {
        signal,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      return response.json();
    },
    enabled: !searchPending,
    retry: false,
  });

  function changeFilter(
    field: "status" | "sortBy" | "sortOrder",
    value: string,
  ) {
    setParams((current) => ({ ...current, [field]: value, page: 1 }));
  }

  const loading = searchPending || query.isPending;
  return (
    <section className="orders-card" aria-labelledby="orders-heading">
      <h2 id="orders-heading">Orders</h2>
      {deletion.isError && <p role="alert">{deletion.error.message}</p>}
      <div className="order-filters">
        <label>
          Search customers
          <input
            type="search"
            value={searchInput}
            maxLength={100}
            aria-describedby="search-help"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={params.status}
            onChange={(event) => changeFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Sort by
          <select
            value={params.sortBy}
            onChange={(event) => changeFilter("sortBy", event.target.value)}
          >
            <option value="createdAt">Created date</option>
            <option value="totalAmount">Total amount</option>
          </select>
        </label>
        <label>
          Direction
          <select
            value={params.sortOrder}
            onChange={(event) => changeFilter("sortOrder", event.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>
      <p id="search-help">
        Search by a name or name phrase, or an exact full email address.
      </p>
      {loading ? (
        <p role="status">Loading orders…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : query.data ? (
        <>
          <p role="status">
            {query.data.total.toLocaleString()} matching orders
            {query.isFetching ? " · Updating…" : ""}
          </p>
          {query.data.orders.length ? (
            <OrdersTable
              orders={query.data.orders}
              canDelete={session?.user.role === "admin"}
              deleting={deletion.isPending}
              onDelete={deleteOrder}
            />
          ) : (
            <p>
              No orders found on this page. Change your filters or go to the
              previous page.
            </p>
          )}
          <nav aria-label="Orders pagination" className="pagination">
            <button
              disabled={params.page <= 1 || query.isFetching}
              onClick={() =>
                setParams((current) => ({ ...current, page: current.page - 1 }))
              }
            >
              Previous
            </button>
            <span>
              Page {params.page} of {Math.max(1, query.data.totalPages)}
            </span>
            <button
              disabled={
                params.page >= query.data.totalPages || query.isFetching
              }
              onClick={() =>
                setParams((current) => ({ ...current, page: current.page + 1 }))
              }
            >
              Next
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
