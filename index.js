require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ======================
// ADMIN CODES
// ======================
const adminCodes = process.env.ADMIN_ACCESS_CODES.split(",");

// ======================
// MEMORY STORES
// ======================
const userState = {};
const warnings = {};

// ======================
// START COMMAND
// ======================
bot.start(async (ctx) => {
  if (ctx.chat.type !== "private") return;

  await ctx.sendChatAction("typing");

  setTimeout(() => {
    ctx.reply(
      `👋 Welcome to ATWOPAT Verification System\n\n` +
      `🔐 Features:\n` +
      `• Verify membership status\n` +
      `• View your details\n` +
      `• Join your state group (ACTIVE only)\n` +
      `• Contact support\n\n` +
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
bot.action("CHECK_STATUS", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.answerCbQuery();

  userState[ctx.from.id] = { step: "await_member_id" };
  ctx.reply("🔍 Enter your Member ID:");
});

bot.action("ADMIN_STATUS", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.answerCbQuery();

  userState[ctx.from.id] = { step: "await_admin_code" };
  ctx.reply("🔐 Enter Admin Access Code:");
});

bot.action("JOIN_GROUP", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.answerCbQuery();

  ctx.reply(
    "🌍 Only ACTIVE members can join groups.\n\nVerify your status first:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🔍 Check Status", "CHECK_STATUS")]
    ])
  );
});

bot.action("SUPPORT", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.answerCbQuery();

  userState[ctx.from.id] = { step: "support_message" };
  ctx.reply("💬 Send your message:");
});

// ======================
// PRIVATE CHAT HANDLER
// ======================
bot.on("text", async (ctx) => {
  if (ctx.chat.type !== "private") return;

  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const state = userState[userId];

  if (!state) return;

  await ctx.sendChatAction("typing");

  // ======================
  // CHECK STATUS
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
        `📌 *MEMBER DETAILS*\n\n` +
        `👤 Name: ${data.name}\n` +
        `🧑‍💼 Role: ${data.role}\n` +
        `🌍 State: ${data.state}\n` +
        `📊 Status: ${data.statusValue}\n` +
        `📅 Joined: ${data.joinDate}\n` +
        `⏳ Expiry: ${data.expiryDate}`;

      // Expiry check
      if (data.expiryDate !== "Permanent") {
        const today = new Date();
        const expiry = new Date(data.expiryDate);

        if (expiry < today) {
          msg += `\n\n⚠️ Membership expired`;
        }
      }

      // Active logic
      if (data.statusValue === "Active") {
        msg += `\n\n✅ ACTIVE MEMBER\nJoin your group:\n${data.groupLink || "Contact admin"}`;
      } else {
        msg += `\n\n⚠️ Not active`;
      }

      // Send passport image if available
      if (data.passport) {
        await ctx.replyWithPhoto(data.passport, {
          caption: msg,
          parse_mode: "Markdown"
        });
      } else {
        await ctx.reply(msg, { parse_mode: "Markdown" });
      }

    } catch (err) {
      delete userState[userId];
      ctx.reply("❌ Error connecting to database.");
    }
  }

  // ======================
  // ADMIN LOGIN
  // ======================
  if (state.step === "await_admin_code") {
    if (!adminCodes.includes(text)) {
      delete userState[userId];
      return ctx.reply("❌ Invalid admin code.");
    }

    userState[userId] = {
      step: "admin_member_id",
      adminCode: text
    };

    return ctx.reply("🔐 Access granted.\nSend Member ID:");
  }

  // ADMIN MEMBER ID
  if (state.step === "admin_member_id") {
    userState[userId] = {
      step: "admin_new_status",
      memberId: text,
      adminCode: state.adminCode
    };

    return ctx.reply("Enter new status:\nActive / Pending / Suspended / Rejected");
  }

  // ADMIN UPDATE
  if (state.step === "admin_new_status") {
    try {
      const res = await axios.get(
        process.env.SHEET_API_URL +
        `?update=true&id=${state.memberId}&status=${text}&code=${state.adminCode}`
      );

      delete userState[userId];

      if (res.data.success) {
        return ctx.reply(
          `✅ Updated successfully\n\nMember: ${state.memberId}\nNew Status: ${text}\nBy: ${res.data.admin}`
        );
      } else {
        return ctx.reply("❌ Update failed.");
      }

    } catch (err) {
      delete userState[userId];
      ctx.reply("❌ Error updating member.");
    }
  }

  // ======================
  // SUPPORT
  // ======================
  if (state.step === "support_message") {
    delete userState[userId];

    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `📩 SUPPORT MESSAGE\n\nFrom: @${ctx.from.username || "user"}\n\n${text}`
    );

    return ctx.reply("✅ Message sent.");
  }
});

// ======================
// GROUP: WELCOME
// ======================
bot.on("new_chat_members", (ctx) => {
  const user = ctx.message.new_chat_members[0];

  ctx.reply(
    `@${user.username || user.first_name} You're official welcome into Atwopat Nigeria.\n\n` +
    `📜 Rules:\n` +
    `• No ads\n` +
    `• No links\n` +
    `• Be respectful\n\n` +
    `⚠️ Violators will be removed`
  );
});

// ======================
// GROUP: MODERATION
// ======================
bot.on("message", async (ctx) => {
  if (!ctx.message.text) return;
  if (ctx.chat.type === "private") return;

  const text = ctx.message.text.toLowerCase();
  const userId = ctx.from.id;

  if (text.includes("http") || text.includes("t.me")) {
    try {
      await ctx.deleteMessage();

      if (!warnings[userId]) warnings[userId] = 0;
      warnings[userId]++;

      await ctx.reply(
        `⚠️ @${ctx.from.username || ctx.from.first_name}\nWarning ${warnings[userId]}/3\nLinks not allowed`
      );

      if (warnings[userId] >= 3) {
        await ctx.banChatMember(userId);

        await ctx.reply(
          `🚫 @${ctx.from.username || ctx.from.first_name} removed for repeated violations`
        );

        delete warnings[userId];
        return;
      }

      await ctx.restrictChatMember(userId, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + 300
      });

    } catch (err) {
      console.log("Moderation error:", err);
    }
  }
});

// ======================
// START BOT
// ======================
bot.launch();
console.log("🚀 ATWOPAT Bot running...");