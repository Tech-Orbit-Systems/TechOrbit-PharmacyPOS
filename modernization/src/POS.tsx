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
  CreditMode,
  AlternativeResult,
} from "./contracts";
import { money, Dialog } from "./shared";
import { AddCustomer } from './AddCustomer';
function unitLabel(product:Product,unit:Product['units'][number]){
 const single=product.units.reduce((a,b)=>a.base_quantity<b.base_quantity?a:b);
 const count=unit.base_quantity/single.base_quantity;
 return unit.unit_name+(count>1?` (${Number(count.toFixed(4))} ${single.unit_name})`:'');
}
const newKey = () => `TO-${crypto.randomUUID()}`;
const unitPrice=(product:Product,unitName:string)=>product.units.find(unit=>unit.unit_name===unitName)?.selling_price_minor??0;
export function POS({ user }: { user: User }) {
  const storageKey = `techorbit.drafts.${user.demo ? "review" : "live"}.${user.id}`;
  const [lines, setLines] = useState<Line[]>([]),
    [held, setHeld] = useState<
      {
        lines: Line[];
        customer: number | null;
        discount: string;
        discountType?:"fixed"|"percentage";
        method: Payment;
        key: string;
        creditMode?:CreditMode;
        received?:string;
        dueDate?:string;
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
    [discountType,setDiscountType]=useState<"fixed"|"percentage">("fixed"),
    [method, setMethod] = useState<Payment>("cash"),
    [creditMode,setCreditMode]=useState<CreditMode>('paid'),
    [received,setReceived]=useState('0'),
    [dueDate,setDueDate]=useState(''),
    [showAddCustomer,setShowAddCustomer]=useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quoting, setQuoting] = useState(false),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [alternatives,setAlternatives]=useState<AlternativeResult|null>(null),
    [alternativeBusy,setAlternativeBusy]=useState(false),
    [tab, setTab] = useState("Products");
  const scan = useRef<HTMLInputElement>(null),
    seq = useRef(0),
    postLock = useRef(false),
    quoteSeq = useRef(0);
  const input: SaleInput = {
    key,
    paymentMethod: method,
    creditMode,
    paidMinor:creditMode==='partial'?Math.round(Number(received)*100):0,
    dueDate,
    customerId: customer,
    invoiceDiscountType:discountType,
    invoiceDiscountValue:discountType==='fixed'?Math.round(Number(discount)*100):Number(discount),
    items: lines.map((l) => ({
      productId: l.product.id,
      saleUnit: l.unit,
      quantity: l.quantity,
      unitPriceMinor:Math.round(Number(l.unitPrice)*100),
      discountType:l.discountType,
      discountValue:l.discountType==='fixed'?Math.round(Number(l.discountValue)*100):Number(l.discountValue),
    })),
  };
  const inputKey = JSON.stringify(input);
  const creditReady=creditMode==='paid'||Boolean(customer&&dueDate&&quote&&(creditMode==='credit'||quote.balanceDueMinor>=0));
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
        ? [...old, { product, unit: unit.unit_name, quantity: 1,unitPrice:(Number(unit.selling_price_minor||0)/100).toFixed(2),discountType:'fixed',discountValue:'0' }]
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
  async function showAlternatives(product:Product){
    setError('');setAlternativeBusy(true);
    try{setAlternatives(await window.pharmacy.alternativeSearch({productId:product.id}));}
    catch(e){setError((e as Error).message);}
    finally{setAlternativeBusy(false);}
  }
  async function addAlternative(product:Product){
    if(!alternatives)return;
    setAlternativeBusy(true);setError('');
    try{
      const verified=await window.pharmacy.alternativeSelect({sourceProductId:alternatives.source.id,alternativeProductId:product.id});
      add(verified);setAlternatives(null);
    }catch(e){setError((e as Error).message);}
    finally{setAlternativeBusy(false);}
  }
  function hold() {
    if (!lines.length || busy) return;
    setHeld((old) => [...old, { lines, customer, discount,discountType, method, key,creditMode,received,dueDate }]);
    reset();
  }
  function reset() {
    setLines([]);
    setQuote(null);
    setDiscount("0");
    setDiscountType('fixed');
    setCustomer(null);
    setMethod("cash");
    setCreditMode('paid');setReceived('0');setDueDate('');
    setKey(newKey());
    setQuery("");
    setError("");
    scan.current?.focus();
  }
  async function pay() {
    if (postLock.current || !quote || quoting || !lines.length || !creditReady) return;
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
        showHeld || showAddCustomer
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
          <button className="add-customer" onClick={()=>setShowAddCustomer(true)}><Plus size={16}/>Add customer</button>
          <span className="price-mode" title="Retail is the price list. Credit and partial payment are selected below.">
            Pricing <b>Retail</b>
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
                  <th>Line discount</th>
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
                        <button className="alternative-link" disabled={alternativeBusy} onClick={()=>void showAlternatives(line.product)}>View alternatives</button>
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
                                  ? { ...l, unit: e.target.value,unitPrice:(unitPrice(l.product,e.target.value)/100).toFixed(2) }
                                  : l,
                              ),
                            )
                          }
                        >
                          {line.product.units.map((u) => (
                            <option key={u.unit_name} value={u.unit_name}>{unitLabel(line.product,u)}</option>
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
                        <input className="money-edit" aria-label={`Unit price line ${index + 1}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>setLines(old=>old.map((l,i)=>i===index?{...l,unitPrice:e.target.value}:l))}/>
                        {u?.selling_price_minor!=null&&Math.round(Number(line.unitPrice)*100)!==u.selling_price_minor&&<small>Original {money(u.selling_price_minor)}</small>}
                      </td>
                      <td>
                        <div className="line-discount"><select aria-label={`Discount type line ${index + 1}`} value={line.discountType} onChange={e=>setLines(old=>old.map((l,i)=>i===index?{...l,discountType:e.target.value as "fixed"|"percentage"}:l))}><option value="fixed">PKR</option><option value="percentage">%</option></select><input aria-label={`Discount value line ${index + 1}`} type="number" min="0" step="0.01" value={line.discountValue} onChange={e=>setLines(old=>old.map((l,i)=>i===index?{...l,discountValue:e.target.value}:l))}/></div>
                      </td>
                      <td className="number">
                        {quote?.items[index]?money(quote.items[index].lineTotalMinor):"—"}
                        {quote?.items[index]&&<small>GST {money(quote.items[index].gstMinor)}</small>}
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
                  <p className="packing-info">Sale units: {selected.units.map(u=>unitLabel(selected,u)).join(' · ')}</p>
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
                          <td>{Number(b.quantity_on_hand.toFixed(4))} {selected.baseUnit}</td>
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
                  <button className="full" disabled={alternativeBusy} onClick={()=>void showAlternatives(selected)}>View alternatives</button>
                </div>
              )}
            </div>
            <p className="finder-note">
              <AlertTriangle size={14} />
              Earliest valid expiry is allocated automatically.
            </p>
          </section>
        </div>
        <div className="panel credit-controls">
          <label>Payment type<select aria-label="Payment type" value={creditMode} onChange={e=>setCreditMode(e.target.value as CreditMode)}><option value="paid">Paid in full</option><option value="partial">Partial payment</option><option value="credit">Full credit</option></select></label>
          {creditMode!=='paid'&&<>
            {creditMode==='partial'&&<label>Received now (PKR)<input aria-label="Received now PKR" type="number" min="0.01" step="0.01" value={received} onChange={e=>setReceived(e.target.value)}/></label>}
            <label>Due date<input aria-label="Credit due date" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
            <div className="credit-due" aria-live="polite"><small>Remaining credit (PKR)</small><strong>{quote?money(quote.balanceDueMinor):'—'}</strong></div>
            {!customer&&<span className="warning">Select or add a customer for credit.</span>}
          </>}
          {creditMode==='paid'&&<small>Choose Cash, Card or Digital below.</small>}
        </div>
        <div className="panel payment-bar" data-testid="payment-bar">
          <div className="totals-group" data-testid="totals-group"><div>
            <small>Subtotal (PKR)</small>
            <strong>{money(quote?.grossMinor ?? 0)}</strong>
          </div>
          <label className="discount">
            Invoice discount
            <select aria-label="Invoice discount type" value={discountType} onChange={e=>setDiscountType(e.target.value as "fixed"|"percentage")}><option value="fixed">PKR fixed</option><option value="percentage">Percent</option></select>
            <input
              aria-label="Invoice discount value"
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
          <div className="pricing-breakdown" aria-live="polite"><span>Line discounts <b>{money(quote?.items.reduce((sum,item)=>sum+item.lineDiscountMinor,0)??0)}</b></span><span>Invoice discount <b>{money(quote?.invoiceDiscountMinor??0)}</b></span><span>GST <b>{money(quote?.gstMinor??0)}</b></span><span>Rounding <b>{money(quote?.roundingMinor??0)}</b></span></div>
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
                disabled={creditMode==='credit'}
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
            disabled={!quote || quoting || !lines.length || !creditReady}
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
      {alternatives&&<Dialog title={`Alternatives for ${alternatives.source.name}`} onClose={()=>{if(!alternativeBusy)setAlternatives(null)}}>
        <div className="alternatives-dialog">
          <p>Matches use generic, strength and dosage form with valid unexpired stock. Nothing is replaced automatically.</p>
          <dl><div><dt>Generic</dt><dd>{alternatives.source.genericName}</dd></div><div><dt>Strength</dt><dd>{alternatives.source.strength||'Not configured'}</dd></div><div><dt>Dosage form</dt><dd>{alternatives.source.dosageForm||'Not configured'}</dd></div></dl>
          {!alternatives.items.length&&<p>No eligible alternative currently has valid stock.</p>}
          <div className="alternative-list">{alternatives.items.map(product=>{
            const unit=product.units[0],expiry=product.batches.find(batch=>batch.expiry_date)?.expiry_date||'No expiry recorded';
            return <article key={product.id}>
              <div><strong>{product.name}</strong><small>{[product.manufacturer,product.strength,product.dosageForm].filter(Boolean).join(' · ')}</small><small>{product.sellableBaseQuantity} {product.baseUnit} available · Nearest expiry {expiry}</small>
              {(product.prescriptionRequired||product.controlledMedicine)&&<span className="warning">{product.controlledMedicine?'Controlled medicine warning':'Prescription-required warning'}</span>}</div>
              <div><strong>{unit?.selling_price_minor==null?'Price not configured':`PKR ${money(unit.selling_price_minor)} / ${unit.unit_name}`}</strong><button className="primary" disabled={alternativeBusy||!unit||unit.selling_price_minor==null} onClick={()=>void addAlternative(product)}>Add alternative</button></div>
            </article>;
          })}</div>
        </div>
      </Dialog>}
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
      {showAddCustomer&&<AddCustomer onClose={()=>setShowAddCustomer(false)} onSaved={c=>{setCustomers(old=>[...old.filter(x=>x.id!==c.id),c]);setCustomer(c.id)}}/>}
      {showHeld && (
        <Dialog title="Held sales" onClose={() => setShowHeld(false)}>
          {held.map((h, i) => (
            <button
              className="held-row"
              key={h.key}
              disabled={lines.length > 0}
              onClick={async () => {
                try {
                const refreshed=await Promise.all(h.lines.map(async line=>{
                  const product=line.product.barcode?await window.pharmacy.barcode({barcode:line.product.barcode}):(await window.pharmacy.search({q:line.product.name})).find(p=>p.id===line.product.id);
                  if(!product)throw Error('A held product is no longer available. Review its product record.');
                  return {...line,product,unitPrice:line.unitPrice??(unitPrice(product,line.unit)/100).toFixed(2),discountType:line.discountType||'fixed',discountValue:line.discountValue??'0'};
                }));
                setLines(refreshed);
                setCustomer(h.customer);
                setDiscount(h.discount);setDiscountType(h.discountType||'fixed');
                setMethod(h.method);
                setCreditMode(h.creditMode||'paid');setReceived(h.received||'0');setDueDate(h.dueDate||'');
                setKey(h.key);
                setHeld((old) => old.filter((_, j) => j !== i));
                setShowHeld(false);
                }catch(e){setError((e as Error).message);setShowHeld(false)}
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
                  <small>Rate {money(item.unitPriceMinor)}{item.unitPriceMinor!==item.originalUnitPriceMinor?` (original ${money(item.originalUnitPriceMinor)})`:''} · Line discount {money(item.lineDiscountMinor)} · GST {money(item.gstMinor)}</small>
                </span>
                <b>{money(item.lineTotalMinor)}</b>
              </p>
            ))}
            <h3>Total PKR {money(receipt.totals.finalTotalMinor)}</h3>
            <p>Line discounts PKR {money(receipt.totals.lineDiscountMinor)} · Invoice discount PKR {money(receipt.totals.invoiceDiscountMinor)}</p>
            <p>GST PKR {money(receipt.totals.gstMinor)} · Rounding PKR {money(receipt.totals.roundingMinor)}</p>
            <p>Received PKR {money(receipt.payment.amountPaidMinor)}</p>
            <p>Remaining credit PKR {money(receipt.payment.balanceDueMinor)}</p>
            {receipt.payment.balanceDueMinor>0&&<p>Due date: {receipt.payment.dueDate}</p>}
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
