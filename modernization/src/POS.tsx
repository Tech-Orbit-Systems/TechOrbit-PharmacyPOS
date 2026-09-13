import { useEffect, useRef, useState } from "react";
import {
  Search,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  Pause,
  AlertTriangle,
} from "lucide-react";
import type {
  Line,
  Payment,
  Product,
  Quote,
  Receipt,
  SaleInput,
  User,
} from "./contracts";
import { money, Dialog } from "./shared";
const newKey = () => `TO-${crypto.randomUUID()}`;
export function POS({ user }: { user: User }) {
  const storageKey = `techorbit.drafts.${user.demo ? "review" : "live"}.${user.id}`;
  const [lines, setLines] = useState<Line[]>([]),
    [held, setHeld] = useState<
      {
        lines: Line[];
        customer: number | null;
        discount: string;
        method: Payment;
        key: string;
      }[]
    >(() => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch {
        return [];
      }
    }),
    [showHeld, setShowHeld] = useState(false);
  const [key, setKey] = useState(newKey),
    [query, setQuery] = useState(""),
    [products, setProducts] = useState<Product[]>([]),
    [selected, setSelected] = useState<Product | null>(null),
    [customers, setCustomers] = useState<{ id: number; name: string }[]>([]),
    [customer, setCustomer] = useState<number | null>(null),
    [discount, setDiscount] = useState("0"),
    [method, setMethod] = useState<Payment>("cash"),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quoting, setQuoting] = useState(false),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [tab, setTab] = useState("Products");
  const scan = useRef<HTMLInputElement>(null),
    seq = useRef(0),
    postLock = useRef(false),
    quoteSeq = useRef(0);
  const input: SaleInput = {
    key,
    paymentMethod: method,
    customerId: customer,
    discountMinor: Math.round(Number(discount) * 100),
    items: lines.map((l) => ({
      productId: l.product.id,
      saleUnit: l.unit,
      quantity: l.quantity,
    })),
  };
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    window.pharmacy
      .customers()
      .then(setCustomers)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(held));
    } catch {
      setError("Held sales could not be saved on this device");
    }
  }, [held, storageKey]);
  useEffect(() => {
    const id = ++seq.current;
    if (!query.trim()) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(
      () =>
        window.pharmacy
          .search({ q: query })
          .then((result) => {
            if (id === seq.current) {
              setProducts(result);
              setSelected(result[0] || null);
            }
          })
          .catch((e) => {
            if (id === seq.current) setError(e.message);
          }),
      160,
    );
    return () => {
      clearTimeout(timer);
      seq.current++;
    };
  }, [query]);
  useEffect(() => {
    const id = ++quoteSeq.current;
    setQuote(null);
    if (!lines.length) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const timer = setTimeout(
      () =>
        window.pharmacy
          .quote(input)
          .then((result) => {
            if (id === quoteSeq.current) {
              setQuote(result);
              setError("");
            }
          })
          .catch((e) => {
            if (id === quoteSeq.current) setError(e.message);
          })
          .finally(() => {
            if (id === quoteSeq.current) setQuoting(false);
          }),
      100,
    );
    return () => {
      clearTimeout(timer);
      quoteSeq.current++;
    };
  }, [inputKey]);
  function add(product: Product) {
    if (busy) return;
    if (!product.batches.length) {
      setError("No unexpired stock is available");
      return;
    }
    const unit = product.units[0];
    if (!unit) {
      setError("Configure a sale unit before selling this product");
      return;
    }
    setSelected(product);
    setLines((old) => {
      const index = old.findIndex(
        (l) => l.product.id === product.id && l.unit === unit.unit_name,
      );
      return index < 0
        ? [...old, { product, unit: unit.unit_name, quantity: 1 }]
        : old.map((l, i) =>
            i === index ? { ...l, quantity: l.quantity + 1 } : l,
          );
    });
    setQuery("");
    scan.current?.focus();
  }
  async function barcode() {
    try {
      const exact = await window.pharmacy.barcode({ barcode: query });
      if (exact) add(exact);
      else if (products.length === 1) add(products[0]);
      else setError("Select a matching product from the results");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function hold() {
    if (!lines.length || busy) return;
    setHeld((old) => [...old, { lines, customer, discount, method, key }]);
    reset();
  }
  function reset() {
    setLines([]);
    setQuote(null);
    setDiscount("0");
    setCustomer(null);
    setMethod("cash");
    setKey(newKey());
    setQuery("");
    setError("");
    scan.current?.focus();
  }
  async function pay() {
    if (postLock.current || !quote || quoting || !lines.length) return;
    postLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await window.pharmacy.post(input);
      setReceipt(result);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      postLock.current = false;
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        !scan.current ||
        scan.current.closest("[hidden]") ||
        receipt ||
        showHeld
      )
        return;
      if (e.key === "F2") {
        e.preventDefault();
        scan.current.focus();
      }
      if (e.key === "F3") {
        e.preventDefault();
        hold();
      }
      if (e.key === "F8") {
        e.preventDefault();
        void pay();
      }
      if (e.key === "F4") {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Quantity line 1"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  return (
    <div className="pos">
      <h1>Point of Sale</h1>
      <div className="sale-tabs">
        <button aria-pressed="true">Sale 01</button>
        <button disabled={busy} onClick={() => setShowHeld(true)}>
          Held sales ({held.length})
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="pos-fieldset">
        <div className="pos-toolbar panel">
          <div className="search-field">
            <Search size={18} />
            <input
              ref={scan}
              aria-label="Scan barcode or search medicine"
              placeholder="Scan barcode or search medicine"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void barcode();
                }
              }}
            />
            <kbd>F2</kbd>
          </div>
          <select
            aria-label="Customer"
            value={customer || ""}
            onChange={(e) =>
              setCustomer(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Walk-in customer</option>
            {customers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="price-mode">
            Price mode <b>Retail</b>
          </span>
        </div>
        <div className="pos-grid">
          <section className="panel invoice" data-testid="invoice">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch / Expiry</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th className="number">Rate (PKR)</th>
                  <th className="number">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const u = line.product.units.find(
                      (u) => u.unit_name === line.unit,
                    ),
                    allocated = quote?.items[index]?.allocations;
                  return (
                    <tr key={line.product.id + "-" + index}>
                      <td>
                        <strong>{line.product.name}</strong>
                        <small>{line.product.genericName}</small>
                        {(line.product.prescriptionRequired ||
                          line.product.controlledMedicine) && (
                          <small className="warning">
                            Prescription check required
                          </small>
                        )}
                      </td>
                      <td>
                        <small>
                          {allocated
                            ? allocated
                                .map((a) => {
                                  const batch = line.product.batches.find(
                                    (b) => b.id === a.batchId,
                                  );
                                  return `${batch?.batch_number || a.batchId} · ${batch?.expiry_date || "No expiry"}`;
                                })
                                .join(" / ")
                            : "FEFO at checkout"}
                        </small>
                      </td>
                      <td>
                        <select
                          aria-label={`Unit line ${index + 1}`}
                          value={line.unit}
                          onChange={(e) =>
                            setLines((old) =>
                              old.map((l, i) =>
                                i === index
                                  ? { ...l, unit: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        >
                          {line.product.units.map((u) => (
                            <option key={u.unit_name}>{u.unit_name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="quantity">
                          <button
                            aria-label={`Decrease line ${index + 1}`}
                            onClick={() =>
                              setLines((old) =>
                                old.map((l, i) =>
                                  i === index
                                    ? {
                                        ...l,
                                        quantity: Math.max(1, l.quantity - 1),
                                      }
                                    : l,
                                ),
                              )
                            }
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            aria-label={`Quantity line ${index + 1}`}
                            type="number"
                            min="0.01"
                            step={u?.allows_fractional_quantity ? "0.01" : "1"}
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((old) =>
                                old.map((l, i) =>
                                  i === index
                                    ? { ...l, quantity: Number(e.target.value) }
                                    : l,
                                ),
                              )
                            }
                          />
                          <button
                            aria-label={`Increase line ${index + 1}`}
                            onClick={() =>
                              setLines((old) =>
                                old.map((l, i) =>
                                  i === index
                                    ? { ...l, quantity: l.quantity + 1 }
                                    : l,
                                ),
                              )
                            }
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="number">
                        {u?.selling_price_minor == null
                          ? "—"
                          : money(u.selling_price_minor)}
                      </td>
                      <td className="number">
                        {u?.selling_price_minor == null
                          ? "—"
                          : money(
                              Math.round(u.selling_price_minor * line.quantity),
                            )}
                      </td>
                      <td>
                        <button
                          aria-label={`Remove ${line.product.name}`}
                          onClick={() =>
                            setLines((old) => old.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lines.length && (
              <div className="empty">
                <Search size={28} />
                <h3>Ready for your next sale</h3>
                <p>Scan a barcode or search for a medicine to begin.</p>
                <small>Demo barcode: 0012345678901</small>
              </div>
            )}
          </section>
          <section className="panel finder" data-testid="finder">
            <div className="sale-tabs">
              {["Products", "Batches"].map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="finder-content">
              {products.map((p) => (
                <button
                  className={
                    "product-row " + (selected?.id === p.id ? "selected" : "")
                  }
                  key={p.id}
                  onClick={() => {
                    setSelected(p);
                    setTab("Batches");
                  }}
                >
                  <strong>{p.name}</strong>
                  <small>{p.genericName}</small>
                  <span>
                    {p.sellableBaseQuantity} {p.baseUnit}
                  </span>
                </button>
              ))}
              {!products.length && !selected && (
                <p>Search by name, generic or barcode.</p>
              )}
              {selected && (
                <div className="batch-card">
                  <h3>{selected.name}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>Expiry</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.batches.map((b, i) => (
                        <tr key={b.id}>
                          <td>
                            {b.batch_number}
                            <small>{i === 0 ? "FEFO" : ""}</small>
                          </td>
                          <td>{b.expiry_date || "None"}</td>
                          <td>{b.quantity_on_hand}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    className="primary full"
                    disabled={!selected.batches.length}
                    onClick={() => add(selected)}
                  >
                    Add medicine
                  </button>
                </div>
              )}
            </div>
            <p className="finder-note">
              <AlertTriangle size={14} />
              Earliest valid expiry is allocated automatically.
            </p>
          </section>
        </div>
        <div className="panel payment-bar" data-testid="payment-bar">
          <div>
            <small>Subtotal (PKR)</small>
            <strong>{money(quote?.grossMinor ?? 0)}</strong>
          </div>
          <label className="discount">
            Discount (PKR)
            <input
              aria-label="Discount PKR"
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <div className="total">
            <small>Total (PKR)</small>
            <strong>
              {quoting ? "…" : money(quote?.finalTotalMinor ?? 0)}
            </strong>
          </div>
          <div className="payment-methods">
            {(
              [
                ["cash", "Cash", Banknote],
                ["card", "Card", CreditCard],
                ["digital", "Digital", Smartphone],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <button onClick={hold} disabled={!lines.length}>
            <Pause size={15} />
            Hold sale <kbd>F3</kbd>
          </button>
          <button
            className="primary pay"
            disabled={!quote || quoting || !lines.length}
            onClick={() => void pay()}
          >
            <Printer size={16} />
            {busy ? "Posting…" : "Pay & Print"}
            <kbd>F8</kbd>
          </button>
          <button
            onClick={() => {
              if (confirm("Clear the current unposted sale?")) reset();
            }}
          >
            More · Clear
          </button>
        </div>
      </fieldset>
      <div className="shortcut-row">
        <span>F2 Search</span>
        <span>F3 Hold sale</span>
        <span>F4 Quantity</span>
        <span>F8 Pay &amp; Print</span>
        {quote && (quote.gstMinor !== 0 || quote.roundingMinor !== 0) && (
          <span>
            GST: {money(quote.gstMinor)} · Rounding:{" "}
            {money(quote.roundingMinor)}
          </span>
        )}
      </div>
      {showHeld && (
        <Dialog title="Held sales" onClose={() => setShowHeld(false)}>
          {held.map((h, i) => (
            <button
              className="held-row"
              key={h.key}
              disabled={lines.length > 0}
              onClick={() => {
                setLines(h.lines);
                setCustomer(h.customer);
                setDiscount(h.discount);
                setMethod(h.method);
                setKey(h.key);
                setHeld((old) => old.filter((_, j) => j !== i));
                setShowHeld(false);
              }}
            >
              Resume sale {i + 1} · {h.lines.length} lines
            </button>
          ))}
          {lines.length > 0 && (
            <p>Hold or complete your current sale before resuming another.</p>
          )}
          {!held.length && <p>No held sales.</p>}
        </Dialog>
      )}
      {receipt && (
        <Dialog title="Sale completed" onClose={() => setReceipt(null)}>
          <div className="receipt">
            <h2>TechOrbit Pharmacy POS</h2>
            <p>{receipt.invoiceNumber}</p>
            <p>{new Date(receipt.soldAt).toLocaleString()}</p>
            {receipt.items.map((item, i) => (
              <p className="receipt-line" key={i}>
                <span>
                  {item.productName} × {item.quantity} {item.saleUnit}
                </span>
                <b>{money(item.lineTotalMinor)}</b>
              </p>
            ))}
            <h3>Total PKR {money(receipt.totals.finalTotalMinor)}</h3>
            <p>
              Payment:{" "}
              {receipt.payment.method === "bank_transfer"
                ? "Digital"
                : receipt.payment.method}
            </p>
          </div>
          <button className="primary" onClick={() => window.print()}>
            <Printer size={16} />
            Print receipt
          </button>
          <p>Sale is already saved. Reprinting will not create another sale.</p>
        </Dialog>
      )}
    </div>
  );
}
