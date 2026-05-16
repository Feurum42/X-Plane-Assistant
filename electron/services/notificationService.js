import axios from 'axios';

export async function sendDiscordNotification(webhookUrl, product) {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: `🔥 Price Drop: ${product.name}`,
        description: `The price has dropped to **${product.price}**! (Was ${product.oldPrice || 'Unknown'})`,
        url: product.link,
        color: 0x2ecc71,
        thumbnail: { url: product.image },
        footer: { text: 'X-Plane Addon Manager' },
        timestamp: new Date().toISOString()
      }]
    });
    return { success: true };
  } catch (err) {
    console.error('Discord notification failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function sendTelegramNotification(botToken, chatId, product) {
  if (!botToken || !chatId) return;
  const message = `🔥 *Price Drop: ${product.name}*\n\nThe price has dropped to *${product.price}*!\n\n[View on Store](${product.link})`;
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
    return { success: true };
  } catch (err) {
    console.error('Telegram notification failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function sendEmailNotification(settings, product) {
  // Simple notification log for now - in a real app we'd use nodemailer
  console.log(`[Email Notification] To: ${settings.emailRecipient} - Price Drop for ${product.name}`);
  return { success: true };
}
