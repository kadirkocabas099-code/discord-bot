const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'warnings.json');
const MAX_WARNINGS = 3;

const SWEAR_WORDS = [
  'amk', 'aq', 'sg', 'siktir', 'sik', 'sikeyim', 'sikerim', 'anan', 'orospu',
  'piç', 'göt', 'yarrak', 'amcık', 'am', 'çük', 'bok', 'ibne', 'puşt',
  'kahpe', 'orospu çocuğu', 'sikik', 'mal', 'salak', 'aptal', 'gerizekalı',
  'oç', 'mk', 'amına', 'amına koyayım', 'sikim', 'sikeyim', 'amk malı',
  'ananı', 'babanı', 'söv', 'sövmek', 'kaşar', 'sürtük', 'fahişe',
];

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Uyarı verisi yüklenemedi:', e.message);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Uyarı verisi kaydedilemedi:', e.message);
  }
}

function getWarnings(guildId, userId) {
  const data = loadData();
  return data[guildId]?.[userId] || 0;
}

function addWarning(guildId, userId) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = 0;
  data[guildId][userId]++;
  saveData(data);
  return data[guildId][userId];
}

function resetWarnings(guildId, userId) {
  const data = loadData();
  if (data[guildId]) {
    delete data[guildId][userId];
    saveData(data);
  }
}

function containsSwear(text) {
  const normalized = text.toLowerCase()
    .replace(/[^a-zçğıöşü0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return SWEAR_WORDS.some(word => normalized.includes(word));
}

async function handleSwear(client, message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const warningCount = addWarning(guildId, userId);

  try {
    await message.delete();
  } catch {
    // Silinemezse sorun değil
  }

  const warnEmbed = new EmbedBuilder()
    .setTitle('⚠️ Uyarı')
    .setDescription(`${message.author}, küfür ettiğin için uyarıldın!`)
    .setColor(0xfee75c)
    .addFields(
      { name: 'Kullanıcı', value: `${message.author}`, inline: true },
      { name: 'Uyarı Sayısı', value: `${warningCount}/${MAX_WARNINGS}`, inline: true },
      { name: 'Mesaj', value: message.content.slice(0, 500) }
    )
    .setTimestamp();

  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (logChannelId) {
    try {
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel?.isTextBased()) {
        await logChannel.send({ embeds: [warnEmbed] });
      }
    } catch (e) {
      console.error('Uyarı log gönderilemedi:', e.message);
    }
  }

  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Uyarı Aldın')
      .setDescription(`${message.guild.name} sunucusunda küfür ettiğin için uyarıldın.\nUyarı sayın: **${warningCount}/${MAX_WARNINGS}**`)
      .setColor(0xfee75c)
      .setTimestamp();
    await message.author.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch {
    // DM kapalıysa sorun değil
  }

  console.log(`Uyarı kontrol: ${message.author.tag} - ${warningCount}/${MAX_WARNINGS}`);

  if (warningCount >= MAX_WARNINGS) {
    try {
      const member = await message.guild.members.fetch(userId);
      const botMember = await message.guild.members.fetchMe();
      console.log(`Bot rolü: ${botMember.roles.highest.name} (${botMember.roles.highest.position}), Üye rolü: ${member.roles.highest.name} (${member.roles.highest.position})`);

      if (botMember.roles.highest.position <= member.roles.highest.position) {
        console.error(`Botun rolü (${botMember.roles.highest.name}) üyenin rolünden (${member.roles.highest.name}) düşük! Susturulamaz.`);
        return warningCount;
      }

      await member.timeout(60 * 60 * 1000, '5 uyarı limitine ulaşıldı.');
      resetWarnings(guildId, userId);

      const muteEmbed = new EmbedBuilder()
        .setTitle('🔇 Susturuldu')
        .setDescription(`${message.author} ${MAX_WARNINGS} uyarı limitine ulaştığı için 1 saat susturuldu.`)
        .setColor(0xed4245)
        .setTimestamp();

      const muteLogChannel = logChannelId ? await client.channels.fetch(logChannelId).catch(() => null) : null;
      if (muteLogChannel?.isTextBased()) {
        await muteLogChannel.send({ embeds: [muteEmbed] });
      }
    } catch (e) {
      console.error(`Susturma hatası (${message.author.tag}):`, e.message);
      console.error('Detay:', e.stack?.slice(0, 200));
    }
  }

  return warningCount;
}

module.exports = { containsSwear, handleSwear, addWarning, getWarnings, resetWarnings, MAX_WARNINGS };
