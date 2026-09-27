const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { openDatabase } = require("../../infrastructure/sqlite/database");
const { seedDemo } = require("../desktop/demo.cjs");
const { Gateway } = require("../desktop/gateway.cjs");
const bcrypt=require('bcrypt');
test('cost and profit report is denied to a cashier below the UI',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    const now=new Date().toISOString();
    db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,must_change_password,created_at,updated_at) SELECT 'report-cashier',?,'Report Cashier',id,0,?,? FROM Roles WHERE code='cashier'")
      .run(bcrypt.hashSync('Cashier-Report-2026!',10),now,now);
    const gateway=new Gateway(db);
    const user=await gateway.call('login',{username:'report-cashier',password:'Cashier-Report-2026!'});
    assert.equal(user.canViewProfit,false);
    await assert.rejects(gateway.call('reportProfitLoss',{range:'7d'}),/role does not allow/);
    await assert.rejects(gateway.call('reportEntries',{range:'7d',page:1}),/role does not allow/);
    await assert.rejects(gateway.call('reportExport',{range:'7d'}),/role does not allow/);
    const dash=await gateway.call('dashboard',{range:'7d'});
    assert.equal(dash.today.operatingProfit,null);
    assert.equal(dash.expiredValue,null);
  }finally{db.close()}
});
test("real SQLite read-only quote, digital sale, retry and dashboard", async () => {
  const db = openDatabase({ filename: ":memory:" });
  try {
    seedDemo(db);
    const gateway = new Gateway(db, { demo: true });
    await assert.rejects(gateway.call("dashboard"), /sign in/);
    await gateway.call("login", {
      username: "demo",
      password: "TechOrbit-Demo-2026!",
    });
    const activeShift = await gateway.call('shiftStatus');
    const shiftPreview = await gateway.call('closingShiftPreview',{shiftId:activeShift.id});
    assert.equal(shiftPreview.shiftId,activeShift.id);
    assert.equal(shiftPreview.unattributedCashCount,0);
    const periodPreview = await gateway.call('closingPeriodPreview',{});
    assert.ok(periodPreview.months.length>=1 && periodPreview.months.length<=6);
    const dayPreview = await gateway.call('closingDayPreview',{});
    assert.equal(dayPreview.status,'open');
    assert.equal(dayPreview.businessDayId,activeShift.business_day_id || db.prepare('SELECT business_day_id FROM CashShifts WHERE id=?').get(activeShift.id).business_day_id);
    assert.deepEqual(await gateway.call('closingConfig',{}).then(x=>x.policy),{varianceToleranceMinor:5000,sixMonthCycleStartMonth:1});
    const products = await gateway.call("barcode", {
      barcode: "0012345678901",
    });
    assert.equal(products.name, "Panadol 500 mg");
    const input = {
      key: "TO-12345678-1234-1234-1234-123456789abc",
      paymentMethod: "digital",
      warningAcknowledged: true,
      discountMinor: 0,
      items: [{ productId: products.id, saleUnit: "Strip", quantity: 2 }],
    };
    const before = db.prepare("SELECT COUNT(*) n FROM Sales").get().n;
    const stock = db
      .prepare("SELECT SUM(quantity_on_hand) n FROM ProductBatches")
      .get().n;
    const quote = await gateway.call("quote", input);
    assert.equal(quote.finalTotalMinor, 24000);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM Sales").get().n, before);
    assert.equal(
      db.prepare("SELECT SUM(quantity_on_hand) n FROM ProductBatches").get().n,
      stock,
    );
    const result = await gateway.call("post", input);
    assert.equal(result.payment.method, "digital");
    assert.equal(result.totals.finalTotalMinor, 24000);
    const retry = await gateway.call("post", input);
    assert.equal(retry.invoiceNumber, result.invoiceNumber);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM Sales").get().n,
      before + 1,
    );
    const dash = await gateway.call("dashboard", { range: "1y" });
    assert.equal(
      dash.chart.reduce((s, b) => s + b.amount, 0),
      dash.rangeTotal,
    );
    assert.ok(dash.balances);
    assert.equal(dash.chart.length, 13);
    await assert.rejects(
      gateway.call("post", { ...input, key: "x" }),
      /reference/,
    );
    await assert.rejects(
      gateway.call("post", { ...input, paymentMethod: "cash" }),
      /different details/,
    );
    assert.equal(
      db
        .prepare(
          "SELECT method FROM MoneyMovements WHERE reference_id=? AND reference_type='sale'",
        )
        .get(String(result.saleId)).method,
      "digital",
    );
    const beforeReturn = await gateway.call("dashboard", { range: "7d" });
    const {
      CustomerAccountsService,
    } = require("../../infrastructure/sqlite/services/customer-accounts");
    const item = db
      .prepare("SELECT id FROM SaleItems WHERE sale_id=?")
      .get(result.saleId);
    new CustomerAccountsService(db).returnSale({
      saleId: result.saleId,
      idempotencyKey: "TO-99999999-9999-9999-9999-999999999999",
      reason: "Test return",
      refundMinor: 12000,
      refundMethod: "digital",
      items: [{ saleItemId: item.id, baseQuantity: 1, restockable: false, conditionConfirmed: false }],
    });
    const afterReturn = await gateway.call("dashboard", { range: "7d" });
    assert.equal(beforeReturn.today.net - afterReturn.today.net, 12000);
    assert.equal(beforeReturn.rangeTotal - afterReturn.rangeTotal, 12000);
    await gateway.call("logout");
    await assert.rejects(gateway.call("search", { q: "Panadol" }), /sign in/);
  } finally {
    db.close();
  }
});
