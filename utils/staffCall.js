const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const cooldowns = new Set();

async function sendStaffCallPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('📢 Yetkili Çağır')
    .setDescription('Acil bir durumda veya yardıma ihtiyacınız olduğunda aşağıdaki butona tıklayarak yetkilileri çağırabilirsiniz.\n\nSpam kullanım engellenecektir.')
    .setColor(0xfee75c)
    .setFooter({ text: 'Yetkili çağırma sistemi' });

  const button = new ButtonBuilder()
    .setCustomId('call_staff')
    .setLabel('📢 Yetkili Çağır')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(button);

  return await channel.send({ embeds: [embed], components: [row] });
}

async function handleCallStaff(interaction) {
  const supportRoleIds = (process.env.SUPPORT_ROLE_IDS || '').split(',').filter(Boolean);
  const callChannelId = process.env.YETKILI_CAGIR_KANAL_ID;

  if (!callChannelId) {
    return interaction.reply({ content: '❌ Yetkili çağırma kanalı ayarlanmamış.', ephemeral: true });
  }

  if (interaction.channel.id !== callChannelId) {
    return interaction.reply({ content: `❌ Bu buton yalnızca <#${callChannelId}> kanalında kullanılabilir.`, ephemeral: true });
  }

  const userId = interaction.user.id;
  if (cooldowns.has(userId)) {
    return interaction.reply({ content: '⏳ 30 saniyede bir çağrı yapabilirsiniz. Lütfen bekleyin.', ephemeral: true });
  }

  cooldowns.add(userId);
  setTimeout(() => cooldowns.delete(userId), 30000);

  await interaction.deferReply({ ephemeral: true });

  try {
    const roleMentions = supportRoleIds.map(id => `<@&${id}>`).join(' ');
    const callEmbed = new EmbedBuilder()
      .setTitle('📢 Yetkili Çağrısı')
      .setDescription(`${interaction.user} tarafından yetkili çağrısı yapıldı!`)
      .addFields(
        { name: 'Kullanıcı', value: `${interaction.user}`, inline: true },
        { name: 'Kanal', value: `${interaction.channel}`, inline: true }
      )
      .setColor(0xed4245)
      .setTimestamp();

    await interaction.channel.send({ content: `${roleMentions}`, embeds: [callEmbed] });

    await interaction.editReply({ content: '✅ Yetkililere çağrınız iletilidi!' });
  } catch (error) {
    console.error('Yetkili çağırma hatası:', error);
    await interaction.editReply({ content: '❌ Yetkili çağrılırken bir hata oluştu.' });
  }
}

module.exports = { sendStaffCallPanel, handleCallStaff };
