/**
 * Local end-to-end simulation against a running server.
 *
 * Usage:
 *   npm run dev
 *   NPS_DELAY_MS=3000 npm run simulate
 */
const baseUrl =
  process.env.BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "http://173.242.59.183:3000";
const apiKey = process.env.TEST_API_KEY ?? "dev-test-key";

async function main() {
  const simulateRes = await fetch(`${baseUrl}/admin/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      orderId: process.env.ORDER_ID ?? String(Date.now()),
      status: process.env.STATUS ?? "Доставлено",
      phone: process.env.PHONE ?? "+380501112233",
      firstName: "Тест",
      lastName: "NPS",
    }),
  });

  const simulateJson = await simulateRes.json();
  console.log("simulate:", simulateJson);

  const delayMs = Number(process.env.NPS_DELAY_MS ?? 3000);
  console.log(`waiting ${delayMs + 500}ms for due job...`);
  await new Promise((resolve) => setTimeout(resolve, delayMs + 500));

  const processRes = await fetch(`${baseUrl}/admin/process-due`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });
  console.log("process-due:", await processRes.json());

  const jobsRes = await fetch(`${baseUrl}/admin/jobs`, {
    headers: { "x-api-key": apiKey },
  });
  console.log("jobs:", JSON.stringify(await jobsRes.json(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
