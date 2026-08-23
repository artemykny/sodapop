import { expect, test } from "@playwright/test";
import { adminPassword } from "./constants.js";
import { createRoom, joinRoom, suspect, uniqueRoom } from "./helpers.js";

test("loads backend-owned pack metadata and creates a room", async ({ page, request }) => {
  await page.goto("/");
  const bodyFont = await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily);
  expect(bodyFont).toContain("Nunito Sans Variable");

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

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("may not be able to rejoin");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Leave room" }).click();
  await expect(page.getByRole("heading", { name: "The room is open" })).toBeVisible();
});

test("admin dashboard rejects a wrong password and aggregates game information", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();

  await page.getByLabel("Admin password").fill("wrong-password");
  await page.getByRole("button", { name: "Open dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText("admin password is invalid");

  await page.getByLabel("Admin password").fill(adminPassword);
  await page.getByRole("button", { name: "Open dashboard" }).click();
  await expect(page.getByRole("heading", { name: "General overview" })).toBeVisible();
  await page.getByRole("button", { name: /Odd One Out/ }).click();
  await expect(page.getByRole("heading", { name: "Odd One Out" })).toBeVisible();
  await expect(page.getByText("Classic mix", { exact: true })).toBeVisible();
  await expect(page.getByText("After hours", { exact: true })).toBeVisible();
  await expect(page.getByText("What is the best pizza topping?", { exact: true })).toBeHidden();
  await page.locator(".admin-pack-list > li").filter({ hasText: "Classic mix" }).getByRole("button", { name: "Open pack" }).click();
  await expect(page.getByRole("dialog", { name: "Classic mix" })).toBeVisible();
  await expect(page.getByText("What is the best pizza topping?", { exact: true })).toBeVisible();
  await expect(page.getByText("What is the worst pizza topping?", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Classic mix" })).toBeHidden();
  await page.getByRole("button", { name: /General/ }).click();
  await expect(page.getByText("oddoneout", { exact: true })).toBeVisible();
});

test("room name autocomplete finds joinable rooms after a partial match", async ({ browser, page }, testInfo) => {
  const roomName = uniqueRoom("Autocomplete");
  await createRoom(page, { roomName });

  const guestContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const guest = await guestContext.newPage();
  try {
    await guest.goto("/");
    await guest.getByRole("tab", { name: "Join a room" }).click();
    await guest.getByLabel("Room name").fill("Auto");
    const suggestion = guest.locator("#joinable-room-suggestions option").filter({ hasText: "Odd One Out" });
    await expect(suggestion).toHaveAttribute("value", roomName);

    await guest.getByLabel("Room name").fill(roomName);
    await guest.getByLabel("Your display name").fill("Autocomplete Guest");
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByRole("heading", { name: "The room is open" })).toBeVisible();
  } finally {
    await guestContext.close();
  }
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

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sodapop-session-v1")));
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
  expect(invite).not.toContain("server=");

  const tamperedInvite = new URL(invite);
  tamperedInvite.searchParams.set("server", "http://127.0.0.1:1");

  const guestContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const guest = await guestContext.newPage();
  try {
    await guest.goto(tamperedInvite.toString());
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
    await expect(bob.getByRole("button", { name: "Host controls", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Host controls" })).toBeVisible();
    await page.getByLabel("Player limit").fill("9");
    await page.getByLabel("Answer time (seconds)").fill("90");
    await page.getByLabel("Discussion time (seconds)").fill("150");
    await page.getByLabel("Voting time (seconds)").fill("60");
    await page.getByRole("button", { name: /Save settings/ }).click();
    await expect(page.getByRole("dialog", { name: "Host controls" })).toBeHidden();
    await expect(page.getByText("3 / 9 players", { exact: true })).toBeVisible();
    await expect(page.locator(".players-panel .panel-settings")).toHaveCount(0);
    await expect(bob.getByText("90s answers", { exact: true })).toBeVisible();
    await expect(chandra.getByText("150s debate", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Start the game/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Answer in secret" })).toBeVisible()
    )));

    const timerBeforeSettings = Number((await page.locator(".timer").getAttribute("aria-label")).match(/^\d+/)[0]);
    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await expect(page.getByText("The current countdown will keep running.")).toBeVisible();
    await page.getByLabel("Answer time (seconds)").fill("120");
    await page.getByRole("button", { name: /Save settings/ }).click();
    await expect(page.getByRole("dialog", { name: "Host controls" })).toBeHidden();
    await bob.locator(".timer").hover();
    await expect(bob.getByRole("tooltip", { name: /Game settings/ })).toBeVisible();
    await expect(bob.getByRole("tooltip")).toContainText("120s");
    const timerAfterSettings = Number((await page.locator(".timer").getAttribute("aria-label")).match(/^\d+/)[0]);
    expect(timerAfterSettings).toBeLessThanOrEqual(timerBeforeSettings);

    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await page.getByRole("button", { name: "Pause timer" }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("alert")).toContainText("Game paused")
    )));
    await expect(page.locator(".game-paused-banner")).toHaveCount(0);
    const pausedTimerLabel = await page.locator(".timer").getAttribute("aria-label");
    expect(pausedTimerLabel).toMatch(/^Paused with \d+ seconds remaining$/);
    await page.waitForTimeout(1_100);
    await expect(page.locator(".timer")).toHaveAttribute("aria-label", pausedTimerLabel);

    const prompts = await Promise.all([page, bob, chandra].map((playerPage) => (
      playerPage.locator(".answer-card h2").textContent()
    )));
    expect(new Set(prompts).size).toBe(2);

    await bob.reload();
    await expect(bob.getByRole("heading", { name: "Answer in secret" })).toBeVisible();
    await expect(bob.locator(".answer-card h2")).toHaveText(prompts[1]);
    await expect(bob.locator(".timer")).toHaveAttribute("aria-label", pausedTimerLabel);

    await page.getByLabel("Your answer").fill("Host answer");
    await page.getByRole("button", { name: /Lock answer/ }).click();
    await expect(page.getByRole("heading", { name: "Answer locked" })).toBeVisible();
    await expect(page.locator(".locked-choice")).toContainText("Host answer");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Answer locked" })).toBeVisible();
    await expect(page.locator(".locked-choice")).toContainText("Host answer");
    await page.getByRole("button", { name: "Edit answer" }).click();
    await expect(page.getByLabel("Your answer")).toHaveValue("Host answer");
    await page.getByLabel("Your answer").fill("Revised host answer");
    await page.getByRole("button", { name: /Lock answer/ }).click();

    for (const [playerPage, answer] of [[bob, "Bob answer"], [chandra, "Chandra answer"]]) {
      await playerPage.getByLabel("Your answer").fill(answer);
      await playerPage.getByRole("button", { name: /Lock answer/ }).click();
    }
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Answer locked" })).toBeVisible()
    )));
    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await expect(page.getByText("Players can still edit and submit answers or votes while paused.")).toBeVisible();
    await page.getByRole("button", { name: "Resume timer" }).click();
    await Promise.all([page, bob, chandra].map(async (playerPage) => {
      await expect(playerPage.getByRole("heading", { name: "Who got a different question?" })).toBeVisible();
      await expect(playerPage.locator(".revealed-answer")).toHaveCount(3);
    }));

    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await page.getByRole("button", { name: /Start voting/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Point the finger" })).toBeVisible()
    )));

    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await page.getByRole("button", { name: "Pause timer" }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("alert")).toContainText("Game paused")
    )));

    await suspect(page, "Bob").click();
    await page.getByRole("button", { name: /Lock accusation/ }).click();
    await expect(page.getByRole("heading", { name: "Vote locked" })).toBeVisible();
    await expect(page.locator(".locked-choice")).toContainText("Bob");
    await page.getByRole("button", { name: "Change vote" }).click();
    await expect(suspect(page, "Bob")).toHaveAttribute("aria-pressed", "true");
    await suspect(page, "Chandra").click();
    await page.getByRole("button", { name: /Lock accusation/ }).click();
    await suspect(bob, "Host").click();
    await bob.getByRole("button", { name: /Lock accusation/ }).click();
    await suspect(chandra, "Host").click();
    await chandra.getByRole("button", { name: /Lock accusation/ }).click();

    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Vote locked" })).toBeVisible()
    )));
    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await page.getByRole("button", { name: "Resume timer" }).click();

    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Round revealed" })).toBeVisible()
    )));
    await expect(page.locator(".vote-row")).toHaveCount(3);

    await page.getByRole("button", { name: "Host controls", exact: true }).click();
    await page.getByRole("button", { name: /Show final scores/ }).click();
    await Promise.all([page, bob, chandra].map((playerPage) => (
      expect(playerPage.getByRole("heading", { name: "Final scores" })).toBeVisible()
    )));
    await expect(page.locator(".final-ranking > div")).toHaveCount(3);
  } finally {
    await bobContext.close();
    await chandraContext.close();
  }
});
