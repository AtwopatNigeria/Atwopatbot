require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ======================
// ADMIN CODES
// ======================
const adminCodes = process.env.ADMIN_ACCESS_CODES.split(",");

// ======================
// USER SESSION STORE
// ======================
const userState = {};

// ======================
// START COMMAND
// ======================
bot.start(async (ctx) => {
  await ctx.sendChatAction("typing");

  setTimeout(() => {
    ctx.reply(
      `👋 Welcome to ATWOPAT Verification System\n\n` +
      `🔐 What you can do here:\n` +
      `• Check your membership status\n` +
      `• Access your profile details\n` +
      `• Join your state group (ACTIVE only)\n` +
      `• Contact support anytime\n\n` +
      `Select an option below 👇`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🔍 Check Status", "CHECK_STATUS")],
        [Markup.button.callback("🛠 Change Status (Admin)", "ADMIN_STATUS")],
        [Markup.button.callback("🌍 Join State Group", "JOIN_GROUP")],
        [Markup.button.callback("💬 Contact Support", "SUPPORT")]
      ])
    );
  }, 3000);
});

// ======================
// BUTTON ACTIONS
// ======================

// CHECK STATUS
bot.action("CHECK_STATUS", async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { step: "await_member_id" };
  ctx.reply("🔍 Send your Member ID to check your status:");
});

// ADMIN FLOW
bot.action("ADMIN_STATUS", async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { step: "await_admin_code" };
  ctx.reply("🔐 Enter Admin Access Code:");
});

// JOIN GROUP
bot.action("JOIN_GROUP", async (ctx) => {
  await ctx.answerCbQuery();

  ctx.reply(
    "🌍 To join your state group:\n\n" +
    "✔ First verify your status\n" +
    "✔ Only ACTIVE members can join groups\n\n" +
    "Tap below to continue:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🔍 Check Status", "CHECK_STATUS")]
    ])
  );
});

// SUPPORT
bot.action("SUPPORT", async (ctx) => {
  await ctx.answerCbQuery();

  userState[ctx.from.id] = { step: "support_message" };

  ctx.reply("💬 Type your message to support. It will be forwarded to admin.");
});

// ======================
// TEXT HANDLER (STATE MACHINE)
// ======================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = userState[userId];

  if (!state) return;

  await ctx.sendChatAction("typing");

  // ======================
  // CHECK STATUS FLOW
  // ======================
  if (state.step === "await_member_id") {
    try {
      const res = await axios.get(process.env.SHEET_API_URL + "?id=" + text);
      const data = res.data;

      delete userState[userId];

      if (data.status === "not_found") {
        return ctx.reply("❌ Member ID not found.");
      }

      let msg =
        `📌 MEMBER DETAILS\n\n` +
        `Name: ${data.name}\n` +
        `Role: ${data.role}\n` +
        `State: ${data.state}\n` +
        `Status: ${data.statusValue}`;

      if (data.statusValue === "Active") {
        msg += `\n\n✅ You are ACTIVE\nYou can join your state group.`;
      } else {
        msg += `\n\n⚠️ You are NOT ACTIVE yet.`;
      }

      return ctx.reply(msg);
    } catch (err) {
      delete userState[userId];
      return ctx.reply("❌ Error connecting to database.");
    }
  }

  // ======================
  // ADMIN AUTH FLOW
  // ======================
  if (state.step === "await_admin_code") {
    if (!adminCodes.includes(text)) {
      delete userState[userId];
      return ctx.reply("❌ Invalid admin access code.");
    }

    userState[userId] = { step: "admin_member_id" };
    return ctx.reply("🔐 Access granted.\n\nSend Member ID:");
  }

  // ADMIN MEMBER ID
  if (state.step === "admin_member_id") {
    userState[userId] = {
      step: "admin_new_status",
      memberId: text
    };

    return ctx.reply("📌 Enter new status:\nActive / Pending / Suspended / Rejected");
  }

  // ADMIN UPDATE STATUS
  if (state.step === "admin_new_status") {
    try {
      const memberId = state.memberId;

      await axios.get(
        process.env.SHEET_API_URL +
        `?update=true&id=${memberId}&status=${text}&admin=${userId}`
      );

      delete userState[userId];

      return ctx.reply("✅ Member status updated successfully.");
    } catch (err) {
      delete userState[userId];
      return ctx.reply("❌ Failed to update member status.");
    }
  }

  // ======================
  // SUPPORT FLOW
  // ======================
  if (state.step === "support_message") {
    delete userState[userId];

    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `📩 SUPPORT MESSAGE\n\nFrom: ${ctx.from.username || ctx.from.id}\n\nMessage:\n${text}`
    );

    return ctx.reply("✅ Message sent to support team.");
  }
});

// ======================
// BOT START
// ======================
bot.launch();
console.log("🚀 ATWOPAT Bot is running...");