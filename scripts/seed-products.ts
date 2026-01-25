import Stripe from "stripe";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found");
  }

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", "development");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: xReplitToken,
    },
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.secret) {
    throw new Error("Stripe connection not found");
  }

  return connectionSettings.settings.secret;
}

async function main() {
  console.log("Getting Stripe credentials...");
  const secretKey = await getCredentials();

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });

  console.log("Checking for existing products...");
  const existingProducts = await stripe.products.search({
    query: "name:'DocuWhisper Professional'",
  });

  if (existingProducts.data.length > 0) {
    console.log("DocuWhisper Professional product already exists:");
    console.log("Product ID:", existingProducts.data[0].id);

    const prices = await stripe.prices.list({
      product: existingProducts.data[0].id,
      active: true,
    });

    if (prices.data.length > 0) {
      console.log("Price ID:", prices.data[0].id);
      console.log("Price:", prices.data[0].unit_amount! / 100, prices.data[0].currency.toUpperCase());
    }
    return;
  }

  console.log("Creating DocuWhisper Professional product...");
  const product = await stripe.products.create({
    name: "DocuWhisper Professional",
    description: "AI-powered medical scribing - unlimited voice recordings, SOAP notes, and cloud storage",
    metadata: {
      app: "docuwhisper",
      tier: "professional",
    },
  });

  console.log("Product created:", product.id);

  console.log("Creating monthly price ($25/month)...");
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 2500,
    currency: "usd",
    recurring: { interval: "month" },
  });

  console.log("Price created:", price.id);
  console.log("\nSetup complete!");
  console.log("Product ID:", product.id);
  console.log("Price ID:", price.id);
}

main().catch(console.error);
