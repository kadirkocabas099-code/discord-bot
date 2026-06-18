// Gerekli kütüphaneleri projeye dahil ediyoruz
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, AuditLogEvent, EmbedBuilder } = require('discord.js');
const { sendLog } = require('./utils/logger');
const { sendTicketPanel, handleCreateTicket, handleCategorySelect, handleClaimTicket, handleCloseTicketPlayer, handleCloseTicketStaff, handleConfirmClose, handleCancelClose } = require('./utils/ticketSystem');
const { sendStaffCallPanel, handleCallStaff } = require('./utils/staffCall');
const { containsSwear, handleSwear, getWarnings, resetWarnings, MAX_WARNINGS } = require('./utils/warningSystem');
const { joinVoiceChannel } = require('@discordjs/voice');

const autoRoleId = process.env.AUTO_ROLE_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once('ready', async () => {
  console.log(`🤖 Botumuz hazır! Giriş yapılan hesap: ${client.user.tag}`);

  if (autoRoleId) {
    console.log(`Otomatik rol aktif. Rol ID: ${autoRoleId}`);

    for (const guild of client.guilds.cache.values()) {
      try {
        const role = await guild.roles.fetch(autoRoleId);
        if (!role) {
          console.warn(`⚠️ SUNUCU: ${guild.name} - AUTO_ROLE_ID (${autoRoleId}) geçersiz, böyle bir rol bulunamadı!`);
          continue;
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has('ManageRoles')) {
          console.warn(`⚠️ SUNUCU: ${guild.name} - Botta "Rolleri Yönet" yetkisi yok!`);
          continue;
        }

        if (botMember.roles.highest.position <= role.position) {
          console.warn(`⚠️ SUNUCU: ${guild.name} - Botun rolü (${botMember.roles.highest.name}), otomatik rolden (${role.name}) aşağıda! Rolü yukarı taşıyın.`);
          continue;
        }

        console.log(`✅ SUNUCU: ${guild.name} - Otomatik rol (${role.name}) için her şey uygun.`);
      } catch (err) {
        console.error(`⚠️ SUNUCU: ${guild.name} - Rol kontrolü başarısız:`, err.message);
      }
    }
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has('ModerateMembers')) {
        console.warn(`⚠️ SUNUCU: ${guild.name} - Botta "Üyeleri Sustur" yetkisi yok! 3 uyarıda susturma çalışmaz.`);
      } else {
        console.log(`✅ SUNUCU: ${guild.name} - Susturma yetkisi tam.`);
      }
    } catch (err) {
      console.error(`⚠️ SUNUCU: ${guild.name} - Yetki kontrolü başarısız:`, err.message);
    }
  }

  if (!autoRoleId) {
    console.warn('Uyarı: AUTO_ROLE_ID tanımlı değil, otomatik rol devre dışı.');
  }

  if (logChannelId) {
    console.log(`Log sistemi aktif. Kanal ID: ${logChannelId}`);
  } else {
    console.warn('Uyarı: LOG_CHANNEL_ID tanımlı değil, log sistemi devre dışı.');
  }

  const ticketCat = process.env.TICKET_CATEGORY_ID;
  const supportRoles = process.env.SUPPORT_ROLE_IDS;
  if (ticketCat && supportRoles) {
    console.log(`Ticket sistemi aktif. Kategori: ${ticketCat}, Destek Rolleri: ${supportRoles}`);
  } else {
    console.warn('Uyarı: TICKET_CATEGORY_ID veya SUPPORT_ROLE_IDS tanımlı değil, ticket sistemi devre dışı.');
  }

  const panelChannelId = process.env.TICKET_PANEL_CHANNEL_ID;
  if (panelChannelId) {
    try {
      const panelChannel = await client.channels.fetch(panelChannelId);
      if (panelChannel?.isTextBased()) {
        let existing = null;
        try {
          const messages = await panelChannel.messages.fetch({ limit: 20 });
          for (const msg of messages.values()) {
            if (msg.author.id === client.user.id && msg.components.length > 0) {
              existing = msg;
              break;
            }
          }
        } catch { /* mesaj alınamazsa yeni gönder */ }
        if (!existing) {
          const panelMsg = await sendTicketPanel(panelChannel);
          if (panelMsg) await panelMsg.pin().catch(() => {});
          console.log(`Ticket paneli ${panelChannel.name} kanalına gönderildi.`);
        } else {
          console.log(`Ticket paneli zaten ${panelChannel.name} kanalında duruyor.`);
        }
      }
    } catch (error) {
      console.error('Ticket paneli gönderilemedi:', error.message);
    }
  }

  const staffCallChannelId = process.env.YETKILI_CAGIR_KANAL_ID;
  if (staffCallChannelId) {
    try {
      const callChannel = await client.channels.fetch(staffCallChannelId);
      if (callChannel?.isTextBased()) {
        let existing = null;
        try {
          const messages = await callChannel.messages.fetch({ limit: 20 });
          for (const msg of messages.values()) {
            if (msg.author.id === client.user.id && msg.components.length > 0) {
              existing = msg;
              break;
            }
          }
        } catch { /* mesaj alınamazsa yeni gönder */ }
        if (!existing) {
          const panelMsg = await sendStaffCallPanel(callChannel);
          if (panelMsg) await panelMsg.pin().catch(() => {});
          console.log(`Yetkili çağırma paneli ${callChannel.name} kanalına gönderildi.`);
        } else {
          console.log(`Yetkili çağırma paneli zaten ${callChannel.name} kanalında duruyor.`);
        }
      }
    } catch (error) {
      console.error('Yetkili çağırma paneli gönderilemedi:', error.message);
    }
  } else {
    console.warn('Uyarı: YETKILI_CAGIR_KANAL_ID tanımlı değil, yetkili çağırma devre dışı.');
  }

  // Ses kanalına 5 saniye gecikmeyle bağlan (client tam oturana kadar)
  setTimeout(() => connectVoice(client), 5000);

  // Bot canlı mı kontrol etmek için heartbeat (10 dk)
  setInterval(() => {
    console.log(`💓 Bot çalışıyor - ${new Date().toLocaleString('tr-TR')}`);
  }, 600000);

  // 60 saniyede bir bot seste mi kontrol et
  setInterval(() => {
    if (!voiceConnection) return;
    const voiceChannelId = process.env.VOICE_CHANNEL_ID;
    if (!voiceChannelId) return;
    const channel = client.channels.cache.get(voiceChannelId);
    if (!channel?.isVoiceBased()) return;
    const botMember = channel.guild.members.cache.get(client.user.id);
    if (botMember && !botMember.voice.channelId) {
      console.log('🔊 Bot seste değil, yeniden bağlanıyor...');
      connectVoice(client);
    }
  }, 60000);

  // Davet cache'ini yükle
  for (const guild of client.guilds.cache.values()) {
    await cacheInvites(guild);
  }
});

// Davet takibi için cache
const inviteCache = new Map();

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
  } catch { /* yetki yoksa pass */ }
}

// Ses kanalına bağlan ve 60sn'de bir kontrol et
function connectVoice(client) {
  const voiceChannelId = process.env.VOICE_CHANNEL_ID;
  if (!voiceChannelId) return;

  // Eski bağlantıyı temizle
  if (voiceConnection) {
    try { voiceConnection.destroy(); } catch { /* */ }
    voiceConnection = null;
  }

  const guild = client.guilds.cache.find(g => {
    const ch = g.channels.cache.get(voiceChannelId);
    return ch?.isVoiceBased();
  });
  if (!guild) return;

  const channel = guild.channels.cache.get(voiceChannelId);
  if (!channel?.isVoiceBased()) return;

  try {
    voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    console.log(`🔊 Ses kanalına bağlanıldı: ${channel.name}`);
  } catch (error) {
    console.error('Sese bağlanılamadı:', error.message);
  }
}

// Sunucuya yeni biri katıldığında
client.on('guildMemberAdd', async (member) => {
  let invitedBy = null;

  try {
    const oldInvites = inviteCache.get(member.guild.id);
    if (oldInvites) {
      const newInvites = await member.guild.invites.fetch();
      for (const [, invite] of newInvites) {
        const oldUses = oldInvites.get(invite.code) ?? 0;
        if (invite.uses > oldUses) {
          invitedBy = invite.inviter;
          break;
        }
      }
    }
  } catch { /* invite alınamazsa pass */ }

  // Cache'i güncelle
  cacheInvites(member.guild);

  const fields = [
    { name: 'Kullanıcı', value: `${member.user}`, inline: true },
    { name: 'ID', value: member.id, inline: true },
    {
      name: 'Hesap Oluşturma',
      value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      inline: true,
    },
    { name: 'Toplam Üye', value: `${member.guild.memberCount}`, inline: true },
  ];

  if (invitedBy) {
    fields.push({ name: '📨 Davet Eden', value: `${invitedBy.tag}`, inline: true });
  }

  await sendLog(client, {
    title: invitedBy ? '👋 Üye Katıldı (Davetle)' : '👋 Üye Katıldı',
    description: invitedBy
      ? `${member.user.tag} sunucuya **${invitedBy.tag}** tarafından davet edilerek katıldı.`
      : `${member.user.tag} sunucuya katıldı.`,
    color: 0x57f287,
    thumbnail: member.user.displayAvatarURL(),
    fields,
  });

  if (!autoRoleId) return;

  try {
    await member.roles.add(autoRoleId);
    console.log(`${member.user.tag} kullanıcısına otomatik rol verildi.`);
  } catch (error) {
    console.error(`${member.user.tag} için rol verilemedi:`, error.message);
  }

  // DM hoş geldin mesajı
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`👋 ${member.guild.name} Sunucusuna Hoş Geldin!`)
      .setDescription('Sunucumuza katıldığın için teşekkürler! 🎉\n\nKurallarımızı okumayı unutma.\nİyi eğlenceler!')
      .setColor(0x57f287)
      .setThumbnail(member.guild.iconURL())
      .setTimestamp();
    await member.send({ embeds: [welcomeEmbed] });
  } catch { /* DM kapalıysa sorun değil */ }
});

// Sunucudan biri ayrıldığında
client.on('guildMemberRemove', async (member) => {
  await sendLog(client, {
    title: '👋 Üye Ayrıldı',
    description: `${member.user.tag} sunucudan ayrıldı.`,
    color: 0xfee75c,
    thumbnail: member.user.displayAvatarURL(),
    fields: [
      { name: 'Kullanıcı', value: `${member.user.tag}`, inline: true },
      { name: 'ID', value: member.id, inline: true },
      { name: 'Toplam Üye', value: `${member.guild.memberCount}`, inline: true },
    ],
  });
});

// Mesaj silindiğinde
client.on('messageDelete', async (message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;

  const content = message.content || '*Mesaj içeriği alınamadı*';

  await sendLog(client, {
    title: '🗑️ Mesaj Silindi',
    color: 0xed4245,
    fields: [
      { name: 'Kullanıcı', value: message.author ? `${message.author.tag}` : 'Bilinmiyor', inline: true },
      { name: 'Kanal', value: `${message.channel}`, inline: true },
      { name: 'Mesaj', value: content.slice(0, 1024) },
    ],
  });
});

// Mesaj düzenlendiğinde
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;

  const oldContent = oldMessage.content || '*Eski içerik alınamadı*';
  const newContent = newMessage.content || '*Yeni içerik alınamadı*';

  await sendLog(client, {
    title: '✏️ Mesaj Düzenlendi',
    color: 0x5865f2,
    fields: [
      { name: 'Kullanıcı', value: `${newMessage.author.tag}`, inline: true },
      { name: 'Kanal', value: `${newMessage.channel}`, inline: true },
      { name: 'Eski Mesaj', value: oldContent.slice(0, 1024) },
      { name: 'Yeni Mesaj', value: newContent.slice(0, 1024) },
      { name: 'Mesaj Linki', value: `[Git](${newMessage.url})` },
    ],
  });
});

// Biri banlandığında
client.on('guildBanAdd', async (ban) => {
  let moderator = 'Bilinmiyor';

  try {
    const auditLogs = await ban.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanAdd,
    });

    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === ban.user.id) {
      moderator = entry.executor?.tag || 'Bilinmiyor';
    }
  } catch {
    // Denetim kaydı okunamazsa moderatör bilgisi atlanır
  }

  await sendLog(client, {
    title: '🔨 Üye Banlandı',
    description: `${ban.user.tag} sunucudan banlandı.`,
    color: 0x992d22,
    thumbnail: ban.user.displayAvatarURL(),
    fields: [
      { name: 'Kullanıcı', value: `${ban.user.tag}`, inline: true },
      { name: 'ID', value: ban.user.id, inline: true },
      { name: 'Banlayan', value: moderator, inline: true },
      { name: 'Sebep', value: ban.reason || 'Sebep belirtilmedi' },
    ],
  });
});

// Ses kanalı giriş/çıkış logları
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;

  if (!member?.user?.bot) {
    if (!oldState.channelId && newState.channelId) {
      await sendLog(client, {
        title: '🔊 Ses Kanalına Katıldı',
        description: `${member.user.tag} ${newState.channel.name} kanalına katıldı.`,
        color: 0x57f287,
        thumbnail: member.user.displayAvatarURL(),
        fields: [
          { name: 'Kullanıcı', value: `${member.user}`, inline: true },
          { name: 'Kanal', value: `${newState.channel.name}`, inline: true },
        ],
      });
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(client, {
        title: '🔇 Ses Kanalından Ayrıldı',
        description: `${member.user.tag} ${oldState.channel.name} kanalından ayrıldı.`,
        color: 0xed4245,
        thumbnail: member.user.displayAvatarURL(),
        fields: [
          { name: 'Kullanıcı', value: `${member.user}`, inline: true },
          { name: 'Kanal', value: `${oldState.channel.name}`, inline: true },
        ],
      });
    }
  }
});

// Rol değişim logları
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const added = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
  const removed = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== newMember.guild.id);
  if (added.size === 0 && removed.size === 0) return;

  let moderator = 'Bilinmiyor';
  try {
    const auditLogs = await newMember.guild.fetchAuditLogs({ limit: 3, type: AuditLogEvent.MemberRoleUpdate });
    const entry = auditLogs.entries.find(e => e.target?.id === newMember.id);
    if (entry) moderator = entry.executor?.tag || 'Bilinmiyor';
  } catch { /* audit log alınamazsa */ }

  const descParts = [];
  if (added.size > 0) descParts.push(`**Eklendi:** ${added.map(r => r).join(', ')}`);
  if (removed.size > 0) descParts.push(`**Alındı:** ${removed.map(r => r).join(', ')}`);

  await sendLog(client, {
    title: '🎭 Rol Değişti',
    description: `${newMember.user.tag} kullanıcısının rolleri değiştirildi.\n${descParts.join('\n')}`,
    color: 0x5865f2,
    thumbnail: newMember.user.displayAvatarURL(),
    fields: [
      { name: 'Kullanıcı', value: `${newMember.user}`, inline: true },
      { name: 'Değiştiren', value: moderator, inline: true },
    ],
  });
});

// Reklam engelleme
function containsAd(text) {
  const adPatterns = [
    /discord\.gg\//i, /discord\.com\/invite\//i, /discordapp\.com\/invite\//i,
    /\.gg\//i, /davet\.li\//i, /davet et/i,
  ];
  return adPatterns.some(p => p.test(text));
}

// Birisi mesaj yazdığında tetiklenen fonksiyon
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (containsSwear(message.content) && message.guild) {
    await handleSwear(client, message);
    return;
  }

  if (containsAd(message.content) && message.guild) {
    try {
      await message.delete();
      await sendLog(client, {
        title: '🚫 Reklam Engellendi',
        color: 0xed4245,
        fields: [
          { name: 'Kullanıcı', value: `${message.author}`, inline: true },
          { name: 'Kanal', value: `${message.channel}`, inline: true },
          { name: 'Mesaj', value: message.content.slice(0, 500) },
        ],
      });
    } catch { /* silinemezse pass */ }
    return;
  }

  if (message.content.toLowerCase() === '!sa') {
    message.reply('Aleykümselam, hoş geldin! 👋');
  }

  if (message.content === '!ping') {
    message.reply('🏓 Pong!');
  }

  if (message.content === '!panel') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız.');
    }
    await sendTicketPanel(message.channel);
  }

  if (message.content === '!yetkili-cagir-panel') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız.');
    }
    await sendStaffCallPanel(message.channel);
  }

  if (message.content.startsWith('!uyarılar')) {
    const args = message.content.split(' ');
    const target = message.mentions.users.first() || message.author;
    const count = getWarnings(message.guild.id, target.id);
    message.reply(`${target.tag} kullanıcısının uyarı sayısı: **${count}/${MAX_WARNINGS}**`);
  }

  if (message.content.startsWith('!uyarı-sıfırla')) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız.');
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Bir kullanıcı etiketleyin.');
    resetWarnings(message.guild.id, target.id);
    message.reply(`✅ ${target.tag} kullanıcısının uyarıları sıfırlandı.`);
  }

  if (message.content.startsWith('!sustur-test')) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız.');
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Bir kullanıcı etiketleyin.');
    try {
      const member = await message.guild.members.fetch(target.id);
      const botMember = await message.guild.members.fetchMe();
      const reply = [
        `**Bot Rolü:** ${botMember.roles.highest.name} (${botMember.roles.highest.position})`,
        `**Üye Rolü:** ${member.roles.highest.name} (${member.roles.highest.position})`,
        `**Bot üstte mi?** ${botMember.roles.highest.position > member.roles.highest.position}`,
        `**ModerateMembers yetkisi:** ${botMember.permissions.has('ModerateMembers')}`,
      ].join('\n');
      await message.reply(reply);
    } catch (e) {
      message.reply(`❌ Hata: ${e.message}`);
    }
  }
});

// Ticket buton ve menü etkileşimleri
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    switch (interaction.customId) {
      case 'create_ticket':
        await handleCreateTicket(interaction);
        break;
      case 'call_staff':
        await handleCallStaff(interaction);
        break;
      case 'claim_ticket':
        await handleClaimTicket(interaction);
        break;
      case 'close_ticket_player':
        await handleCloseTicketPlayer(interaction);
        break;
      case 'close_ticket_staff':
        await handleCloseTicketStaff(interaction);
        break;
      case 'confirm_close_ticket':
        await handleConfirmClose(interaction);
        break;
      case 'cancel_close_ticket':
        await handleCancelClose(interaction);
        break;
    }
  }

  if (interaction.isStringSelectMenu()) {
    switch (interaction.customId) {
      case 'select_ticket_category':
        await handleCategorySelect(interaction);
        break;
    }
  }
});

let voiceConnection = null;

// Render'ın port taraması için basit HTTP sunucusu
const http = require('http');
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot çalışıyor.');
});
server.listen(PORT, '0.0.0.0', () => console.log(`🌐 HTTP sunucusu ${PORT} portunda hazır.`));
server.on('error', (e) => console.error('HTTP sunucu hatası:', e.message));

// Beklenmeyen hataları logla
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason?.message || reason);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Hata: .env dosyasında DISCORD_TOKEN bulunamadı.');
  process.exit(1);
}

client.login(token);


