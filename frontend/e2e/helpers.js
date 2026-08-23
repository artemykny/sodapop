import { expect } from "@playwright/test";

export function uniqueRoom(label) {
  return `${label} ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`;
}

export async function createRoom(page, {
  roomName,
  hostName = "Host",
  password = "room-secret",
  rounds = "1",
  packName = "Classic mix",
} = {}) {
  await page.goto("/");
  await page.getByLabel("Your name").fill(hostName);
  await page.getByLabel("Room name").fill(roomName);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await expect(page.getByRole("radio", { name: packName })).toBeVisible();
  await page.getByRole("radio", { name: packName }).check();
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
