import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../api";
import { formSchema, operationSchema } from "../validation/createOrder";
import type { CreateOperation } from "../validation/createOrder";

const emptyItem = () => ({ name: "", quantity: "1", unitPrice: "" });
const emptyForm = () => ({
  customerName: "",
  customerEmail: "",
  items: [emptyItem()],
});
const responseSchema = z.object({ order: z.object({ _id: z.string() }) });

function readOperation(storageKey: string): CreateOperation | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const result = operationSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function CreateOrderForm() {
  const { session, authenticatedRequest } = useAuth();
  const queryClient = useQueryClient();
  const storageKey = `orders-create:${session!.user.id}`;
  const [operation, setOperation] = useState(() => readOperation(storageKey));
  const [form, setForm] = useState(() =>
    operation
      ? {
          ...operation.payload,
          items: operation.payload.items.map((item) => ({
            ...item,
            quantity: String(item.quantity),
            unitPrice: (item.unitPrice / 100).toFixed(2),
          })),
        }
      : emptyForm(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const parsed = formSchema.shape.items.safeParse(form.items);
  const total = parsed.success
    ? parsed.data.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || operation?.orderId) return;
    const result = formSchema.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    const current = operation ?? {
      key: crypto.randomUUID(),
      payload: result.data,
    };
    try {
      // Persist before sending so a reload can retry the exact same operation.
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      setOperation(current);
      const response = await authenticatedRequest("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": current.key },
        body: JSON.stringify(current.payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const data = responseSchema.parse(await response.json());
      const complete = { ...current, orderId: data.order._id };
      setOperation(complete);
      sessionStorage.setItem(storageKey, JSON.stringify(complete));
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to create order. Retry this submission.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function startNew() {
    if (pending) return;
    if (
      operation &&
      !operation.orderId &&
      !window.confirm(
        "The previous request may have succeeded. Check the orders list before starting a different order. Start a new order?",
      )
    )
      return;
    try {
      sessionStorage.removeItem(storageKey);
      setOperation(null);
      setForm(emptyForm());
      setError("");
    } catch {
      setError(
        "Unable to clear the saved submission. Check browser storage permissions.",
      );
    }
  }

  function changeItem(
    index: number,
    field: "name" | "quantity" | "unitPrice",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  return (
    <section aria-labelledby="create-heading">
      <h2 id="create-heading">Create order</h2>
      <form className="create-order" onSubmit={submit} noValidate>
        <fieldset disabled={pending || operation !== null}>
          <legend>Customer and items</legend>
          <label htmlFor="customer-name">Customer name</label>
          <input
            id="customer-name"
            value={form.customerName}
            maxLength={200}
            onChange={(event) =>
              setForm({ ...form, customerName: event.target.value })
            }
          />
          <label htmlFor="customer-email">Customer email</label>
          <input
            id="customer-email"
            type="email"
            value={form.customerEmail}
            maxLength={254}
            onChange={(event) =>
              setForm({ ...form, customerEmail: event.target.value })
            }
          />
          {form.items.map((item, index) => (
            <fieldset key={index}>
              <legend>Item {index + 1}</legend>
              <label htmlFor={`item-name-${index}`}>Item name</label>
              <input
                id={`item-name-${index}`}
                value={item.name}
                maxLength={120}
                onChange={(event) =>
                  changeItem(index, "name", event.target.value)
                }
              />
              <label htmlFor={`quantity-${index}`}>Quantity</label>
              <input
                id={`quantity-${index}`}
                type="number"
                min="1"
                max="10000"
                step="1"
                value={item.quantity}
                onChange={(event) =>
                  changeItem(index, "quantity", event.target.value)
                }
              />
              <label htmlFor={`price-${index}`}>Unit price</label>
              <input
                id={`price-${index}`}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={item.unitPrice}
                onChange={(event) =>
                  changeItem(index, "unitPrice", event.target.value)
                }
              />
              <button
                type="button"
                disabled={form.items.length === 1}
                onClick={() =>
                  setForm({
                    ...form,
                    items: form.items.filter((_, i) => i !== index),
                  })
                }
              >
                Remove item {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={form.items.length === 5}
            onClick={() =>
              setForm({ ...form, items: [...form.items, emptyItem()] })
            }
          >
            Add item
          </button>
        </fieldset>
        <p>
          Total amount:{" "}
          <output>{total === null ? "—" : (total / 100).toFixed(2)}</output>
        </p>
        {error && <p role="alert">{error}</p>}
        {operation?.orderId ? (
          <p role="status">Order created: {operation.orderId}</p>
        ) : (
          <button type="submit" disabled={pending}>
            {pending
              ? "Submitting…"
              : operation
                ? "Retry same order"
                : "Create order"}
          </button>
        )}
        {operation && (
          <button type="button" disabled={pending} onClick={startNew}>
            Start new order
          </button>
        )}
      </form>
    </section>
  );
}
