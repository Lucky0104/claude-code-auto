import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  API_BASE: "",
}));
jest.mock("@phosphor-icons/react", () => new Proxy({}, { get: () => () => null }));

import { api } from "../../lib/api";
import Comments from "../Comments";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Comments />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: empty feed + empty campaign list (for filter options).
  api.get.mockImplementation((url) => {
    if (typeof url === "string" && url.includes("/campaigns/comment-logs")) {
      return Promise.resolve({ data: { items: [], count: 0 } });
    }
    return Promise.resolve({ data: [] });
  });
});

test("shows the empty state when there are no comment logs", async () => {
  renderPage();
  expect(await screen.findByTestId("comments-empty")).toBeInTheDocument();
});

test("renders the campaign and status filters", async () => {
  renderPage();
  expect(await screen.findByTestId("filter-campaign")).toBeInTheDocument();
  expect(screen.getByTestId("filter-status")).toBeInTheDocument();
});

test("renders comment-log rows from the feed", async () => {
  api.get.mockImplementation((url) => {
    if (typeof url === "string" && url.includes("/campaigns/comment-logs")) {
      return Promise.resolve({
        data: {
          items: [
            {
              comment_id: "ig-1",
              commenter_id: "user-42",
              comment_text: "Tell me about IVF",
              reply_sent: "Thank you for reaching out",
              status: "replied",
              replied_at: new Date().toISOString(),
              campaign_name: "Bengaluru",
              center_name: "Bengaluru",
            },
          ],
          count: 1,
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
  renderPage();
  expect(await screen.findByText(/Tell me about IVF/)).toBeInTheDocument();
});
