const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const activeTickets = new Set();

async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Oluştur')
    .setDescription('Bir sorun yaşıyorsanız veya yardıma ihtiyacınız varsa, aşağıdaki butona tıklayarak bir ticket oluşturabilirsiniz.\n\nDestek ekibimiz en kısa sürede size yardımcı olacaktır.')
    .setColor(0x5865f2)
    .setFooter({ text: 'Ticket sistemi' });

  const button = new ButtonBuilder()
    .setCustomId('create_ticket')
    .setLabel('📩 Ticket Oluştur')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  return await channel.send({ embeds: [embed], components: [row] });
}

const TICKET_CATEGORIES = [
  { value: 'destek', label: 'Destek', emoji: '📞', description: 'Genel destek talepleri' },
  { value: 'bug', label: 'Bug & Teknik Sorunlar', emoji: '🐛', description: 'Hata raporları ve teknik sorunlar' },
  { value: 'oyunici', label: 'Oyun içi Sorunlar & Rol Hataları', emoji: '🎮', description: 'Oyun içi sorunlar ve rol hataları' },
  { value: 'anticheat', label: 'Anticheat', emoji: '🛡️', description: 'Anticheat ile ilgili sorunlar' },
  { value: 'diger', label: 'Diğer Kategoriler', emoji: '📋', description: 'Diğer tüm talepler' },
];

async function handleCreateTicket(interaction) {
  const categoryId = process.env.TICKET_CATEGORY_ID;
  if (!categoryId) {
    return interaction.reply({ content: '❌ Ticket kategorisi ayarlanmamış. Lütfen yöneticinize başvurun.', ephemeral: true });
  }

  const guild = interaction.guild;
  const user = interaction.user;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'kullanici';

  const existingChannel = guild.channels.cache.find(
    c => c.name.startsWith('ticket-') && c.name.endsWith(safeName) && c.parentId === categoryId
  );
  if (existingChannel) {
    return interaction.reply({ content: `❌ Zaten açık bir ticketiniz var: ${existingChannel}`, ephemeral: true });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_ticket_category')
    .setPlaceholder('Ticket konusunu seçin...')
    .addOptions(
      TICKET_CATEGORIES.map(cat =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setValue(cat.value)
          .setDescription(cat.description)
          .setEmoji(cat.emoji)
      )
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({ content: '📌 **Lütfen ticket konusunu seçin:**', components: [row], ephemeral: true });
}

async function handleCategorySelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const categoryId = process.env.TICKET_CATEGORY_ID;
  const supportRoleIds = (process.env.SUPPORT_ROLE_IDS || '').split(',').filter(Boolean);
  const selected = interaction.values[0];
  const categoryInfo = TICKET_CATEGORIES.find(c => c.value === selected);

  const guild = interaction.guild;
  const user = interaction.user;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'kullanici';

  await interaction.deferUpdate();

  try {
    const category = guild.channels.cache.get(categoryId);
    if (!category) {
      return interaction.editReply({ content: '❌ Ticket kategorisi bulunamadı.', components: [] });
    }

    const channel = await guild.channels.create({
      name: `ticket-${selected}-${safeName}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: user.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
        },
      ],
    });

    for (const roleId of supportRoleIds) {
      await channel.permissionOverwrites.create(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    }

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🎫 ${categoryInfo.label}`)
      .setDescription(`Merhaba ${user}! Talebiniz (${categoryInfo.label}) kategorisinde oluşturuldu.\n\nDestek ekibimiz en kısa sürede size yardımcı olacaktır. Lütfen sorununuzu detaylı bir şekilde açıklayın.`)
      .setColor(0x57f287)
      .setTimestamp();

    const claimButton = new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('👤 Yetkili Sahiplen')
      .setStyle(ButtonStyle.Success);

    const playerButton = new ButtonBuilder()
      .setCustomId('close_ticket_player')
      .setLabel('👤 Oyuncu Kapat')
      .setStyle(ButtonStyle.Secondary);

    const staffButton = new ButtonBuilder()
      .setCustomId('close_ticket_staff')
      .setLabel('🔒 Yetkili Kapat')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(claimButton, playerButton, staffButton);

    const msg = await channel.send({ content: `${user}`, embeds: [welcomeEmbed], components: [row] });
    await msg.pin().catch(() => {});


  } catch (error) {
    console.error('Ticket oluşturma hatası:', error);
    await interaction.editReply({ content: '❌ Ticket oluşturulurken bir hata oluştu.', components: [] });
  }
}

async function handleClaimTicket(interaction) {
  const supportRoleIds = (process.env.SUPPORT_ROLE_IDS || '').split(',').filter(Boolean);
  const member = interaction.member;

  const hasRole = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
  if (!hasRole) {
    return interaction.reply({ content: '❌ Bu ticketı yalnızca yetkililer sahiplenebilir.', ephemeral: true });
  }

  const channel = interaction.channel;
  if (channel.topic && channel.topic.includes('|')) {
    return interaction.reply({ content: '❌ Bu ticket zaten bir yetkili tarafından sahiplenilmiş.', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const newTopic = `${channel.topic}|${interaction.user.id}`;
    await channel.setTopic(newTopic);

    let pinMsg = null;
    try {
      const msgs = await channel.messages.fetch({ limit: 10 });
      for (const msg of msgs.values()) {
        if (msg.author.id === interaction.client.user.id && msg.components.length > 0) {
          pinMsg = msg;
          break;
        }
      }
    } catch { /* mesaj bulunamazsa */ }
    if (pinMsg) {
      const oldEmbed = pinMsg.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .addFields({ name: '👤 Sahiplenen Yetkili', value: `${interaction.user}`, inline: true });

      const claimButton = new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('👤 Yetkili Sahiplen')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

      const playerButton = new ButtonBuilder()
        .setCustomId('close_ticket_player')
        .setLabel('👤 Oyuncu Kapat')
        .setStyle(ButtonStyle.Secondary);

      const staffButton = new ButtonBuilder()
        .setCustomId('close_ticket_staff')
        .setLabel('🔒 Yetkili Kapat')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(claimButton, playerButton, staffButton);
      await pinMsg.edit({ embeds: [updatedEmbed], components: [row] });
    }

    await channel.send(`✅ ${interaction.user} bu ticketı sahiplendi!`);
    await interaction.editReply({ content: '✅ Ticket başarıyla sahiplenildi.' });
  } catch (error) {
    console.error('Ticket sahiplenme hatası:', error);
    await interaction.editReply({ content: '❌ Ticket sahiplenilirken bir hata oluştu.' });
  }
}

async function handleCloseTicketPlayer(interaction) {
  const channel = interaction.channel;
  const creatorId = channel.topic;

  if (interaction.user.id !== creatorId) {
    return interaction.reply({ content: '❌ Bu ticketi yalnızca ticket sahibi kapatabilir.', ephemeral: true });
  }

  await showCloseConfirmation(interaction);
}

async function handleCloseTicketStaff(interaction) {
  const supportRoleIds = (process.env.SUPPORT_ROLE_IDS || '').split(',').filter(Boolean);
  const member = interaction.member;

  const hasRole = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
  if (!hasRole) {
    return interaction.reply({ content: '❌ Bu ticketi yalnızca yetkililer kapatabilir.', ephemeral: true });
  }

  await showCloseConfirmation(interaction);
}

async function showCloseConfirmation(interaction) {
  const confirmEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatma')
    .setDescription('Bu ticketi kapatmak istediğinize emin misiniz?')
    .setColor(0xfee75c);

  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_close_ticket')
    .setLabel('Evet, Kapat')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_close_ticket')
    .setLabel('İptal')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
}

async function handleConfirmClose(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const logChannelId = process.env.TICKET_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;

  if (logChannelId) {
    try {
      const logChannel = await interaction.client.channels.fetch(logChannelId);
      if (logChannel?.isTextBased()) {
        const messages = await channel.messages.fetch({ limit: 50 });

        const topicParts = channel.topic ? channel.topic.split('|') : [];
        const claimerId = topicParts[1];

        const transcriptEmbed = new EmbedBuilder()
          .setTitle('📝 Ticket Kapatıldı')
          .setColor(0xed4245)
          .addFields(
            { name: 'Kanal', value: channel.name, inline: true },
            { name: 'Kapatılan', value: interaction.user.tag, inline: true },
            { name: 'Mesaj Sayısı', value: `${messages.size}`, inline: true }
          )
          .setTimestamp();

        if (claimerId) {
          transcriptEmbed.addFields({ name: '👤 Sahiplenen Yetkili', value: `<@${claimerId}>`, inline: true });
        }

        await logChannel.send({ embeds: [transcriptEmbed] });

        const transcript = messages
          .reverse()
          .map(m => `[${m.createdAt.toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content || '(medya/mesaj)'}`)
          .join('\n');

        if (transcript.length > 0) {
          await logChannel.send({
            files: [{
              attachment: Buffer.from(transcript, 'utf-8'),
              name: `transcript-${channel.name}.txt`
            }]
          });
        }
      }
    } catch (error) {
      console.error('Transcript gönderme hatası:', error);
    }
  }

  await interaction.editReply({ content: '✅ Ticket kapatılıyor...', embeds: [], components: [] });

  setTimeout(() => {
    channel.delete().catch(console.error);
  }, 3000);
}

async function handleCancelClose(interaction) {
  await interaction.update({ content: '❌ Ticket kapatma işlemi iptal edildi.', embeds: [], components: [] });
}

module.exports = { sendTicketPanel, handleCreateTicket, handleCategorySelect, handleClaimTicket, handleCloseTicketPlayer, handleCloseTicketStaff, handleConfirmClose, handleCancelClose };
