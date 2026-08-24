import { expect } from "@playwright/test";
import { adminPassword } from "./constants.js";

export const testPack = {
  id: "e2e-pack",
  name: "E2E pack",
  description: "Created by the browser test suite",
  questions: [
    { real: "What is the best pizza topping?", fake: "What is the worst pizza topping?" },
    { real: "Where would you go for a perfect weekend?", fake: "Where would you never spend a weekend?" },
  ],
};

export async function ensureTestPack(request) {
  const response = await request.put(`http://127.0.0.1:18080/v1/admin/question-packs/${testPack.id}`, {
    headers: { Authorization: `Bearer ${adminPassword}` },
    data: testPack,
  });
  expect(response.ok()).toBeTruthy();
}

export function uniqueRoom(label) {
  return `${label} ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`;
}

export async function createRoom(page, {
  roomName,
  hostName = "Host",
  password = "room-secret",
  rounds = "1",
  packName = testPack.name,
} = {}) {
  await ensureTestPack(page.request);
  await page.goto("/");
  await page.getByLabel("Your name").fill(hostName);
  await page.getByLabel("Room name").fill(roomName);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  const packOption = page.locator("label.pack-browser-option").filter({ has: page.getByText(packName, { exact: true }) });
  await expect(packOption.getByRole("radio")).toBeVisible();
  await packOption.getByRole("radio").check();
  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.getByLabel("Rounds").fill(rounds);
  await page.getByLabel("Room password").fill(password);
  await page.getByRole("button", { name: "Review room" }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: "The room is open" })).toBeVisible();
}

export async function joinRoom(page, {
  roomName,
  displayName,
  password = "room-secret",
} = {}) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Join a room" }).click();
  await page.getByLabel("Room name").fill(roomName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue to name" }).click();
  await page.getByLabel("Your display name").fill(displayName);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("heading", { name: "The room is open" })).toBeVisible();
}

export function suspect(page, displayName) {
  return page.locator(".suspect-card").filter({ hasText: displayName });
}
