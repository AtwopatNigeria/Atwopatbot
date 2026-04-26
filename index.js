require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ======================
// ADMIN CODES
// ======================
const adminCodes = process.env.ADMIN_ACCESS_CODES.split(",");

// ======================
// MEMORY
// ======================
const userState = {};
const warnings = {};

// ======================
// START
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
      `• Join state group (ACTIVE only)\n` +
      `• Contact support`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🔍 Check Status", "CHECK_STATUS")],
        [Markup.button.callback("🛠 Change Status (Admin)", "ADMIN_STATUS")],
        [Markup.button.callback("🌍 Join State Group", "JOIN_GROUP")],
        [Markup.button.callback("💬 Contact Support", "SUPPORT")]
      ])
    );
  }, 2000);
});

// ======================
// BUTTONS
// ======================
bot.action("CHECK_STATUS", async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { step: "await_member_id" };
  ctx.reply("🔍 Enter your Member ID:");
});

bot.action("ADMIN_STATUS", async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { step: "await_admin_code" };

  ctx.reply(
    "🔐 Enter Admin Access Code:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🔐 Enter Admin Access Code", "ENTER_ADMIN_CODE")]
    ])
  );
});

// Admin code trigger button
bot.action("ENTER_ADMIN_CODE", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("🔐 Enter Admin Access Code:");
});

// Join group
bot.action("JOIN_GROUP", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("🌍 Check your status first:", 
    Markup.inlineKeyboard([
      [Markup.button.callback("🔍 Check Status", "CHECK_STATUS")]
    ])
  );
});

// Support
bot.action("SUPPORT", async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { step: "support" };
  ctx.reply("💬 Send your message:");
});

// ======================
// TEXT HANDLER
// ======================
bot.on("text", async (ctx) => {
  if (ctx.chat.type !== "private") return;

  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const state = userState[userId];

  if (!state) return;

  await ctx.sendChatAction("typing");

  // ======================
  // CHECK MEMBER
  // ======================
  if (state.step === "await_member_id") {
    try {
      const res = await axios.get(
        `${process.env.SHEET_API_URL}?memberId=${encodeURIComponent(text)}`
      );

      const data = res.data;
      delete userState[userId];

      if (!data || data.status === "not_found") {
        return ctx.reply("❌ Member ID not found.");
      }

      let msg =
        `📌 *MEMBER DETAILS*\n\n` +
        `👤 Name: ${data.name}\n` +
        `🧑‍💼 Role: ${data.role}\n` +
        `🌍 State: ${data.state}\n` +
        `📊 Status: ${data.statusValue}`;

      if (data.statusValue === "Active") {
        msg += `\n\n✅ ACTIVE MEMBER`;
        msg += `\nJoin group: ${data.groupLink || "Contact admin"}`;
      } else {
        msg += `\n\n⚠️ Not active`;
      }

      if (data.passport) {
        return ctx.replyWithPhoto(data.passport, {
          caption: msg,
          parse_mode: "Markdown"
        });
      }

      return ctx.reply(msg, { parse_mode: "Markdown" });

    } catch (err) {
      console.log("DB ERROR:", err.message);
      delete userState[userId];
      return ctx.reply("❌ Database connection failed. Try again later.");
    }
  }

  // ======================
  // ADMIN CODE
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

    return ctx.reply(
      "🔐 Access granted.",
      Markup.inlineKeyboard([
        [Markup.button.callback("📩 Send Member ID", "SEND_MEMBER_ID")]
      ])
    );
  }

  // trigger button
  bot.action("SEND_MEMBER_ID", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply("📩 Enter Member ID:");
  });

  // ======================
  // ADMIN MEMBER ID
  // ======================
  if (state.step === "admin_member_id") {
    userState[userId] = {
      step: "admin_new_status",
      memberId: text,
      adminCode: state.adminCode
    };

    return ctx.reply(
      "Enter new status:",
      Markup.inlineKeyboard([
        [Markup.button.callback("🟢 Active", "STATUS_ACTIVE")],
        [Markup.button.callback("🟡 Pending", "STATUS_PENDING")],
        [Markup.button.callback("🔴 Suspended", "STATUS_SUSPENDED")],
        [Markup.button.callback("⚫ Rejected", "STATUS_REJECTED")]
      ])
    );
  }

  // ======================
  // ADMIN STATUS BUTTONS
  // ======================
  const setStatus = async (status) => {
    try {
      const res = await axios.get(
        `${process.env.SHEET_API_URL}?update=true&id=${state.memberId}&status=${status}&code=${state.adminCode}`
      );

      delete userState[userId];

      if (res.data.success) {
        return ctx.reply(
          `✅ Updated\nMember: ${state.memberId}\nStatus: ${status}`
        );
      }

      return ctx.reply("❌ Update failed.");

    } catch (err) {
      delete userState[userId];
      return ctx.reply("❌ Error updating member.");
    }
  };

  bot.action("STATUS_ACTIVE", async (ctx) => {
    await ctx.answerCbQuery();
    await setStatus("Active");
  });

  bot.action("STATUS_PENDING", async (ctx) => {
    await ctx.answerCbQuery();
    await setStatus("Pending");
  });

  bot.action("STATUS_SUSPENDED", async (ctx) => {
    await ctx.answerCbQuery();
    await setStatus("Suspended");
  });

  bot.action("STATUS_REJECTED", async (ctx) => {
    await ctx.answerCbQuery();
    await setStatus("Rejected");
  });

  // ======================
  // SUPPORT
  // ======================
  if (state.step === "support") {
    delete userState[userId];

    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `📩 SUPPORT\nFrom: @${ctx.from.username || "user"}\n\n${text}`
    );

    return ctx.reply("✅ Sent to admin.");
  }
});

// ======================
// GROUP MODERATION (UNCHANGED)
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

      await ctx.reply(`⚠️ Warning ${warnings[userId]}/3`);

      if (warnings[userId] >= 3) {
        await ctx.banChatMember(userId);
        delete warnings[userId];
      }

    } catch (err) {
      console.log(err);
    }
  }
});

// ======================
bot.launch();
console.log("🚀 ATWOPAT Bot Running...");