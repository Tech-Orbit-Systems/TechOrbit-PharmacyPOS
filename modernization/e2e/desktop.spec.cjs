const { test, expect, _electron } = require("@playwright/test");
const path = require("path"),
  fs = require("fs"),
  os = require("os");
test("approved screens: ranges, Digital, holds, posting and identical dark geometry", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-ui-e2e-"));
  const env = { ...process.env, TECHORBIT_UI_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TECHORBIT_UI_DATABASE;
  const app = await _electron.launch({
    executablePath: require("../../node_modules/electron"),
    args: [path.resolve(__dirname, "../desktop/main.cjs")],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Username", { exact: true }).fill("demo");
    await page
      .getByLabel("Password", { exact: true })
      .fill("TechOrbit-Demo-2026!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Loading sales…")).toHaveCount(0);
    await expect(page.getByRole('status', {name:'Shift open', exact:true})).toBeVisible();
    for (const label of ["1 Month", "6 Months", "1 Year", "7 Days"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByLabel("Net sales chart")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByRole("button", { name: "6 Months", exact: true }).click();
    await expect(page.getByLabel("Net sales chart")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    fs.mkdirSync(path.resolve(__dirname, "../evidence"), { recursive: true });
    await page.screenshot({
      path: path.resolve(__dirname, "../evidence/dashboard-light.png"),
    });
    await page
      .getByRole("button", { name: "Point of Sale", exact: true })
      .click();
    const search = page.getByLabel("Scan barcode or search medicine");
    await expect(page.getByRole('status', {name:'Shift open', exact:true})).toBeVisible();
    await search.fill("0012345678901");
    await search.press("Enter");
    await expect(page.getByLabel("Quantity line 1")).toHaveValue("1");
    await page.getByLabel("Increase line 1").click();
    await page.getByRole("button", { name: "Digital", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Pay & Print/ }),
    ).toBeEnabled();
    await expect(
      page.getByText("Online payment details", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Transaction reference")).toHaveCount(0);
    const geometry = async () =>
      Promise.all(
        ["invoice", "finder", "payment-bar"].map((id) =>
          page.getByTestId(id).boundingBox(),
        ),
      );
    const light = await geometry();
    await page.screenshot({
      path: path.resolve(__dirname, "../evidence/pos-light.png"),
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page
      .getByRole("button", { name: "Point of Sale", exact: true })
      .click();
    expect(await geometry()).toEqual(light);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: path.resolve(__dirname, "../evidence/pos-dark.png"),
    });
    await page.getByRole("button", { name: /Hold sale/ }).click();
    await page
      .getByRole("button", { name: "Held sales (1)", exact: true })
      .click();
    await page.getByRole("button", { name: /Resume sale 1/ }).click();
    await expect(page.getByLabel("Quantity line 1")).toHaveValue("2");
    await expect(
      page.getByRole("button", { name: /Pay & Print/ }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /Pay & Print/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Sale completed" }),
    ).toBeVisible();
    await expect(
      page.getByText("Total PKR 240", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByText("Ready for your next sale")).toBeVisible();
    await page.getByRole('button',{name:'Add customer',exact:true}).click();
    await page.getByLabel('Customer name',{exact:true}).fill('UI Credit Customer');
    await page.getByLabel('Phone number',{exact:true}).fill('03019876543');
    await page.getByRole('button',{name:'Save customer',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Add customer',exact:true})).toHaveCount(0);
    await expect(page.getByLabel('Customer',{exact:true}).locator('option:checked')).toHaveText(/UI Credit Customer/);
    await search.fill('0012345678901'); await search.press('Enter');
    await page.getByLabel('Unit line 1',{exact:true}).selectOption('tablet');
    await expect(page.getByLabel('Unit line 1',{exact:true})).toHaveValue('tablet');
    await page.getByLabel('Unit line 1',{exact:true}).selectOption('box');
    await page.getByLabel('Payment type',{exact:true}).selectOption('partial');
    await page.getByLabel('Received now PKR',{exact:true}).fill('200');
    await page.getByLabel('Credit due date',{exact:true}).fill('2099-12-31');
    await page.getByRole('button',{name:'Digital',exact:true}).click();
    await expect(page.locator('.credit-due strong')).toHaveText('1,000');
    await page.screenshot({path:path.resolve(__dirname,'../evidence/pos-partial-credit.png')});
    await page.getByRole('button',{name:/Pay & Print/}).click();
    await expect(page.getByText('Received PKR 200',{exact:true})).toBeVisible();
    await expect(page.getByText('Remaining credit PKR 1,000',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close dialog'}).click();
    await search.fill('0012345678903'); await search.press('Enter');
    await page.getByLabel('Unit line 1',{exact:true}).selectOption('pack');
    await page.getByLabel('Payment type',{exact:true}).selectOption('credit');
    await expect(page.getByRole('button',{name:/Pay & Print/})).toBeDisabled();
    await page.getByLabel('Customer',{exact:true}).selectOption({label:'UI Credit Customer'});
    await page.getByLabel('Credit due date',{exact:true}).fill('2099-12-31');
    await expect(page.locator('.credit-due strong')).toHaveText('500');
    await expect(page.getByRole('button',{name:'Cash',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:/Pay & Print/}).click();
    await expect(page.getByText('Received PKR 0',{exact:true})).toBeVisible();
    await expect(page.getByText('Remaining credit PKR 500',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByLabel("Net sales chart")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.screenshot({
      path: path.resolve(__dirname, "../evidence/dashboard-dark.png"),
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
