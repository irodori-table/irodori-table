import { expect, type Page, test } from "@playwright/test";

// Tauri IPC is absent in the browser harness, so `invoke` rejects and the app
// falls back to its mock snapshot. That is fine here: this spec covers building
// a lakehouse connection in the form, not opening one.
const ignorable = (message: string) => /tauri|invoke|__TAURI/i.test(message);

const icebergExtension = {
  id: "irodori.iceberg",
  name: "Iceberg Connector",
  version: "0.1.0-test",
  runtime: "native",
  engine: "iceberg",
  hostFeatures: [],
  sha256: "test",
  enabled: true,
  installedAt: "0",
  supportedCalls: ["connect"],
  connectionModel: {
    schemaVersion: 1,
    defaults: {
      engine: "iceberg",
      wire: "lakehouse",
      port: 443,
      readOnly: false,
    },
    endpoint: {
      modes: ["catalog", "connectionString"],
      defaultPort: 443,
      fields: [
        {
          id: "catalogUri",
          label: "Catalog URI",
          type: "uri",
          option: "catalogUri",
        },
        {
          id: "warehouse",
          label: "Warehouse path",
          type: "string",
          option: "warehouse",
        },
      ],
    },
    profileFields: [],
    authMethods: [
      { id: "none", label: "No authentication", kind: "none", fields: [] },
      {
        id: "connectionString",
        label: "Connection string / DSN",
        kind: "connectionString",
        fields: [
          {
            id: "url",
            label: "Connection URL or DSN",
            type: "uri",
            profileField: "url",
            required: true,
          },
        ],
      },
      {
        id: "oauth2",
        label: "OAuth 2.0",
        kind: "oauth2",
        fields: [
          {
            id: "oauth2ServerUri",
            label: "OAuth2 token endpoint",
            type: "uri",
            option: "oauth2ServerUri",
          },
          {
            id: "clientId",
            label: "OAuth2 client ID",
            type: "string",
            option: "oauth2ClientId",
          },
          {
            id: "clientSecret",
            label: "OAuth2 client secret",
            type: "secret",
            secretPurpose: "token",
          },
          {
            id: "scope",
            label: "OAuth2 scope",
            type: "string",
            option: "scope",
            default: "catalog",
          },
        ],
      },
    ],
    tls: { supported: false, modes: [], fields: [] },
    transports: ["direct"],
  },
};

async function openConnectionManager(page: Page) {
  await page.addInitScript((extension) => {
    const browserWindow = window as Window & {
      __TAURI_INTERNALS__?: {
        invoke: (command: string) => Promise<unknown>;
        transformCallback: () => number;
        unregisterCallback: () => void;
      };
    };
    browserWindow.__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === "ext_list") {
          return [extension];
        }
        throw new Error(`no browser mock for ${command}`);
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
  }, icebergExtension);
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "File" })
    .click();
  await page.getByRole("menuitem", { name: "Open Connection Manager" }).click();
  await expect(page.locator(".connection-dialog")).toBeVisible();
}

test("an Iceberg connection can be given catalog settings and credentials", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    if (!ignorable(error.message)) {
      failures.push(error.message);
    }
  });

  await openConnectionManager(page);
  await page.locator(".connection-picker-header .icon-button").first().click();

  const engine = page.locator(".connection-form select").first();
  await engine.selectOption("iceberg");

  // The installed extension model is the only source for these fields.
  const catalogUri = page.getByLabel("Catalog URI");
  const warehouse = page.getByLabel("Warehouse path");
  await expect(catalogUri).toBeVisible();
  await expect(warehouse).toBeVisible();

  await catalogUri.fill("https://catalog.example.com/v1");
  await warehouse.fill("s3://bucket/warehouse");

  const authenticationMethod = page.getByLabel("Authentication method");
  await expect(
    authenticationMethod.locator('option[value="connectionString"]'),
  ).toHaveCount(0);
  await authenticationMethod.selectOption("oauth2");
  const oauth2ServerUri = page.getByLabel("OAuth2 token endpoint");
  const oauth2ClientId = page.getByLabel("OAuth2 client ID");
  const oauth2ClientSecret = page.getByLabel(/^OAuth2 client secret/);
  const scope = page.getByLabel("OAuth2 scope");
  await expect(oauth2ServerUri).toBeVisible();
  await expect(oauth2ClientId).toBeVisible();
  await expect(scope).toHaveValue("catalog");

  await oauth2ServerUri.fill("https://catalog.example.com/v1/oauth/tokens");
  await oauth2ClientId.fill("workbench-client");
  await oauth2ClientSecret.fill("s3cr3t");
  await scope.fill("catalog");
  await expect(oauth2ClientSecret).toHaveAttribute("type", "password");
  const secretField = oauth2ClientSecret.locator("..");
  const secretTitle = secretField.locator(".connector-field-label > span");
  const sessionOnly = secretField.locator(".connector-field-label > small");
  await expect(sessionOnly).toContainText("Session only");
  expect(
    await secretTitle.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await sessionOnly.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page
    .locator(
      '.connection-form-body label:has(> span:text-is("Connection name")) input',
    )
    .fill("Sales lakehouse");

  await expect(catalogUri).toHaveValue("https://catalog.example.com/v1");
  await expect(warehouse).toHaveValue("s3://bucket/warehouse");
  await expect(oauth2ServerUri).toHaveValue(
    "https://catalog.example.com/v1/oauth/tokens",
  );
  await expect(oauth2ClientId).toHaveValue("workbench-client");
  await expect(oauth2ClientSecret).toHaveValue("s3cr3t");

  await page.locator(".connection-dialog").screenshot({
    path: "test-results/lakehouse-connection-form.png",
  });

  await page.setViewportSize({ width: 720, height: 900 });
  await expect(oauth2ClientSecret).toBeVisible();
  expect(
    await page
      .locator(".connection-form-body")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  expect(failures).toEqual([]);
});

test("engines without connector settings do not grow an empty section", async ({
  page,
}) => {
  await openConnectionManager(page);
  await page.locator(".connection-picker-header .icon-button").first().click();

  const engine = page.locator(".connection-form select").first();
  // SQLite is a local file — no transport, so not even the SSL fields every
  // sqlx-backed engine gained in #229.
  await engine.selectOption("sqlite");
  await expect(page.locator(".connector-options")).toHaveCount(0);

  await engine.selectOption("iceberg");
  await expect(page.locator(".connector-options")).toHaveCount(0);
  await expect(page.locator(".connector-declared-section")).toHaveCount(2);
});

test("sqlx-backed engines offer SSL controls in connector settings", async ({
  page,
}) => {
  await openConnectionManager(page);
  await page.locator(".connection-picker-header .icon-button").first().click();

  const engine = page.locator(".connection-form select").first();
  await engine.selectOption("postgres");

  const options = page.locator(".connector-options");
  await expect(options).toHaveCount(1);
  await expect(options.getByLabel("SSL mode")).toBeVisible();
  await expect(options.getByLabel("SSL root certificate")).toBeVisible();

  // Empty is the default, and it is what leaves sqlx at its own `prefer`, so a
  // profile saved without touching the field connects as it always did.
  await expect(options.getByLabel("SSL mode")).toHaveValue("");
  await options.getByLabel("SSL mode").selectOption("verify-full");
  await expect(options.getByLabel("SSL mode")).toHaveValue("verify-full");
});
