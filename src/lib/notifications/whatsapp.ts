/**
 * WhatsApp Notification Provider Interface and Implementations.
 * Supports Meta Cloud API in production and a resilient Mock service in development/tests.
 */

export interface IWhatsAppService {
  sendTemplateMessage(
    recipientPhone: string,
    templateName: string,
    templateVariables: Record<string, string>
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  sendTextMessage(
    recipientPhone: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export class MockWhatsAppService implements IWhatsAppService {
  async sendTemplateMessage(
    recipientPhone: string,
    templateName: string,
    templateVariables: Record<string, string>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const formattedPhone = recipientPhone.startsWith("+") ? recipientPhone : `+91${recipientPhone}`;
    const mockId = `wamid.mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[MockWhatsApp] Sent template "${templateName}" to ${formattedPhone}:`, templateVariables);

    return {
      success: true,
      messageId: mockId,
    };
  }

  async sendTextMessage(
    recipientPhone: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const formattedPhone = recipientPhone.startsWith("+") ? recipientPhone : `+91${recipientPhone}`;
    const mockId = `wamid.mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[MockWhatsApp] Sent text message to ${formattedPhone}: "${text}"`);

    return {
      success: true,
      messageId: mockId,
    };
  }
}

export class MetaCloudWhatsAppService implements IWhatsAppService {
  private token: string;
  private phoneNumberId: string;

  constructor(token: string, phoneNumberId: string) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
  }

  async sendTemplateMessage(
    recipientPhone: string,
    templateName: string,
    templateVariables: Record<string, string>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanPhone = recipientPhone.replace(/\D/g, "");
      const normalizedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const components = Object.keys(templateVariables).length > 0 ? [
        {
          type: "body",
          parameters: Object.values(templateVariables).map((v) => ({
            type: "text",
            text: String(v),
          })),
        },
      ] : [];

      const res = await fetch(`https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: json.error?.message || `WhatsApp API error (${res.status})`,
        };
      }

      const messageId = json.messages?.[0]?.id || `wamid.${Date.now()}`;
      return { success: true, messageId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error contacting Meta API";
      return { success: false, error: msg };
    }
  }

  async sendTextMessage(
    recipientPhone: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanPhone = recipientPhone.replace(/\D/g, "");
      const normalizedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const res = await fetch(`https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedPhone,
          type: "text",
          text: { preview_url: false, body: text },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: json.error?.message || `WhatsApp API error (${res.status})`,
        };
      }

      const messageId = json.messages?.[0]?.id || `wamid.${Date.now()}`;
      return { success: true, messageId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error contacting Meta API";
      return { success: false, error: msg };
    }
  }
}

/**
 * Returns active WhatsApp service provider based on environment configuration.
 */
export function getWhatsAppService(): IWhatsAppService {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (token && phoneNumberId) {
    return new MetaCloudWhatsAppService(token, phoneNumberId);
  }

  return new MockWhatsAppService();
}
