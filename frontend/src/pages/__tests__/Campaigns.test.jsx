import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the shared axios instance, sonner toasts, and phosphor icons so the
// page renders in jsdom without network or icon-font dependencies.
jest.mock("../../lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  API_BASE: "",
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@phosphor-icons/react", () => new Proxy({}, { get: () => () => null }));

import { api } from "../../lib/api";
import Campaigns from "../Campaigns";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Campaigns />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows the empty state when there are no campaigns", async () => {
  api.get.mockResolvedValue({ data: [] });
  renderPage();
  expect(await screen.findByTestId("campaigns-empty")).toBeInTheDocument();
});

test("renders a Sync from Meta control", async () => {
  api.get.mockResolvedValue({ data: [] });
  renderPage();
  expect(await screen.findByTestId("campaigns-sync")).toBeInTheDocument();
});

test("renders campaign rows returned by the API", async () => {
  api.get.mockResolvedValue({
    data: [
      {
        id: "c1",
        name: "Bengaluru Centre",
        status: "ACTIVE",
        objective: "LINK_CLICKS",
        is_configured: true,
        monitored_posts_count: 2,
      },
    ],
  });
  renderPage();
  expect(await screen.findByText("Bengaluru Centre")).toBeInTheDocument();
});
