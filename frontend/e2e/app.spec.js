import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, suspect, uniqueRoom } from "./helpers.js";

test("loads backend-owned pack metadata and creates a room", async ({ page, request }) => {
  const catalogResponse = await request.get("http://127.0.0.1:18080/v1/question-packs");
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  expect(catalog.packs).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "classic", name: "Classic mix", question_count: 10 }),
    expect.objectContaining({ id: "after_dark", name: "After hours", question_count: 10 }),
  ]));
  for (const pack of catalog.packs) expect(pack).not.toHaveProperty("questions");

  const roomName = uniqueRoom("Catalog");
  await createRoom(page, { roomName });
  await expect(page.getByText(roomName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 rounds", { exact: true }).first()).toBeVisible();
});

test("accepts custom questions as write-only room input", async ({ page }) => {
  const roomName = uniqueRoom("Custom pack");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Classic mix" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "custom-questions.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([
      { real: "Custom real question?", fake: "Custom fake question?" },
    ])),
  });
  await expect(page.getByRole("button", { name: /1 custom pairs/ })).toBeVisible();
  await page.getByLabel("Room name").fill(roomName);
  await page.getByLabel("Your name").fill("Uploader");
  await page.getByLabel("Rounds").fill("1");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: "The room is open" })).toBeVisible();

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("skewa-session-v1")));
  expect(session.state).not.toHaveProperty("questions");
  expect(JSON.stringify(session.state)).not.toContain("Custom fake question?");
});

test("invite link pre-fills the room and rejects a wrong password", async ({ browser, page }, testInfo) => {
  const roomName = uniqueRoom("Invite");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await createRoom(page, { roomName, password: "correct horse" });
  await page.getByRole("button", { name: /Copy invite link/ }).click();
  const invite = await page.evaluate(() => navigator.clipboard.readText());
  expect(invite).toContain("roomId=");

  const guestContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const guest = await guestContext.newPage();
  try {
    await guest.goto(invite);
    await expect(guest.getByRole("tab", { name: "Join a room" })).toHaveAttribute("aria-selected", "true");
    await expect(guest.getByLabel("Room name")).toHaveValue(roomName);
    await guest.getByLabel("Your display name").fill("Guest");
    await guest.getByLabel("Password").fill("wrong password");
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByRole("alert")).toContainText("invalid room password");

    await guest.getByLabel("Password").fill("correct horse");
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByRole("heading", { name: "The room is open" })).toBeVisible();
    await expect(page.getByText("2 / 8 players", { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test("three players complete a round and reach final scores", async ({ browser, page }, testInfo) => {
  const roomName = uniqueRoom("Full game");
  const baseURL = testInfo.project.use.baseURL;
  const bobContext = await browser.newContext({ baseURL });
  const chandraContext = await browser.newContext({ baseURL });
  const bob = await bobContext.newPage();
  const chandra = await chandraContext.newPage();

  try {
    await createRoom(page, { roomName, password: "secret", rounds: "1" });
    await joinRoom(bob, { roomName, displayName: "Bob", password: "secret" });
    await joinRoom(chandra, { roomName, displayName: "Chandra", password: "secret" });

    await expect(page.getByText("3 / 8 players", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Start the game/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Answer in secret" })).toBeVisible()
    )));

    const prompts = await Promise.all([page, bob, chandra].map((playerPage) => (
      playerPage.locator(".answer-card h2").textContent()
    )));
    expect(new Set(prompts).size).toBe(2);

    await bob.reload();
    await expect(bob.getByRole("heading", { name: "Answer in secret" })).toBeVisible();
    await expect(bob.locator(".answer-card h2")).toHaveText(prompts[1]);

    for (const [playerPage, answer] of [[page, "Host answer"], [bob, "Bob answer"], [chandra, "Chandra answer"]]) {
      await playerPage.getByLabel("Your answer").fill(answer);
      await playerPage.getByRole("button", { name: /Lock answer/ }).click();
    }
    await Promise.all([page, bob, chandra].map(async (playerPage) => {
      await expect(playerPage.getByRole("heading", { name: "Who got a different question?" })).toBeVisible();
      await expect(playerPage.locator(".revealed-answer")).toHaveCount(3);
    }));

    await page.getByRole("button", { name: /Start the vote/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Point the finger" })).toBeVisible()
    )));

    await suspect(page, "Bob").click();
    await page.getByRole("button", { name: /Lock accusation/ }).click();
    await suspect(bob, "Host").click();
    await bob.getByRole("button", { name: /Lock accusation/ }).click();
    await suspect(chandra, "Host").click();
    await chandra.getByRole("button", { name: /Lock accusation/ }).click();

    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Round revealed" })).toBeVisible()
    )));
    await expect(page.locator(".vote-row")).toHaveCount(3);

    await page.getByRole("button", { name: /See final scores/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Final scores" })).toBeVisible()
    )));
    await expect(page.locator(".final-ranking > div")).toHaveCount(3);
  } finally {
    await bobContext.close();
    await chandraContext.close();
  }
});
