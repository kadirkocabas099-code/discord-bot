const { EmbedBuilder } = require('discord.js');

const logChannelId = process.env.LOG_CHANNEL_ID;

async function sendLog(client, { title, description, color, fields = [], thumbnail }) {
  if (!logChannelId) return;

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setTimestamp();

    if (description) embed.setDescription(description);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (fields.length) embed.addFields(fields);

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Log gönderilemedi:', error.message);
  }
}

module.exports = { sendLog };
